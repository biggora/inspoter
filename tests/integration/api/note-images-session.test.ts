import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Operator, Workspace } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { createNoteImage } from "@/lib/services/note-images";

// Exercises the REAL auth DAL (no mock of @/lib/auth/dal) the way a browser
// <img> does: session cookie only, no X-Inspoter-Workspace header. Only the
// request-scoped Next.js inputs are stubbed: the cookie store and the locale
// that the DAL's login redirect reads.
const request = vi.hoisted(() => ({
  sessionId: undefined as string | undefined,
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === "session" && request.sessionId
        ? { name, value: request.sessionId }
        : undefined,
  }),
}));

vi.mock("next-intl/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next-intl/server")>();
  return { ...actual, getLocale: async () => "en" };
});

const PREFIX = `note-images-session-${randomUUID()}`;
let operator: Operator;
let main: Workspace;
let other: Workspace;
let lastUsed: Workspace;
let sessionId: string;
let imageId: string;
let foreignImageId: string;
let bytes: Uint8Array;

async function get(id: string) {
  const { GET } = await import("@/app/api/notes/images/[id]/route");
  // Deliberately no X-Inspoter-Workspace header: an <img> cannot send one.
  return GET(new NextRequest(`http://localhost/api/notes/images/${id}`), {
    params: Promise.resolve({ id }),
  });
}

async function expectRefused(id: string) {
  // The DAL redirects to /login by throwing (Next turns that into a 307); the
  // integration harness (tests/setup.integration.ts) stubs redirect() as a
  // thrown Error carrying the target. Either way no image is returned.
  await expect(get(id)).rejects.toThrow(/redirect to \/login/);
}

beforeAll(async () => {
  operator = await db.operator.create({
    data: { username: `${PREFIX}-operator` },
  });
  main = await db.workspace.create({
    data: {
      name: `${PREFIX}-main`,
      slug: `${PREFIX}-main`,
      members: { create: { operatorId: operator.id, role: "OWNER" } },
    },
  });
  other = await db.workspace.create({
    data: { name: `${PREFIX}-other`, slug: `${PREFIX}-other` },
  });
  lastUsed = await db.workspace.create({
    data: {
      name: `${PREFIX}-last`,
      slug: `${PREFIX}-last`,
      members: { create: { operatorId: operator.id, role: "OWNER" } },
    },
  });
  const session = await db.session.create({
    data: {
      id: randomUUID(),
      operatorId: operator.id,
      expiresAt: new Date(Date.now() + 60_000),
      activeWorkspaceId: main.id,
      activeWorkspaceOperatorId: operator.id,
    },
  });
  sessionId = session.id;
  request.sessionId = sessionId;

  bytes = new Uint8Array([
    0x89,
    0x50,
    0x4e,
    0x47,
    0x0d,
    0x0a,
    0x1a,
    0x0a,
    ...Buffer.from(randomUUID()),
  ]);
  imageId = (await createNoteImage(main.id, { bytes })).id;
  foreignImageId = (
    await createNoteImage(other.id, { bytes: new Uint8Array([...bytes, 1]) })
  ).id;
});

afterAll(async () => {
  await db.session.deleteMany({ where: { operatorId: operator.id } });
  await db.workspace.deleteMany({
    where: { id: { in: [main.id, other.id, lastUsed.id] } },
  });
  await db.operator.deleteMany({ where: { id: operator.id } });
});

describe("GET /api/notes/images/[id] with the real session auth", () => {
  it("serves the image to a session-authenticated request without the workspace header", async () => {
    request.sessionId = sessionId;
    const response = await get(imageId);
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/png");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(response.headers.get("Cache-Control")).toBe(
      "private, max-age=31536000, immutable",
    );
    const served = new Uint8Array(await response.arrayBuffer());
    expect(Buffer.from(served).equals(Buffer.from(bytes))).toBe(true);
  });

  it("serves a member of the owning workspace when the session's last-used workspace is another one", async () => {
    // The multi-tab case: another tab made a different member workspace the
    // session's last-used one. The image still belongs to `main`.
    const membership = await db.workspaceMember.findUniqueOrThrow({
      where: {
        workspaceId_operatorId: {
          workspaceId: lastUsed.id,
          operatorId: operator.id,
        },
      },
    });
    await db.session.update({
      where: { id: sessionId },
      data: {
        activeWorkspaceId: lastUsed.id,
        activeWorkspaceOperatorId: membership.operatorId,
      },
    });
    request.sessionId = sessionId;
    const response = await get(imageId);
    expect(response.status).toBe(200);
    const served = new Uint8Array(await response.arrayBuffer());
    expect(Buffer.from(served).equals(Buffer.from(bytes))).toBe(true);
  });

  it("returns 404 for another workspace's image and for an unknown id", async () => {
    request.sessionId = sessionId;
    expect((await get(foreignImageId)).status).toBe(404);
    expect((await get("nonexistent-id")).status).toBe(404);
  });

  it("refuses a request with no session cookie", async () => {
    request.sessionId = undefined;
    await expectRefused(imageId);
  });

  it("refuses a request whose session does not exist", async () => {
    request.sessionId = randomUUID();
    await expectRefused(imageId);
  });
});

describe("POST /api/notes/images keeps the workspace header guard", () => {
  it("rejects an upload that omits the workspace header", async () => {
    request.sessionId = sessionId;
    const { POST } = await import("@/app/api/notes/images/route");
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(bytes)]), "a.png");
    const response = await POST(
      new NextRequest("http://localhost/api/notes/images", {
        method: "POST",
        body: form,
      }),
    );
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("WORKSPACE_CONTEXT_REQUIRED");
  });
});
