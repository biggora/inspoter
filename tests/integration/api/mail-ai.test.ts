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
import { getOrCreateWebhookAccount } from "@/lib/services/mail-accounts";
import * as mailService from "@/lib/services/mail";

// The three AI mail routes end to end against a MOCK LLM credential.
//
// MOCK is what makes this deterministic: the driver returns the answer the
// feature itself built in src/lib/mail/ai-prompts.ts, so the assertions below
// are about the pipeline (auth, workspace scoping, validation, the audit row,
// the rate limit) rather than about a model. baseUrl deliberately points at a
// dead port — if driver selection ever regressed, this suite must fail rather
// than reach the network.

// CREDENTIAL_ENCRYPTION_KEY is not in scripts/test-env.mjs's allowlist, so it
// is set here like tests/integration/services/credentials.test.ts does.
process.env.CREDENTIAL_ENCRYPTION_KEY ??=
  "7d65bff94a983c4052b8fce4bbc9ed8a50c4c014fca6c22121a2662d9e9a2bea";

const auth = vi.hoisted(() => ({
  context: null as AuthContext | null,
}));

vi.mock("@/lib/auth/dal", () => ({
  requireAuthWithWorkspaceHeader: vi.fn(async () => auth.context!),
}));

const PREFIX = `mail-ai-${randomUUID()}`;
let workspaceId: string;
let otherWorkspaceId: string;
let operatorId: string;
let mailId: string;
let foreignMailId: string;
let credentialId: string | null = null;

