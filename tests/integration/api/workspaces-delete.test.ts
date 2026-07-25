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
import type { Operator } from "@/generated/prisma/client";
import { db } from "@/lib/db";

const auth = vi.hoisted(() => ({
  context: null as AuthContext | null,
}));

vi.mock("@/lib/auth/dal", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/dal")>();
  return {
    ...actual,
    requireAuthWithWorkspaceHeader: vi.fn(async () => auth.context!),
  };
});

const PREFIX = `workspace-delete-${randomUUID()}`;
let operator: Operator;
let keeperWorkspaceId: string;
let targetWorkspaceId: string;

function request(path: string) {
  return new NextRequest(`http://localhost${path}`, {
    method: "DELETE",
    headers: { "X-Inspoter-Workspace": keeperWorkspaceId },
  });
}

beforeAll(async () => {
  operator = await db.operator.create({
    data: { username: `${PREFIX}-operator` },
  });
  const [keeper, target] = await Promise.all([
    db.workspace.create({
      data: {
        name: `${PREFIX}-keeper`,
        slug: `${PREFIX}-keeper`,
        members: { create: { operatorId: operator.id, role: "OWNER" } },
      },
    }),
    db.workspace.create({
      data: {
        name: `${PREFIX}-target`,
        slug: `${PREFIX}-target`,
        members: { create: { operatorId: operator.id, role: "OWNER" } },
      },
    }),
  ]);
  keeperWorkspaceId = keeper.id;
  targetWorkspaceId = target.id;
});

beforeEach(async () => {
  const workspace = await db.workspace.findUniqueOrThrow({
    where: { id: keeperWorkspaceId },
  });
  auth.context = { workspace, operator };
});

afterAll(async () => {
  await db.workspace.deleteMany({
    where: { id: { in: [keeperWorkspaceId, targetWorkspaceId] } },
  });
  await db.operator.deleteMany({ where: { id: operator.id } });
});

describe("DELETE /api/workspaces/[id]", () => {
  it("journals the deletion in the surviving active workspace", async () => {
    const { DELETE } = await import("@/app/api/workspaces/[id]/route");
    const response = await DELETE(
      request(`/api/workspaces/${targetWorkspaceId}`),
      { params: Promise.resolve({ id: targetWorkspaceId }) },
    );

    expect(response.status).toBe(204);
    await expect(
      db.workspace.findUnique({ where: { id: targetWorkspaceId } }),
    ).resolves.toBeNull();

    // recordActivity is fire-and-forget, so the row lands after the response.
    await vi.waitFor(async () => {
      const entry = await db.activity.findFirst({
        where: {
          workspaceId: keeperWorkspaceId,
          action: "delete",
          entityType: "workspace",
          entityId: targetWorkspaceId,
        },
      });
      expect(entry).toMatchObject({
        operatorId: operator.id,
        operatorName: operator.username,
        entityLabel: `${PREFIX}-target`,
      });
    });
  });
});
