import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { toErrorResponse } from "@/lib/api/errors";

// A workspace deleted while another request is reading it. Prisma loads an
// `include: { workspace: true }` with a second query, so a delete that commits
// between the membership read and the workspace read used to hand back a
// membership whose `workspace` is null: `GET /api/indicators` crashed on
// `workspace.id`, and `/api/workspaces` fed the switcher a null entry that
// crashed the page. The race is forced deterministically: a second connection
// holds an exclusive lock on "Workspace" (membership reads still pass, any
// read of "Workspace" waits), deletes the workspace once the lookup is waiting
// on the lock, and commits.

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === "session" ? { name, value: seededSessionId } : undefined,
  }),
}));

const PREFIX = `ws-deleted-race-${randomUUID()}`;
let seededSessionId = "";
let operatorId: string;
let keptWorkspaceId: string;

async function createWorkspace(suffix: string) {
  return db.workspace.create({
    data: {
      name: `${PREFIX}-${suffix}`,
      slug: `${PREFIX}-${suffix}`,
      members: { create: { operatorId, role: "OWNER" } },
    },
  });
}

// Runs `read` while "Workspace" is locked, deletes `workspaceId` as soon as
// `read` waits on that lock, then releases it and returns what `read` settled
// with.
async function deleteDuringRead<T>(
  workspaceId: string,
  read: () => Promise<T>,
): Promise<PromiseSettledResult<T>> {
  const locker = new Client({ connectionString: process.env.DATABASE_URL });
  await locker.connect();
  try {
    await locker.query("BEGIN");
    await locker.query('LOCK TABLE "Workspace" IN ACCESS EXCLUSIVE MODE');
    const pending = read().then(
      (value) => ({ status: "fulfilled", value }) as const,
      (reason: unknown) => ({ status: "rejected", reason }) as const,
    );

    const deadline = Date.now() + 10_000;
    for (;;) {
      const { rows } = await locker.query<{ waiting: number }>(
        `SELECT count(*)::int AS waiting FROM pg_locks
          WHERE NOT granted AND relation = '"Workspace"'::regclass`,
      );
      if (rows[0].waiting > 0) break;
      if (Date.now() > deadline) {
        throw new Error("the lookup never waited on the Workspace lock");
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    await locker.query('DELETE FROM "Workspace" WHERE id = $1', [workspaceId]);
    await locker.query("COMMIT");
    return await pending;
  } finally {
    await locker.end();
  }
}

beforeAll(async () => {
  const operator = await db.operator.create({
    data: { username: `${PREFIX}-operator`, passwordHash: "unused" },
  });
  operatorId = operator.id;
  keptWorkspaceId = (await createWorkspace("kept")).id;
  const session = await db.session.create({
    data: {
      id: randomUUID(),
      operatorId,
      expiresAt: new Date(Date.now() + 60_000),
    },
  });
  seededSessionId = session.id;
});

afterAll(async () => {
  await db.session.deleteMany({ where: { operatorId } });
  await db.workspace.deleteMany({
    where: { members: { some: { operatorId } } },
  });
  await db.operator.deleteMany({ where: { id: operatorId } });
});

describe("a workspace deleted mid-request", () => {
  it("answers the header selector with the 403, not a null workspace", async () => {
    const { requireWorkspaceFromHeader } = await import("@/lib/auth/dal");
    const doomed = await createWorkspace("header");
    const request = new NextRequest("http://localhost/api/indicators", {
      headers: { "x-inspoter-workspace": doomed.id },
    });

    const result = await deleteDuringRead(doomed.id, () =>
      requireWorkspaceFromHeader(request),
    );

    expect(result.status).toBe("rejected");
    if (result.status !== "rejected") return;
    expect(toErrorResponse(result.reason).status).toBe(403);
  });

  it("drops the workspace from the operator's list instead of a null entry", async () => {
    const { listForOperator } = await import("@/lib/services/workspaces");
    const doomed = await createWorkspace("list");

    const result = await deleteDuringRead(doomed.id, () =>
      listForOperator(operatorId),
    );

    expect(result.status).toBe("fulfilled");
    if (result.status !== "fulfilled") return;
    expect(result.value.map((workspace) => workspace?.id)).toEqual([
      keptWorkspaceId,
    ]);
  });

  it("falls back past the vanished workspace for the last-used landing", async () => {
    const { resolveLastUsedWorkspace } = await import("@/lib/auth/dal");
    const doomed = await createWorkspace("last-used");
    await db.session.update({
      where: { id: seededSessionId },
      data: {
        activeWorkspaceId: doomed.id,
        activeWorkspaceOperatorId: operatorId,
      },
    });

    const result = await deleteDuringRead(doomed.id, () =>
      resolveLastUsedWorkspace(),
    );

    expect(result.status).toBe("fulfilled");
    if (result.status !== "fulfilled") return;
    expect(result.value?.id).toBe(keptWorkspaceId);
  });
});
