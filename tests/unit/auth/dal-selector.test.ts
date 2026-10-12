import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Header / query-parameter validation shared by the live stale-tab guard
// (requireAuthWith*) and the selector (requireWorkspaceFrom*), with the
// session and Prisma layers stubbed. The real-database behavior is covered in
// tests/integration/auth/workspace-selector.test.ts.

const mocks = vi.hoisted(() => ({
  readSessionCookie: vi.fn(),
  getValidSession: vi.fn(),
  operatorFindUnique: vi.fn(),
  memberFindUnique: vi.fn(),
  sessionUpdate: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({
  readSessionCookie: mocks.readSessionCookie,
  getValidSession: mocks.getValidSession,
}));

vi.mock("@/lib/db", () => ({
  db: {
    operator: { findUnique: mocks.operatorFindUnique },
    workspaceMember: { findUnique: mocks.memberFindUnique },
    session: { update: mocks.sessionUpdate },
  },
}));

import {
  requireAuthWithWorkspaceHeader,
  requireAuthWithWorkspaceParam,
  requireWorkspaceFromHeader,
  requireWorkspaceFromParam,
  WorkspaceAccessDeniedError,
  WorkspaceContextRequiredError,
  WorkspaceContextStaleError,
} from "@/lib/auth/dal";

const WORKSPACE = { id: "ws-a", name: "A", slug: "a" };

function headerRequest(value: string | null): NextRequest {
  const headers = new Headers();
  if (value !== null) headers.set("x-inspoter-workspace", value);
  return new NextRequest("http://localhost/api/x", { headers });
}

function paramRequest(value: string | null): NextRequest {
  const url = new URL("http://localhost/api/x");
  if (value !== null) url.searchParams.set("workspace", value);
  return new NextRequest(url);
}

const carriers = [
  [
    "requireAuthWithWorkspaceHeader",
    requireAuthWithWorkspaceHeader,
    headerRequest,
  ],
  [
    "requireAuthWithWorkspaceParam",
    requireAuthWithWorkspaceParam,
    paramRequest,
  ],
  ["requireWorkspaceFromHeader", requireWorkspaceFromHeader, headerRequest],
  ["requireWorkspaceFromParam", requireWorkspaceFromParam, paramRequest],
] as const;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.readSessionCookie.mockResolvedValue("session-1");
  mocks.getValidSession.mockResolvedValue({
    id: "session-1",
    operatorId: "op-1",
    activeWorkspaceId: WORKSPACE.id,
  });
  mocks.operatorFindUnique.mockResolvedValue({
    id: "op-1",
    defaultWorkspaceId: null,
  });
  mocks.memberFindUnique.mockImplementation(
    async ({
      where,
    }: {
      where: { workspaceId_operatorId: { workspaceId: string } };
    }) =>
      where.workspaceId_operatorId.workspaceId === WORKSPACE.id
        ? { workspace: WORKSPACE }
        : null,
  );
});

describe.each(carriers)("%s", (name, guard, build) => {
  it.each([
    ["missing", null],
    ["empty", ""],
    ["129 bytes", "a".repeat(129)],
    ["non-ASCII", "wörkspace"],
  ])(
    "rejects a %s workspace id as WorkspaceContextRequiredError",
    async (_label, value) => {
      await expect(guard(build(value))).rejects.toBeInstanceOf(
        WorkspaceContextRequiredError,
      );
      // The selector must refuse before it ever looks at memberships.
      if (name.startsWith("requireWorkspaceFrom")) {
        expect(mocks.memberFindUnique).not.toHaveBeenCalled();
      }
    },
  );

  it("accepts the 128-byte boundary (fails later, on the workspace itself)", async () => {
    const error = await guard(build("a".repeat(128))).catch((e: unknown) => e);
    expect(error).not.toBeInstanceOf(WorkspaceContextRequiredError);
    expect(error).toBeInstanceOf(
      name.startsWith("requireAuth")
        ? WorkspaceContextStaleError
        : WorkspaceAccessDeniedError,
    );
  });

  it("resolves the matching workspace", async () => {
    await expect(guard(build(WORKSPACE.id))).resolves.toMatchObject({
      workspace: WORKSPACE,
    });
  });
});

describe("selector purity", () => {
  it("never writes the Session, whichever workspace it selects", async () => {
    await requireWorkspaceFromHeader(headerRequest(WORKSPACE.id));
    await requireWorkspaceFromHeader(headerRequest("unknown")).catch(() => {});
    expect(mocks.sessionUpdate).not.toHaveBeenCalled();
  });

  it("uses the carrier, not the session, to pick the workspace", async () => {
    mocks.memberFindUnique.mockImplementation(
      async ({
        where,
      }: {
        where: { workspaceId_operatorId: { workspaceId: string } };
      }) => ({
        workspace: { id: where.workspaceId_operatorId.workspaceId },
      }),
    );
    const { workspace } = await requireWorkspaceFromHeader(
      headerRequest("ws-other"),
    );
    expect(workspace.id).toBe("ws-other");
  });
});

describe("live guard keeps its stale-tab semantics", () => {
  it("answers WorkspaceContextStaleError when the id differs from the session workspace", async () => {
    await expect(
      requireAuthWithWorkspaceHeader(headerRequest("ws-other")),
    ).rejects.toBeInstanceOf(WorkspaceContextStaleError);
  });
});