function request(
  path: string,
  body: unknown,
  init?: ConstructorParameters<typeof NextRequest>[1],
) {
  return new NextRequest(`http://localhost${path}`, {
    method: "POST",
    body: JSON.stringify(body),
    ...init,
    headers: {
      "Content-Type": "application/json",
      "X-Inspoter-Workspace": workspaceId,
      ...Object.fromEntries(new Headers(init?.headers)),
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

const routes = {
  summary: () => import("@/app/api/mail/[id]/ai/summary/route"),
  replyDraft: () => import("@/app/api/mail/[id]/ai/reply-draft/route"),
  filterRule: () => import("@/app/api/mail/[id]/ai/filter-rule/route"),
};

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

beforeAll(async () => {
  const [workspace, otherWorkspace, operator] = await Promise.all([
    db.workspace.create({
      data: { name: `${PREFIX}-workspace`, slug: `${PREFIX}-workspace` },
    }),
    db.workspace.create({
      data: { name: `${PREFIX}-other`, slug: `${PREFIX}-other` },
    }),
    db.operator.create({ data: { username: `${PREFIX}-operator` } }),
  ]);
  workspaceId = workspace.id;
  otherWorkspaceId = otherWorkspace.id;
  operatorId = operator.id;
  await db.workspaceMember.create({
    data: { workspaceId, operatorId, role: "OWNER" },
  });

  await getOrCreateWebhookAccount(workspaceId);
  await getOrCreateWebhookAccount(otherWorkspaceId);

  mailId = (
    await mailService.create(workspaceId, {
      sender: "billing@vendor.example",
      subject: "Invoice 88213",
      body: "Your invoice is ready.\nDue on 2026-09-01.",
    })
  ).id;
  foreignMailId = (
    await mailService.create(otherWorkspaceId, {
      sender: "someone@elsewhere.example",
      subject: "Not yours",
      body: "Different workspace.",
    })
  ).id;
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
  await db.workspace.deleteMany({
    where: { id: { in: [workspaceId, otherWorkspaceId] } },
  });
  await db.operator.deleteMany({ where: { id: operatorId } });
});

describe("with no LLM credential configured", () => {
  it.each([
    ["summary", routes.summary],
    ["reply draft", routes.replyDraft],
    ["filter rule", routes.filterRule],
  ])("answers 501 AI_UNAVAILABLE for %s", async (_name, load) => {
    const { POST } = await load();

    const response = await POST(
      request("/api/mail/x/ai", { language: "en" }),
      params(mailId),
    );

    expect(response.status).toBe(501);
    expect(await response.json()).toEqual({ error: "AI_UNAVAILABLE" });
  });

  it("journals nothing when the layer is off", async () => {
    const { POST } = await routes.summary();
    await POST(
      request("/api/mail/x/ai/summary", { language: "en" }),
      params(mailId),
    );

    expect(
      await db.activity.count({
        where: { workspaceId, action: { startsWith: "llm_" } },
      }),
    ).toBe(0);
  });
});

describe("summary route", () => {
  beforeEach(useMockCredential);

  it("returns a summary of the requested message", async () => {
    const { POST } = await routes.summary();

    const response = await POST(
      request("/api/mail/x/ai/summary", { language: "en" }),
      params(mailId),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.summary).toContain("Invoice 88213");
    expect(body.summary).toContain("billing@vendor.example");
    expect(body.model).toBe("mock-model");
    expect(body.truncated).toBe(false);
    expect(Array.isArray(body.bullets)).toBe(true);
  });

  it("writes exactly one audit row naming the credential", async () => {
    const { POST } = await routes.summary();
    await POST(
      request("/api/mail/x/ai/summary", { language: "en" }),
      params(mailId),
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

  it("rejects a body the schema does not accept", async () => {
    const { POST } = await routes.summary();

    const missing = await POST(
      request("/api/mail/x/ai/summary", {}),
      params(mailId),
    );
    expect(missing.status).toBe(400);

    const unknownLanguage = await POST(
      request("/api/mail/x/ai/summary", { language: "de" }),
      params(mailId),
    );
    expect(unknownLanguage.status).toBe(400);
  });

  it("answers 404 for an unknown message", async () => {
    const { POST } = await routes.summary();

    const response = await POST(
      request("/api/mail/x/ai/summary", { language: "en" }),
      params("does-not-exist"),
    );

    expect(response.status).toBe(404);
  });

  it("answers 404 for a message of another workspace", async () => {
    const { POST } = await routes.summary();

    const response = await POST(
      request("/api/mail/x/ai/summary", { language: "en" }),
      params(foreignMailId),
    );

    expect(response.status).toBe(404);
  });
});

describe("reply draft route", () => {
  beforeEach(useMockCredential);

  it("returns body text for the composer without saving a draft", async () => {
    const { POST } = await routes.replyDraft();
    const draftsBefore = await db.mailItem.count({ where: { workspaceId } });

    const response = await POST(
      request("/api/mail/x/ai/reply-draft", { language: "en" }),
      params(mailId),
    );

    expect(response.status).toBe(200);
    expect((await response.json()).bodyText).toContain("Invoice 88213");
    // The model proposes, the operator confirms: nothing was persisted.
    expect(await db.mailItem.count({ where: { workspaceId } })).toBe(
      draftsBefore,
    );
  });

  it("accepts an optional operator instruction", async () => {
    const { POST } = await routes.replyDraft();

    const response = await POST(
      request("/api/mail/x/ai/reply-draft", {
        language: "en",
        instruction: "ask for a PDF copy",
      }),
      params(mailId),
    );

    expect(response.status).toBe(200);
  });

  it("rejects an over-long instruction", async () => {
    const { POST } = await routes.replyDraft();

    const response = await POST(
      request("/api/mail/x/ai/reply-draft", {
        language: "en",
        instruction: "x".repeat(501),
      }),
      params(mailId),
    );

    expect(response.status).toBe(400);
  });
});

describe("filter rule route", () => {
  beforeEach(useMockCredential);

  it("proposes conditions built on the sender domain and creates no rule", async () => {
    const { POST } = await routes.filterRule();
    const rulesBefore = await db.mailFilterRule.count({
      where: { workspaceId },
    });

    const response = await POST(
      request("/api/mail/x/ai/filter-rule", { language: "en" }),
      params(mailId),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.conditions).toEqual([
      {
        field: "FROM_DOMAIN",
        operator: "EQUALS",
        value: "vendor.example",
        isNegated: false,
      },
    ]);
    expect(body.droppedConditions).toBe(0);
    expect(body.matchMode).toBe("ALL");
    // No label, no folder, no identifier — the operator supplies those.
    expect(body).not.toHaveProperty("labelId");
    expect(await db.mailFilterRule.count({ where: { workspaceId } })).toBe(
      rulesBefore,
    );
  });
});

describe("rate limit", () => {
  beforeEach(useMockCredential);

  it("answers 429 once the workspace window is exhausted", async () => {
    const { POST } = await routes.summary();
    const limit = Number(process.env.LLM_CALL_RATE_LIMIT ?? 60);

    let lastStatus = 0;
    // One past the limit: the window is per workspace and process-local, and
    // this workspace id is unique to this file.
    for (let attempt = 0; attempt <= limit; attempt += 1) {
      const response = await POST(
        request("/api/mail/x/ai/summary", { language: "en" }),
        params(mailId),
      );
      lastStatus = response.status;
    }

    expect(lastStatus).toBe(429);
    const body = await (
      await POST(
        request("/api/mail/x/ai/summary", { language: "en" }),
        params(mailId),
      )
    ).json();
    expect(body).toEqual({ error: "AI_RATE_LIMIT" });
  });
});
