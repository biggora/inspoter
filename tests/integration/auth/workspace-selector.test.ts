import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { toErrorResponse } from "@/lib/api/errors";
import type { AuthContext } from "@/lib/auth/dal";

// Slice 1 of docs/plans/workspace-in-url.md: the header / query parameter as a
// workspace *selector* (requireWorkspaceFrom*), next to the live stale-tab
// guard (requireAuthWith*) whose 409 semantics stay as they are. Pattern of
// session-contract.test.ts: a real Session row behind a mocked cookie jar.

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === "session" ? { name, value: seededSessionId } : undefined,
  }),
}));

const PREFIX = `ws-selector-${randomUUID()}`;
let seededSessionId = "";
let operatorId: string;
let workspaceA: { id: string };
let workspaceB: { id: string };
let foreignWorkspace: { id: string };
const extraOperatorIds: string[] = [];

function headerRequest(value: string | null): NextRequest {
  const headers = new Headers();
  if (value !== null) headers.set("x-inspoter-workspace", value);
  return new NextRequest("http://localhost/api/x", { headers });
}

function paramRequest(value: string): NextRequest {
  const url = new URL("http://localhost/api/x");
  url.searchParams.set("workspace", value);
  return new NextRequest(url);
}

// What a route handler would answer for this guard call.
async function outcome(call: Promise<AuthContext>) {
  try {
    const { workspace } = await call;
    return { status: 200, workspaceId: workspace.id };
  } catch (error) {
    const response = toErrorResponse(error);
    return { status: response.status, body: await response.json() };
  }
}

async function sessionActiveWorkspaceId() {
  const session = await db.session.findUniqueOrThrow({
    where: { id: seededSessionId },
  });
  return session.activeWorkspaceId;
}

beforeAll(async () => {
  const operator = await db.operator.create({
    data: { username: `${PREFIX}-operator`, passwordHash: "unused" },
  });
  operatorId = operator.id;
  const foreignOperator = await db.operator.create({
    data: { username: `${PREFIX}-foreign`, passwordHash: "unused" },
  });
  extraOperatorIds.push(foreignOperator.id);

  [workspaceA, workspaceB] = await Promise.all(
    ["a", "b"].map((suffix) =>
      db.workspace.create({
        data: {
          name: `${PREFIX}-${suffix}`,
          slug: `${PREFIX}-${suffix}`,
          members: { create: { operatorId, role: "OWNER" } },
        },
      }),
    ),
  );
  foreignWorkspace = await db.workspace.create({
    data: {
      name: `${PREFIX}-foreign`,
      slug: `${PREFIX}-foreign`,
      members: { create: { operatorId: foreignOperator.id, role: "OWNER" } },
    },
  });

  const session = await db.session.create({
    data: {
      id: randomUUID(),
      operatorId,
      activeWorkspaceId: workspaceA.id,
      activeWorkspaceOperatorId: operatorId,
      expiresAt: new Date(Date.now() + 60_000),
    },
  });
  seededSessionId = session.id;
});

afterAll(async () => {
  const operatorIds = [operatorId, ...extraOperatorIds];
  await db.session.deleteMany({ where: { operatorId: { in: operatorIds } } });
  await db.workspace.deleteMany({
    where: { id: { in: [workspaceA.id, workspaceB.id, foreignWorkspace.id] } },
  });
  await db.operator.deleteMany({ where: { id: { in: operatorIds } } });
});

