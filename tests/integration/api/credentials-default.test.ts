import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import {
  afterAll,
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

// PATCH /api/credentials/[id]/default — the operator's choice of active model.
// Structured like the auto-refresh toggle it is modeled on: a boolean flip
// that must never demand the API key again.

process.env.CREDENTIAL_ENCRYPTION_KEY ??=
  "7d65bff94a983c4052b8fce4bbc9ed8a50c4c014fca6c22121a2662d9e9a2bea";

const auth = vi.hoisted(() => ({
  context: null as AuthContext | null,
}));

vi.mock("@/lib/auth/dal", () => ({
  requireAuthWithWorkspaceHeader: vi.fn(async () => auth.context!),
}));

const PREFIX = `cred-default-${randomUUID()}`;
let workspaceId: string;
let otherWorkspaceId: string;
let operatorId: string;

function request(body: unknown) {
  return new NextRequest("http://localhost/api/credentials/x/default", {
    method: "PATCH",
    body: JSON.stringify(body),
    headers: {
      "Content-Type": "application/json",
      "X-Inspoter-Workspace": workspaceId,
    },
  });
}

function params(id: string) {
  return { params: Promise.resolve({ id }) };
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

function llmPayload(key: string) {
  return {
    type: "OPENAI_COMPATIBLE" as const,
    baseUrl: "http://127.0.0.1:11434/v1",
    model: "llama3.1",
    apiKey: key,
    mode: "REAL" as const,
  };
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
});

beforeEach(async () => {
  auth.context = context();
  await db.activity.deleteMany({ where: { workspaceId } });
});

afterAll(async () => {
  await db.workspace.deleteMany({
    where: { id: { in: [workspaceId, otherWorkspaceId] } },
  });
  await db.operator.deleteMany({ where: { id: operatorId } });
});

describe("PATCH /api/credentials/[id]/default", () => {
  it("flags the credential and journals the change", async () => {
    const { PATCH } = await import("@/app/api/credentials/[id]/default/route");
    const credential = await credentialsService.createCredential(
      workspaceId,
      "OPENAI_COMPATIBLE",
      `${PREFIX}-a`,
      llmPayload("key-a"),
    );

    const response = await PATCH(
      request({ isDefault: true }),
      params(credential.id),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      id: credential.id,
      isDefault: true,
    });

    // recordActivity is fire-and-forget, so the row lands after the response.
    await vi.waitFor(async () => {
      const activity = await db.activity.findFirst({
        where: {
          workspaceId,
          entityType: "credential",
          entityId: credential.id,
        },
      });
      expect(activity?.details).toBe("set as default");
    });

    await credentialsService.deleteCredential(credential.id, workspaceId);
  });

  it("moves the flag off the previous default in the same category", async () => {
    const { PATCH } = await import("@/app/api/credentials/[id]/default/route");
    const first = await credentialsService.createCredential(
      workspaceId,
      "OPENAI_COMPATIBLE",
      `${PREFIX}-first`,
      llmPayload("key-first"),
    );
    const second = await credentialsService.createCredential(
      workspaceId,
      "ANTHROPIC_COMPATIBLE",
      `${PREFIX}-second`,
      {
        type: "ANTHROPIC_COMPATIBLE",
        baseUrl: "https://api.z.ai/api/anthropic",
        model: "glm-4.6",
        apiKey: "key-second",
        mode: "REAL",
      },
    );

    await PATCH(request({ isDefault: true }), params(first.id));
    await PATCH(request({ isDefault: true }), params(second.id));

    const list = await credentialsService.listCredentials(workspaceId);
    expect(list.find((c) => c.id === first.id)?.isDefault).toBe(false);
    expect(list.find((c) => c.id === second.id)?.isDefault).toBe(true);

    await credentialsService.deleteCredential(first.id, workspaceId);
    await credentialsService.deleteCredential(second.id, workspaceId);
  });

  it("clears the flag and says so in the audit trail", async () => {
    const { PATCH } = await import("@/app/api/credentials/[id]/default/route");
    const credential = await credentialsService.createCredential(
      workspaceId,
      "OPENAI_COMPATIBLE",
      `${PREFIX}-clear`,
      llmPayload("key-clear"),
    );
    await PATCH(request({ isDefault: true }), params(credential.id));

    const response = await PATCH(
      request({ isDefault: false }),
      params(credential.id),
    );

    expect(await response.json()).toMatchObject({ isDefault: false });
    // Asserted by existence rather than by "the newest row": recordActivity is
    // fire-and-forget, so the row for the first PATCH above may still be in
    // flight and clearing the table first would race with it.
    await vi.waitFor(async () => {
      const activity = await db.activity.findFirst({
        where: {
          workspaceId,
          entityType: "credential",
          entityId: credential.id,
          details: "unset as default",
        },
      });
      expect(activity).not.toBeNull();
    });

    await credentialsService.deleteCredential(credential.id, workspaceId);
  });

  it("rejects a body the schema does not accept", async () => {
    const { PATCH } = await import("@/app/api/credentials/[id]/default/route");
    const credential = await credentialsService.createCredential(
      workspaceId,
      "OPENAI_COMPATIBLE",
      `${PREFIX}-bad-body`,
      llmPayload("key-bad-body"),
    );

    const response = await PATCH(
      request({ isDefault: "yes" }),
      params(credential.id),
    );

    expect(response.status).toBe(400);
    await credentialsService.deleteCredential(credential.id, workspaceId);
  });

  it("answers 404 for a credential of another workspace", async () => {
    const { PATCH } = await import("@/app/api/credentials/[id]/default/route");
    const foreign = await credentialsService.createCredential(
      otherWorkspaceId,
      "OPENAI_COMPATIBLE",
      `${PREFIX}-foreign`,
      llmPayload("key-foreign"),
    );

    const response = await PATCH(
      request({ isDefault: true }),
      params(foreign.id),
    );

    expect(response.status).toBe(404);
    await credentialsService.deleteCredential(foreign.id, otherWorkspaceId);
  });
});
