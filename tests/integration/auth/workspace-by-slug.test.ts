import { randomUUID } from "node:crypto";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { workAsyncStorage } from "next/dist/server/app-render/work-async-storage.external";
import type { WorkStore } from "next/dist/server/app-render/work-async-storage.external";
import { db } from "@/lib/db";

// Slice 1 of docs/plans/workspace-in-url.md: requireWorkspaceBySlug() and
// resolveLastUsedWorkspace(). notFound() is the project-wide test mock
// (tests/setup.integration.ts), which throws Error("notFound").

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === "session" ? { name, value: seededSessionId } : undefined,
  }),
}));

const PREFIX = `ws-slug-${randomUUID()}`;
let seededSessionId = "";
let operatorId: string;
let foreignOperatorId: string;
let workspaceA: { id: string; slug: string };
let workspaceB: { id: string; slug: string };
let foreignWorkspace: { id: string; slug: string };

async function sessionActiveWorkspaceId() {
  const session = await db.session.findUniqueOrThrow({
    where: { id: seededSessionId },
  });
  return session.activeWorkspaceId;
}

beforeAll(async () => {
  operatorId = (
    await db.operator.create({
      data: { username: `${PREFIX}-operator`, passwordHash: "unused" },
    })
  ).id;
  foreignOperatorId = (
    await db.operator.create({
      data: { username: `${PREFIX}-foreign`, passwordHash: "unused" },
    })
  ).id;

  // Sequential: A must be the operator's earliest membership.
  workspaceA = await db.workspace.create({
    data: {
      name: `${PREFIX}-a`,
      slug: `${PREFIX}-a`,
      members: { create: { operatorId, role: "OWNER" } },
    },
  });
  workspaceB = await db.workspace.create({
    data: {
      name: `${PREFIX}-b`,
      slug: `${PREFIX}-b`,
      members: { create: { operatorId, role: "OWNER" } },
    },
  });
  foreignWorkspace = await db.workspace.create({
    data: {
      name: `${PREFIX}-foreign`,
      slug: `${PREFIX}-foreign`,
      members: { create: { operatorId: foreignOperatorId, role: "OWNER" } },
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
  const operatorIds = [operatorId, foreignOperatorId];
  await db.session.deleteMany({ where: { operatorId: { in: operatorIds } } });
  await db.workspace.deleteMany({
    where: { id: { in: [workspaceA.id, workspaceB.id, foreignWorkspace.id] } },
  });
  await db.operator.deleteMany({ where: { id: { in: operatorIds } } });
});

describe("requireWorkspaceBySlug", () => {
  it("returns the member's workspace and operator, leaving last-used alone when it already matches", async () => {
    const { requireWorkspaceBySlug } = await import("@/lib/auth/dal");

    const { operator, workspace } = await requireWorkspaceBySlug(
      workspaceA.slug,
    );

    expect(operator.id).toBe(operatorId);
    expect(workspace.id).toBe(workspaceA.id);
    expect(await sessionActiveWorkspaceId()).toBe(workspaceA.id);
  });

  it("records a different member workspace as the session's last used one", async () => {
    const { requireWorkspaceBySlug } = await import("@/lib/auth/dal");

    const { workspace } = await requireWorkspaceBySlug(workspaceB.slug);

    expect(workspace.id).toBe(workspaceB.id);
    const session = await db.session.findUniqueOrThrow({
      where: { id: seededSessionId },
    });
    expect(session.activeWorkspaceId).toBe(workspaceB.id);
    expect(session.activeWorkspaceOperatorId).toBe(operatorId);
  });

  it("calls notFound() for a workspace the operator is not a member of, without moving last-used", async () => {
    const { requireWorkspaceBySlug } = await import("@/lib/auth/dal");
    const before = await sessionActiveWorkspaceId();

    await expect(requireWorkspaceBySlug(foreignWorkspace.slug)).rejects.toThrow(
      "notFound",
    );
    expect(await sessionActiveWorkspaceId()).toBe(before);
  });

  it("calls notFound() for an unknown slug, without moving last-used", async () => {
    const { requireWorkspaceBySlug } = await import("@/lib/auth/dal");
    const before = await sessionActiveWorkspaceId();

    await expect(
      requireWorkspaceBySlug(`missing-${randomUUID()}`),
    ).rejects.toThrow("notFound");
    expect(await sessionActiveWorkspaceId()).toBe(before);
  });
});

// Next hides the prefetch headers from headers(); a render learns it is a router
// prefetch (next-router-prefetch: 1) only from the work store's
// isPrefetchRequest, which these tests set the way Next's renderer does.
describe("requireWorkspaceBySlug and router prefetches", () => {
  // Outside a Next render the store is a stub that cannot run(); stand in for
  // the store Next's renderer would have provided.
  function inRender<T>(isPrefetchRequest: boolean, run: () => Promise<T>) {
    const getStore = vi
      .spyOn(workAsyncStorage, "getStore")
      .mockReturnValue({ isPrefetchRequest } as WorkStore);
    return run().finally(() => getStore.mockRestore());
  }

  beforeEach(async () => {
    await db.session.update({
      where: { id: seededSessionId },
      data: {
        activeWorkspaceId: workspaceA.id,
        activeWorkspaceOperatorId: operatorId,
      },
    });
  });

  it("returns the workspace but leaves last-used alone for a prefetch render", async () => {
    const { requireWorkspaceBySlug } = await import("@/lib/auth/dal");

    const { workspace } = await inRender(true, () =>
      requireWorkspaceBySlug(workspaceB.slug),
    );

    expect(workspace.id).toBe(workspaceB.id);
    expect(await sessionActiveWorkspaceId()).toBe(workspaceA.id);
  });

  it("still answers notFound() for a prefetch of a foreign workspace", async () => {
    const { requireWorkspaceBySlug } = await import("@/lib/auth/dal");

    await expect(
      inRender(true, () => requireWorkspaceBySlug(foreignWorkspace.slug)),
    ).rejects.toThrow("notFound");
  });

  it("records last-used for a real navigation render", async () => {
    const { requireWorkspaceBySlug } = await import("@/lib/auth/dal");

    await inRender(false, () => requireWorkspaceBySlug(workspaceB.slug));

    expect(await sessionActiveWorkspaceId()).toBe(workspaceB.id);
  });
});

describe("resolveLastUsedWorkspace", () => {
  async function setState(
    sessionWorkspaceId: string | null,
    defaultWorkspaceId: string | null,
  ) {
    await db.session.update({
      where: { id: seededSessionId },
      data: {
        activeWorkspaceId: sessionWorkspaceId,
        activeWorkspaceOperatorId: sessionWorkspaceId ? operatorId : null,
      },
    });
    await db.operator.update({
      where: { id: operatorId },
      data: { defaultWorkspaceId },
    });
  }

  it("prefers the session's workspace, then the operator default, then the first membership, never writing", async () => {
    const { resolveLastUsedWorkspace } = await import("@/lib/auth/dal");

    // Session = A, default = B -> the session wins.
    await setState(workspaceA.id, workspaceB.id);
    expect((await resolveLastUsedWorkspace())?.id).toBe(workspaceA.id);
    expect(await sessionActiveWorkspaceId()).toBe(workspaceA.id);

    // Session = B, default = A -> the session still wins.
    await setState(workspaceB.id, workspaceA.id);
    expect((await resolveLastUsedWorkspace())?.id).toBe(workspaceB.id);

    // No session workspace, default = B -> the default (not the earliest).
    await setState(null, workspaceB.id);
    expect((await resolveLastUsedWorkspace())?.id).toBe(workspaceB.id);

    // Neither -> earliest membership (A was joined first).
    await setState(null, null);
    expect((await resolveLastUsedWorkspace())?.id).toBe(workspaceA.id);

    expect(await sessionActiveWorkspaceId()).toBeNull();
  });

  it("returns null for an operator with no membership", async () => {
    const { resolveLastUsedWorkspace } = await import("@/lib/auth/dal");
    const lonely = await db.operator.create({
      data: { username: `${PREFIX}-lonely`, passwordHash: "unused" },
    });
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
      expect(await resolveLastUsedWorkspace()).toBeNull();
    } finally {
      seededSessionId = previousSessionId;
      await db.session.delete({ where: { id: session.id } });
      await db.operator.delete({ where: { id: lonely.id } });
    }
  });
});