describe("requireWorkspaceFromHeader / requireWorkspaceFromParam (selector)", () => {
  it("selects workspace A and B by header on one session without touching the session", async () => {
    const { requireWorkspaceFromHeader } = await import("@/lib/auth/dal");

    const a = await requireWorkspaceFromHeader(headerRequest(workspaceA.id));
    const b = await requireWorkspaceFromHeader(headerRequest(workspaceB.id));
    const aAgain = await requireWorkspaceFromHeader(
      headerRequest(workspaceA.id),
    );

    expect(a.workspace.id).toBe(workspaceA.id);
    expect(b.workspace.id).toBe(workspaceB.id);
    expect(aAgain.workspace.id).toBe(workspaceA.id);
    expect(b.operator.id).toBe(operatorId);
    expect(await sessionActiveWorkspaceId()).toBe(workspaceA.id);
  });

  it("selects the workspace named by the query parameter, session untouched", async () => {
    const { requireWorkspaceFromParam } = await import("@/lib/auth/dal");

    const b = await requireWorkspaceFromParam(paramRequest(workspaceB.id));

    expect(b.workspace.id).toBe(workspaceB.id);
    expect(await sessionActiveWorkspaceId()).toBe(workspaceA.id);
  });

  it("answers a non-member workspace id and an unknown id with the identical 403 WORKSPACE_ACCESS_DENIED", async () => {
    const { requireWorkspaceFromHeader } = await import("@/lib/auth/dal");

    const nonMember = await outcome(
      requireWorkspaceFromHeader(headerRequest(foreignWorkspace.id)),
    );
    const unknown = await outcome(
      requireWorkspaceFromHeader(headerRequest(`missing-${randomUUID()}`)),
    );

    expect(nonMember.status).toBe(403);
    expect(nonMember.body).toMatchObject({ error: "WORKSPACE_ACCESS_DENIED" });
    expect(unknown).toEqual(nonMember);
    expect(await sessionActiveWorkspaceId()).toBe(workspaceA.id);
  });

  it("answers a missing header with 400 WORKSPACE_CONTEXT_REQUIRED", async () => {
    const { requireWorkspaceFromHeader } = await import("@/lib/auth/dal");

    const result = await outcome(
      requireWorkspaceFromHeader(headerRequest(null)),
    );

    expect(result.status).toBe(400);
    expect(result.body).toMatchObject({ error: "WORKSPACE_CONTEXT_REQUIRED" });
  });
});

describe("requireAuthWithWorkspaceHeader (live stale-tab guard)", () => {
  it.each([
    ["an empty", ""],
    ["a non-ASCII", "wörkspace"],
    ["a 129-byte", "a".repeat(129)],
  ])(
    "answers %s header with 400 WORKSPACE_CONTEXT_REQUIRED",
    async (_label, value) => {
      const { requireAuthWithWorkspaceHeader } = await import("@/lib/auth/dal");

      const result = await outcome(
        requireAuthWithWorkspaceHeader(headerRequest(value)),
      );

      expect(result.status).toBe(400);
      expect(result.body).toMatchObject({
        error: "WORKSPACE_CONTEXT_REQUIRED",
      });
    },
  );

  it("answers the matching workspace id with 200", async () => {
    const { requireAuthWithWorkspaceHeader } = await import("@/lib/auth/dal");

    const result = await outcome(
      requireAuthWithWorkspaceHeader(headerRequest(workspaceA.id)),
    );

    expect(result).toEqual({ status: 200, workspaceId: workspaceA.id });
  });

  it("still answers a mismatching workspace id with 409 WORKSPACE_CONTEXT_STALE", async () => {
    const { requireAuthWithWorkspaceHeader } = await import("@/lib/auth/dal");

    const result = await outcome(
      requireAuthWithWorkspaceHeader(headerRequest(workspaceB.id)),
    );

    expect(result.status).toBe(409);
    expect(result.body).toMatchObject({ error: "WORKSPACE_CONTEXT_STALE" });
    expect(await sessionActiveWorkspaceId()).toBe(workspaceA.id);
  });
});

describe("/api/workspaces/default is operator-level", () => {
  it("clears the default for an operator that has no workspace membership", async () => {
    const lonely = await db.operator.create({
      data: { username: `${PREFIX}-lonely`, passwordHash: "unused" },
    });
    extraOperatorIds.push(lonely.id);
    const previousSessionId = seededSessionId;
    const session = await db.session.create({
      data: {
        id: randomUUID(),
        operatorId: lonely.id,
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
    seededSessionId = session.id;

    try {
      const { DELETE } = await import("@/app/api/workspaces/default/route");
      const response = await DELETE();
      expect(response.status).toBe(204);
    } finally {
      seededSessionId = previousSessionId;
    }
  });
});
