import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type { AuthContext } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import * as credentialsService from "@/lib/services/credentials";
import { FIELD_MAX_CHARS } from "@/lib/agents/authoring-prompts";

// The authoring assistant route end to end against a MOCK LLM credential.
//
// MOCK is what makes this deterministic: the driver returns the answer the
// feature itself built in src/lib/agents/authoring-prompts.ts, so what is
// asserted below is the pipeline — auth, validation, the trim, the audit row —
// rather than a model. baseUrl points at a dead port, so a regression in
// driver selection fails this suite instead of reaching the network.
//
// There is deliberately no 404 case and no other-workspace case: unlike the
// mail AI routes this one loads no row at all, so there is nothing to scope.

// CREDENTIAL_ENCRYPTION_KEY is not in scripts/test-env.mjs's allowlist, so it
// is set here like tests/integration/api/mail-ai.test.ts does.
process.env.CREDENTIAL_ENCRYPTION_KEY ??=
  "7d65bff94a983c4052b8fce4bbc9ed8a50c4c014fca6c22121a2662d9e9a2bea";

const auth = vi.hoisted(() => ({
  context: null as AuthContext | null,
}));

vi.mock("@/lib/auth/dal", () => ({
  requireAuthWithWorkspaceHeader: vi.fn(async () => auth.context!),
}));

const PREFIX = `agents-ai-${randomUUID()}`;
let workspaceId: string;
let operatorId: string;
let credentialId: string | null = null;

const loadRoute = () => import("@/app/api/agents/ai/draft/route");

function request(body: unknown) {
  return new NextRequest("http://localhost/api/agents/ai/draft", {
    method: "POST",
    body: JSON.stringify(body),
    headers: {
      "Content-Type": "application/json",
      "X-Inspoter-Workspace": workspaceId,
    },
  });
}

function context(): AuthContext {
  return {
    workspace: {
      id: workspaceId,
      name: `${PREFIX}-workspace`,
      slug: `${PREFIX}-workspace`,
      hiddenSections: [],
      timeZone: "UTC",
      autoRefreshDisabledKinds: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    operator: {
      id: operatorId,
      username: `${PREFIX}-operator`,
      email: null,
      passwordHash: null,
      defaultWorkspaceId: null,
      createdAt: new Date(),
    },
  };
}

async function useMockCredential(): Promise<void> {
  const credential = await credentialsService.createCredential(
    workspaceId,
    "OPENAI_COMPATIBLE",
    `${PREFIX}-model`,
    {
      type: "OPENAI_COMPATIBLE",
      // Port 9 is the discard service: nothing can answer there.
      baseUrl: "http://127.0.0.1:9/v1",
      model: "mock-model",
      apiKey: "mock-key",
      mode: "MOCK",
    },
  );
  credentialId = credential.id;
}

beforeAll(async () => {
  const [workspace, operator] = await Promise.all([
    db.workspace.create({
      data: { name: `${PREFIX}-workspace`, slug: `${PREFIX}-workspace` },
    }),
    db.operator.create({ data: { username: `${PREFIX}-operator` } }),
  ]);
  workspaceId = workspace.id;
  operatorId = operator.id;
  await db.workspaceMember.create({
    data: { workspaceId, operatorId, role: "OWNER" },
  });
});

beforeEach(() => {
  auth.context = context();
});

afterEach(async () => {
  if (credentialId) {
    await credentialsService
      .deleteCredential(credentialId, workspaceId)
      .catch(() => {});
    credentialId = null;
  }
  await db.activity.deleteMany({ where: { workspaceId } });
});

afterAll(async () => {
  await db.workspace.deleteMany({ where: { id: workspaceId } });
  await db.operator.deleteMany({ where: { id: operatorId } });
});

describe("with no LLM credential configured", () => {
  it("answers 501 AI_UNAVAILABLE", async () => {
    const { POST } = await loadRoute();

    const response = await POST(
      request({
        kind: "AGENT",
        field: "instructions",
        language: "en",
        name: "Night watch",
      }),
    );

    expect(response.status).toBe(501);
    expect(await response.json()).toEqual({ error: "AI_UNAVAILABLE" });
  });

  it("journals nothing when the layer is off", async () => {
    const { POST } = await loadRoute();
    await POST(
      request({
        kind: "SKILL",
        field: "description",
        language: "en",
        name: "Log triage",
      }),
    );

    expect(
      await db.activity.count({
        where: { workspaceId, action: { startsWith: "llm_" } },
      }),
    ).toBe(0);
  });
});

describe("with a MOCK credential", () => {
  beforeEach(useMockCredential);

  it.each([
    ["AGENT", "description"],
    ["AGENT", "instructions"],
    ["SKILL", "description"],
    ["SKILL", "instructions"],
  ] as const)("drafts the %s %s", async (kind, field) => {
    const { POST } = await loadRoute();

    const response = await POST(
      request({ kind, field, language: "en", name: "Night watch" }),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.model).toBe("mock-model");
    expect(body.trimmed).toBe(false);
    // The mock echoes the brief, which is how this asserts the answer came
    // from the prompt this request built.
    expect(body.text).toContain("Night watch");
    expect(body.text.length).toBeLessThanOrEqual(FIELD_MAX_CHARS[kind][field]);
  });

  // The schema accepts the whole brief whatever the field; which parts of it
  // reach the prompt is buildDraftContext's decision, asserted in
  // tests/unit/agents/authoring-prompts.test.ts.
  it("accepts a full brief for a description draft", async () => {
    const { POST } = await loadRoute();

    const response = await POST(
      request({
        kind: "AGENT",
        field: "description",
        language: "en",
        name: "Night watch",
        description: "Reports what broke overnight.",
        instructions: "Read the logs, then the alerts.",
      }),
    );

    expect(response.status).toBe(200);
  });

  it("writes exactly one audit row naming the credential", async () => {
    const { POST } = await loadRoute();
    await POST(
      request({
        kind: "AGENT",
        field: "description",
        language: "en",
        name: "Night watch",
      }),
    );

    // recordActivity is fire-and-forget, so the row lands after the response.
    await vi.waitFor(async () => {
      const activities = await db.activity.findMany({
        where: { workspaceId, action: "llm_complete" },
      });
      expect(activities).toHaveLength(1);
      expect(activities[0]).toMatchObject({
        entityType: "llm_provider",
        entityId: credentialId,
      });
      expect(JSON.parse(activities[0].details ?? "{}")).toMatchObject({
        mode: "mock",
        model: "mock-model",
      });
    });
  });

  it.each([
    ["a missing name", { kind: "AGENT", field: "description", language: "en" }],
    [
      "a blank name",
      { kind: "AGENT", field: "description", language: "en", name: "  " },
    ],
    [
      "an unknown kind",
      { kind: "TEAM", field: "description", language: "en", name: "x" },
    ],
    [
      "an unknown field",
      { kind: "AGENT", field: "scopes", language: "en", name: "x" },
    ],
    [
      "an unknown language",
      { kind: "AGENT", field: "description", language: "de", name: "x" },
    ],
    [
      "a key the dialog never sends",
      {
        kind: "AGENT",
        field: "description",
        language: "en",
        name: "x",
        scopes: ["logs:read"],
      },
    ],
  ])("rejects %s with 400", async (_name, body) => {
    const { POST } = await loadRoute();

    expect((await POST(request(body))).status).toBe(400);
  });
});
