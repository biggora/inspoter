import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";

// GET /api/contacts/[id]/photo is loaded by an <img>, which cannot send the
// X-Inspoter-Workspace header, so it selects its workspace with `?workspace=`
// (AC-CNT-004: served only to an authenticated member of the owning workspace;
// NFR-SEC-004). Real Session row behind a mocked cookie jar, like
// tests/integration/auth/workspace-selector.test.ts.

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === "session" ? { name, value: seededSessionId } : undefined,
  }),
}));

const PREFIX = `contact-photo-${randomUUID()}`;
// 1x1 transparent PNG.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64",
);

let seededSessionId = "";
let operatorId: string;
let foreignOperatorId: string;
let memberWorkspaceId: string;
let foreignWorkspaceId: string;
let memberContactId: string;
let foreignContactId: string;

function photoRequest(
  contactId: string,
  search: string,
  headers: Record<string, string> = {},
) {
  return new NextRequest(
    `http://localhost/api/contacts/${contactId}/photo${search}`,
    { headers },
  );
}

async function getPhoto(request: NextRequest, contactId: string) {
  const { GET } = await import("@/app/api/contacts/[id]/photo/route");
  return GET(request, { params: Promise.resolve({ id: contactId }) });
}

async function createContactWithPhoto(workspaceId: string, name: string) {
  const contact = await db.contact.create({
    data: {
      workspaceId,
      firstName: name,
      displayName: name,
      sortKey: name.toLowerCase(),
      searchText: name.toLowerCase(),
      photo: PNG,
      photoContentType: "image/png",
    },
  });
  return contact.id;
}

beforeAll(async () => {
  const [operator, foreignOperator] = await Promise.all(
    ["operator", "foreign"].map((suffix) =>
      db.operator.create({
        data: { username: `${PREFIX}-${suffix}`, passwordHash: "unused" },
      }),
    ),
  );
  operatorId = operator!.id;
  foreignOperatorId = foreignOperator!.id;

  const [member, foreign] = await Promise.all([
    db.workspace.create({
      data: {
        name: `${PREFIX}-member`,
        slug: `${PREFIX}-member`,
        members: { create: { operatorId, role: "OWNER" } },
      },
    }),
    db.workspace.create({
      data: {
        name: `${PREFIX}-foreign`,
        slug: `${PREFIX}-foreign`,
        members: { create: { operatorId: foreignOperatorId, role: "OWNER" } },
      },
    }),
  ]);
  memberWorkspaceId = member.id;
  foreignWorkspaceId = foreign.id;

  memberContactId = await createContactWithPhoto(member.id, "Member Photo");
  foreignContactId = await createContactWithPhoto(foreign.id, "Foreign Photo");

  const session = await db.session.create({
    data: {
      id: randomUUID(),
      operatorId,
      activeWorkspaceId: memberWorkspaceId,
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
    where: { id: { in: [memberWorkspaceId, foreignWorkspaceId] } },
  });
  await db.operator.deleteMany({ where: { id: { in: operatorIds } } });
});

describe("GET /api/contacts/[id]/photo", () => {
  it("serves the photo to a member who names the workspace in ?workspace=", async () => {
    const response = await getPhoto(
      photoRequest(memberContactId, `?workspace=${memberWorkspaceId}`),
      memberContactId,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/png");
    expect(Buffer.from(await response.arrayBuffer())).toEqual(PNG);
  });

  it("answers 400 WORKSPACE_CONTEXT_REQUIRED without the parameter, even with the header", async () => {
    const bare = await getPhoto(
      photoRequest(memberContactId, ""),
      memberContactId,
    );
    const headerOnly = await getPhoto(
      photoRequest(memberContactId, "", {
        "x-inspoter-workspace": memberWorkspaceId,
      }),
      memberContactId,
    );

    for (const response of [bare, headerOnly]) {
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({
        error: "WORKSPACE_CONTEXT_REQUIRED",
      });
    }
  });

  it("answers 403 WORKSPACE_ACCESS_DENIED for a workspace the operator is not a member of", async () => {
    const response = await getPhoto(
      photoRequest(foreignContactId, `?workspace=${foreignWorkspaceId}`),
      foreignContactId,
    );

    expect(response.status).toBe(403);
    expect(response.headers.get("Content-Type")).not.toBe("image/png");
    expect(await response.json()).toMatchObject({
      error: "WORKSPACE_ACCESS_DENIED",
    });
  });

  it("does not hand a foreign contact's photo to a member workspace", async () => {
    const response = await getPhoto(
      photoRequest(foreignContactId, `?workspace=${memberWorkspaceId}`),
      foreignContactId,
    );

    expect(response.status).toBe(404);
  });
});
