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
import * as notesService from "@/lib/services/notes";
import * as noteFoldersService from "@/lib/services/note-folders";

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

const PREFIX = `notes-api-${randomUUID()}`;
// Folder names are capped at 60 chars (NOTE_FOLDER_NAME_MAX); PREFIX alone
// plus a note-style suffix would overflow that, so folder tests use this
// shorter prefix instead.
const FOLDER_PREFIX = `nf-${randomUUID().slice(0, 8)}`;
let operator: Operator;
let workspaceId: string;
let otherWorkspaceId: string;

function request(
  path: string,
  method: string,
  body?: unknown,
  workspaceHeader = workspaceId,
) {
  return new NextRequest(`http://localhost${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-Inspoter-Workspace": workspaceHeader,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

beforeAll(async () => {
  operator = await db.operator.create({
    data: { username: `${PREFIX}-operator` },
  });
  const [main, other] = await Promise.all([
    db.workspace.create({
      data: {
        name: `${PREFIX}-main`,
        slug: `${PREFIX}-main`,
        members: { create: { operatorId: operator.id, role: "OWNER" } },
      },
    }),
    db.workspace.create({
      data: { name: `${PREFIX}-other`, slug: `${PREFIX}-other` },
    }),
  ]);
  workspaceId = main.id;
  otherWorkspaceId = other.id;
});

beforeEach(async () => {
  const workspace = await db.workspace.findUniqueOrThrow({
    where: { id: workspaceId },
  });
  auth.context = { workspace, operator };
});

afterAll(async () => {
  await db.workspace.deleteMany({
    where: { id: { in: [workspaceId, otherWorkspaceId] } },
  });
  await db.operator.deleteMany({ where: { id: operator.id } });
});

async function createNote(title = `note-${randomUUID()}`, content?: string) {
  const { POST } = await import("@/app/api/notes/route");
  const response = await POST(
    request("/api/notes", "POST", { title, ...(content ? { content } : {}) }),
  );
  expect(response.status).toBe(201);
  return (await response.json()) as {
    id: string;
    title: string;
    version: number;
    folderId: string | null;
  };
}

async function createFolder(
  name = `folder-${randomUUID()}`,
  parentFolderId?: string | null,
) {
  const { POST } = await import("@/app/api/notes/folders/route");
  const response = await POST(
    request("/api/notes/folders", "POST", {
      name,
      ...(parentFolderId !== undefined ? { parentFolderId } : {}),
    }),
  );
  expect(response.status).toBe(201);
  return (await response.json()) as {
    id: string;
    name: string;
    parentFolderId: string | null;
  };
}

describe("auth gate", () => {
  it("rejects a request that fails workspace-context validation", async () => {
    const dal = await import("@/lib/auth/dal");
    vi.mocked(dal.requireAuthWithWorkspaceHeader).mockRejectedValueOnce(
      new dal.WorkspaceContextRequiredError(),
    );

    const { GET } = await import("@/app/api/notes/route");
    const response = await GET(request("/api/notes", "GET"));

    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("WORKSPACE_CONTEXT_REQUIRED");
  });
});

describe("POST /api/notes", () => {
  it("creates a note and journals it", async () => {
    const note = await createNote(`${PREFIX}-created`);

    expect(await db.note.findUnique({ where: { id: note.id } })).not.toBeNull();
    // recordActivity is fire-and-forget, so the row lands after the response.
    await vi.waitFor(async () => {
      const activity = await db.activity.findFirst({
        where: {
          workspaceId,
          entityType: "note",
          entityId: note.id,
          action: "create",
        },
      });
      expect(activity?.entityLabel).toBe(`${PREFIX}-created`);
    });
  });

  it("rejects an empty title", async () => {
    const { POST } = await import("@/app/api/notes/route");
    const response = await POST(request("/api/notes", "POST", { title: "  " }));
    expect(response.status).toBe(400);
  });

  it("rejects a body with an unrecognized key", async () => {
    const { POST } = await import("@/app/api/notes/route");
    const response = await POST(
      request("/api/notes", "POST", { title: "x", bogus: 1 }),
    );
    expect(response.status).toBe(400);
  });

  it("returns 409 with a suggestedTitle on a title conflict", async () => {
    const title = `${PREFIX}-dup`;
    await createNote(title);

    const { POST } = await import("@/app/api/notes/route");
    const response = await POST(request("/api/notes", "POST", { title }));

    expect(response.status).toBe(409);
    const body = (await response.json()) as {
      error: string;
      suggestedTitle: string;
    };
    expect(body.error).toBe("NOTE_TITLE_CONFLICT");
    expect(body.suggestedTitle).toBe(`${title} 2`);
  });
});

describe("GET /api/notes/[id]", () => {
  it("returns the note detail", async () => {
    const note = await createNote(`${PREFIX}-detail`, "hello world");
    const { GET } = await import("@/app/api/notes/[id]/route");

    const response = await GET(request(`/api/notes/${note.id}`, "GET"), {
      params: Promise.resolve({ id: note.id }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.content).toBe("hello world");
  });

  it("returns 404 for a nonexistent id", async () => {
    const { GET } = await import("@/app/api/notes/[id]/route");
    const response = await GET(request(`/api/notes/${randomUUID()}`, "GET"), {
      params: Promise.resolve({ id: randomUUID() }),
    });
    expect(response.status).toBe(404);
    expect((await response.json()).error).toBe("RESOURCE_NOT_FOUND");
  });

  it("returns 404 for another workspace's note", async () => {
    const foreign = await notesService.createNote(otherWorkspaceId, {
      title: `${PREFIX}-foreign`,
    });
    const { GET } = await import("@/app/api/notes/[id]/route");

    const response = await GET(request(`/api/notes/${foreign.id}`, "GET"), {
      params: Promise.resolve({ id: foreign.id }),
    });

    expect(response.status).toBe(404);
  });
});

describe("PATCH /api/notes/[id]", () => {
  it("updates the note and journals it", async () => {
    const note = await createNote(`${PREFIX}-update`);
    const { PATCH } = await import("@/app/api/notes/[id]/route");

    const response = await PATCH(
      request(`/api/notes/${note.id}`, "PATCH", {
        content: "updated body",
        version: note.version,
      }),
      { params: Promise.resolve({ id: note.id }) },
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.content).toBe("updated body");
    expect(body.version).toBe(note.version + 1);

    // recordActivity is fire-and-forget, so the row lands after the response.
    await vi.waitFor(async () => {
      const activity = await db.activity.findFirst({
        where: {
          workspaceId,
          entityType: "note",
          entityId: note.id,
          action: "update",
        },
      });
      expect(activity).not.toBeNull();
    });
  });

  it("returns 409 with currentVersion on a stale version", async () => {
    const note = await createNote(`${PREFIX}-stale`);
    const { PATCH } = await import("@/app/api/notes/[id]/route");

    // Advance the version once so the original `note.version` is now stale.
    await PATCH(
      request(`/api/notes/${note.id}`, "PATCH", {
        content: "first edit",
        version: note.version,
      }),
      { params: Promise.resolve({ id: note.id }) },
    );

    const response = await PATCH(
      request(`/api/notes/${note.id}`, "PATCH", {
        content: "stale edit",
        version: note.version,
      }),
      { params: Promise.resolve({ id: note.id }) },
    );

    expect(response.status).toBe(409);
    const body = (await response.json()) as {
      error: string;
      currentVersion: number;
    };
    expect(body.error).toBe("NOTE_VERSION_CONFLICT");
    expect(body.currentVersion).toBe(note.version + 1);
  });
});

describe("DELETE /api/notes/[id]", () => {
  it("deletes the note and journals it", async () => {
    const note = await createNote(`${PREFIX}-delete`);
    const { DELETE } = await import("@/app/api/notes/[id]/route");

    const response = await DELETE(request(`/api/notes/${note.id}`, "DELETE"), {
      params: Promise.resolve({ id: note.id }),
    });

    expect(response.status).toBe(204);
    expect(await db.note.findUnique({ where: { id: note.id } })).toBeNull();

    // recordActivity is fire-and-forget, so the row lands after the response.
    await vi.waitFor(async () => {
      const activity = await db.activity.findFirst({
        where: {
          workspaceId,
          entityType: "note",
          entityId: note.id,
          action: "delete",
        },
      });
      expect(activity).not.toBeNull();
    });
  });
});

describe("PATCH /api/notes/[id]/move", () => {
  it("moves the note into a folder without requiring a version", async () => {
    const note = await createNote(`${PREFIX}-move`);
    const folder = await createFolder(`${FOLDER_PREFIX}-move-target`);
    const { PATCH } = await import("@/app/api/notes/[id]/move/route");

    const response = await PATCH(
      request(`/api/notes/${note.id}/move`, "PATCH", {
        folderId: folder.id,
      }),
      { params: Promise.resolve({ id: note.id }) },
    );

    expect(response.status).toBe(200);
    expect((await response.json()).folderId).toBe(folder.id);
  });
});

describe("GET /api/notes/tree", () => {
  it("returns folders and notes, with notes carrying no content field", async () => {
    const folder = await createFolder(`${FOLDER_PREFIX}-tree-folder`);
    const note = await createNote(`${PREFIX}-tree-note`, "body text");

    const { GET } = await import("@/app/api/notes/tree/route");
    const response = await GET(request("/api/notes/tree", "GET"));

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      folders: { id: string }[];
      notes: Record<string, unknown>[];
    };
    expect(body.folders.some((f) => f.id === folder.id)).toBe(true);
    const treeNote = body.notes.find((n) => n.id === note.id);
    expect(treeNote).toBeDefined();
    expect(treeNote).not.toHaveProperty("content");
  });
});

describe("GET /api/notes (search)", () => {
  it("filters by the query string", async () => {
    await createNote(`${PREFIX}-searchable-alpha`);
    await createNote(`${PREFIX}-searchable-beta`);

    const { GET } = await import("@/app/api/notes/route");
    const response = await GET(
      request(
        `/api/notes?query=${encodeURIComponent(`${PREFIX}-searchable-alpha`)}`,
        "GET",
      ),
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      items: { title: string }[];
      total: number;
    };
    expect(
      body.items.some((i) => i.title === `${PREFIX}-searchable-alpha`),
    ).toBe(true);
    expect(
      body.items.some((i) => i.title === `${PREFIX}-searchable-beta`),
    ).toBe(false);
  });

  it("lists only this workspace's notes", async () => {
    const mine = await createNote(`${PREFIX}-isolation-mine`);
    const foreign = await notesService.createNote(otherWorkspaceId, {
      title: `${PREFIX}-isolation-foreign`,
    });

    const { GET } = await import("@/app/api/notes/route");
    const response = await GET(request("/api/notes", "GET"));
    const body = (await response.json()) as { items: { id: string }[] };

    expect(body.items.some((i) => i.id === mine.id)).toBe(true);
    expect(body.items.some((i) => i.id === foreign.id)).toBe(false);
  });
});

describe("POST /api/notes/folders", () => {
  it("creates a folder and journals it", async () => {
    const folder = await createFolder(`${FOLDER_PREFIX}-folder-created`);

    expect(
      await db.noteFolder.findUnique({ where: { id: folder.id } }),
    ).not.toBeNull();
    // recordActivity is fire-and-forget, so the row lands after the response.
    await vi.waitFor(async () => {
      const activity = await db.activity.findFirst({
        where: {
          workspaceId,
          entityType: "note_folder",
          entityId: folder.id,
          action: "create",
        },
      });
      expect(activity).not.toBeNull();
    });
  });

  it("returns 409 on a folder name conflict", async () => {
    const name = `${FOLDER_PREFIX}-folder-dup`;
    await createFolder(name);

    const { POST } = await import("@/app/api/notes/folders/route");
    const response = await POST(
      request("/api/notes/folders", "POST", { name }),
    );

    expect(response.status).toBe(409);
    expect((await response.json()).error).toBe("NOTE_FOLDER_NAME_CONFLICT");
  });
});

describe("PATCH /api/notes/folders/[id]", () => {
  it("renames a folder and journals it", async () => {
    const folder = await createFolder(`${FOLDER_PREFIX}-folder-rename`);
    const { PATCH } = await import("@/app/api/notes/folders/[id]/route");

    const response = await PATCH(
      request(`/api/notes/folders/${folder.id}`, "PATCH", {
        name: `${FOLDER_PREFIX}-folder-renamed`,
      }),
      { params: Promise.resolve({ id: folder.id }) },
    );

    expect(response.status).toBe(200);
    expect((await response.json()).name).toBe(
      `${FOLDER_PREFIX}-folder-renamed`,
    );
  });

  it("returns 400 when moving a folder into itself", async () => {
    const folder = await createFolder(`${FOLDER_PREFIX}-folder-self`);
    const { PATCH } = await import("@/app/api/notes/folders/[id]/route");

    const response = await PATCH(
      request(`/api/notes/folders/${folder.id}`, "PATCH", {
        parentFolderId: folder.id,
      }),
      { params: Promise.resolve({ id: folder.id }) },
    );

    expect(response.status).toBe(400);
  });

  it("returns 404 for another workspace's folder", async () => {
    const foreign = await noteFoldersService.createFolder(otherWorkspaceId, {
      name: `${FOLDER_PREFIX}-foreign-folder`,
    });
    const { PATCH } = await import("@/app/api/notes/folders/[id]/route");

    const response = await PATCH(
      request(`/api/notes/folders/${foreign.id}`, "PATCH", {
        name: "hijack",
      }),
      { params: Promise.resolve({ id: foreign.id }) },
    );

    expect(response.status).toBe(404);
  });
});

describe("DELETE /api/notes/folders/[id]", () => {
  it("deletes the folder and journals it", async () => {
    const folder = await createFolder(`${FOLDER_PREFIX}-folder-delete`);
    const { DELETE } = await import("@/app/api/notes/folders/[id]/route");

    const response = await DELETE(
      request(`/api/notes/folders/${folder.id}`, "DELETE"),
      { params: Promise.resolve({ id: folder.id }) },
    );

    expect(response.status).toBe(204);
    expect(
      await db.noteFolder.findUnique({ where: { id: folder.id } }),
    ).toBeNull();
  });
});

describe("PATCH /api/notes/folders/reorder", () => {
  it("reorders sibling folders", async () => {
    const first = await createFolder(`${FOLDER_PREFIX}-reorder-a`);
    const second = await createFolder(`${FOLDER_PREFIX}-reorder-b`);
    const { PATCH } = await import("@/app/api/notes/folders/reorder/route");

    const response = await PATCH(
      request("/api/notes/folders/reorder", "PATCH", {
        parentFolderId: null,
        order: [second.id, first.id],
      }),
    );

    expect(response.status).toBe(204);
    const reordered = await db.noteFolder.findUnique({
      where: { id: second.id },
    });
    expect(reordered?.position).toBe(0);
  });
});
