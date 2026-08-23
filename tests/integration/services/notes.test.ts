import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import * as notesService from "@/lib/services/notes";
import * as folderService from "@/lib/services/note-folders";

let workspaceId: string;
let otherWorkspaceId: string;

async function makeWorkspace(slugPrefix: string): Promise<string> {
  const workspace = await db.workspace.create({
    data: {
      name: "Notes test workspace",
      slug: `${slugPrefix}-${randomUUID()}`,
      updatedAt: new Date(),
    },
  });
  return workspace.id;
}

beforeAll(async () => {
  workspaceId = await makeWorkspace("notes");
  otherWorkspaceId = await makeWorkspace("notes-other");
});

afterAll(async () => {
  for (const id of [workspaceId, otherWorkspaceId]) {
    if (id) await db.workspace.delete({ where: { id } }).catch(() => {});
  }
});

beforeEach(async () => {
  await db.note.deleteMany({
    where: { workspaceId: { in: [workspaceId, otherWorkspaceId] } },
  });
  await db.noteFolder.deleteMany({
    where: { workspaceId: { in: [workspaceId, otherWorkspaceId] } },
  });
});

describe("createNote / getNote / deleteNote", () => {
  it("round-trips a note through create, read and delete", async () => {
    const created = await notesService.createNote(workspaceId, {
      title: "First note",
      content: "Some **bold** content.",
    });
    expect(created.title).toBe("First note");
    expect(created.version).toBe(1);
    expect(created.folderId).toBe(null);

    const fetched = await notesService.getNote(workspaceId, created.id);
    expect(fetched?.content).toBe("Some **bold** content.");

    await notesService.deleteNote(workspaceId, created.id);
    expect(await notesService.getNote(workspaceId, created.id)).toBe(null);
  });

  it("rejects deleting a note that does not exist", async () => {
    await expect(
      notesService.deleteNote(workspaceId, "nonexistent-id"),
    ).rejects.toBeInstanceOf(notesService.NoteNotFoundError);
  });

  it("assigns the note to a folder in the same workspace and rejects a foreign one", async () => {
    const folder = await folderService.createFolder(workspaceId, {
      name: "Folder",
    });
    const note = await notesService.createNote(workspaceId, {
      title: "Filed",
      folderId: folder.id,
    });
    expect(note.folderId).toBe(folder.id);

    const foreignFolder = await folderService.createFolder(otherWorkspaceId, {
      name: "Foreign",
    });
    await expect(
      notesService.createNote(workspaceId, {
        title: "Bad folder",
        folderId: foreignFolder.id,
      }),
    ).rejects.toBeInstanceOf(notesService.NoteNotFoundError);
  });
});

describe("title conflicts", () => {
  it("rejects a duplicate title on create and suggests the next free one", async () => {
    await notesService.createNote(workspaceId, { title: "Home" });
    const error = await notesService
      .createNote(workspaceId, { title: "Home" })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(notesService.NoteTitleConflictError);
    expect((error as notesService.NoteTitleConflictError).suggestedTitle).toBe(
      "Home 2",
    );
  });

  it("is case-insensitive: README and readme collide", async () => {
    await notesService.createNote(workspaceId, { title: "README" });
    await expect(
      notesService.createNote(workspaceId, { title: "readme" }),
    ).rejects.toBeInstanceOf(notesService.NoteTitleConflictError);
  });

  it("rejects a rename that collides with another note's title", async () => {
    await notesService.createNote(workspaceId, { title: "Alpha" });
    const beta = await notesService.createNote(workspaceId, { title: "Beta" });

    const error = await notesService
      .updateNote(workspaceId, beta.id, { title: "Alpha", version: 1 })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(notesService.NoteTitleConflictError);
    expect((error as notesService.NoteTitleConflictError).suggestedTitle).toBe(
      "Alpha 2",
    );
  });

  it("suggestUniqueTitle skips numbers that are already taken", async () => {
    await notesService.createNote(workspaceId, { title: "Base" });
    await notesService.createNote(workspaceId, { title: "Base 2" });
    const suggestion = await notesService.suggestUniqueTitle(
      workspaceId,
      "Base",
    );
    expect(suggestion).toBe("Base 3");
  });
});

describe("version conflicts", () => {
  it("increments the version on a matching update and rejects a stale one", async () => {
    const note = await notesService.createNote(workspaceId, { title: "Doc" });
    expect(note.version).toBe(1);

    const updated = await notesService.updateNote(workspaceId, note.id, {
      content: "v2 content",
      version: 1,
    });
    expect(updated.version).toBe(2);

    const error = await notesService
      .updateNote(workspaceId, note.id, { content: "stale write", version: 1 })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(notesService.NoteVersionConflictError);
    expect(
      (error as notesService.NoteVersionConflictError).currentVersion,
    ).toBe(2);
  });

  it("rejects an update for a note that does not exist", async () => {
    await expect(
      notesService.updateNote(workspaceId, "nonexistent-id", {
        title: "x",
        version: 1,
      }),
    ).rejects.toBeInstanceOf(notesService.NoteNotFoundError);
  });
});

describe("excerpt", () => {
  it("is derived from the markdown content, not stored verbatim", async () => {
    const note = await notesService.createNote(workspaceId, {
      title: "With markup",
      content: "# Heading\n\nSome **bold** and _italic_ text.",
    });
    expect(note.excerpt).not.toContain("#");
    expect(note.excerpt).not.toContain("**");
    expect(note.excerpt).toContain("Heading");
    expect(note.excerpt).toContain("bold");
  });

  it("is recomputed when the content changes", async () => {
    const note = await notesService.createNote(workspaceId, {
      title: "Evolving",
      content: "Original body.",
    });
    const updated = await notesService.updateNote(workspaceId, note.id, {
      content: "Replaced body.",
      version: 1,
    });
    expect(updated.excerpt).toContain("Replaced body");
    expect(updated.excerpt).not.toContain("Original body");
  });
});

describe("generated searchVector column", () => {
  it("is populated on create and is queryable via to_tsquery", async () => {
    const note = await notesService.createNote(workspaceId, {
      title: "Postgres full text search",
      content: "This body mentions elephants and tsvector indexing.",
    });

    const rows = await db.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "Note"
      WHERE "id" = ${note.id}
        AND "searchVector" @@ to_tsquery('simple', 'elephants')
    `;
    expect(rows).toHaveLength(1);

    const titleRows = await db.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "Note"
      WHERE "id" = ${note.id}
        AND "searchVector" @@ to_tsquery('simple', 'postgres')
    `;
    expect(titleRows).toHaveLength(1);
  });
});

describe("searchNotes", () => {
  it("finds notes by a query matching either the title or the body", async () => {
    await notesService.createNote(workspaceId, {
      title: "Zebra crossing",
      content: "Unrelated content.",
    });
    await notesService.createNote(workspaceId, {
      title: "Unrelated title",
      content: "Mentions a zebra in passing.",
    });
    await notesService.createNote(workspaceId, {
      title: "Nothing to do with it",
      content: "Nothing here either.",
    });

    const result = await notesService.searchNotes(workspaceId, {
      query: "zebra",
      sort: "updatedAt",
    });
    expect(result.items.map((item) => item.title).sort()).toEqual(
      ["Unrelated title", "Zebra crossing"].sort(),
    );
    expect(result.total).toBe(2);
  });

  it("scopes to a folder and, with includeSubfolders, its whole subtree", async () => {
    const parent = await folderService.createFolder(workspaceId, {
      name: "Parent",
    });
    const child = await folderService.createFolder(workspaceId, {
      name: "Child",
      parentFolderId: parent.id,
    });

    await notesService.createNote(workspaceId, {
      title: "In parent",
      folderId: parent.id,
    });
    await notesService.createNote(workspaceId, {
      title: "In child",
      folderId: child.id,
    });
    await notesService.createNote(workspaceId, { title: "At root" });

    const parentOnly = await notesService.searchNotes(workspaceId, {
      folderId: parent.id,
      sort: "updatedAt",
    });
    expect(parentOnly.items.map((item) => item.title)).toEqual(["In parent"]);

    const withSubfolders = await notesService.searchNotes(workspaceId, {
      folderId: parent.id,
      includeSubfolders: true,
      sort: "updatedAt",
    });
    expect(withSubfolders.items.map((item) => item.title).sort()).toEqual(
      ["In child", "In parent"].sort(),
    );
  });

  it("pages with a cursor without skipping or repeating rows", async () => {
    await notesService.createNote(workspaceId, { title: "Alpha" });
    await notesService.createNote(workspaceId, { title: "Bravo" });
    await notesService.createNote(workspaceId, { title: "Charlie" });

    const first = await notesService.searchNotes(workspaceId, {
      sort: "title",
      limit: 1,
    });
    expect(first.items.map((item) => item.title)).toEqual(["Alpha"]);
    expect(first.nextCursor).not.toBe(null);

    const second = await notesService.searchNotes(workspaceId, {
      sort: "title",
      limit: 1,
      cursor: first.nextCursor!,
    });
    expect(second.items.map((item) => item.title)).toEqual(["Bravo"]);

    const third = await notesService.searchNotes(workspaceId, {
      sort: "title",
      limit: 1,
      cursor: second.nextCursor!,
    });
    expect(third.items.map((item) => item.title)).toEqual(["Charlie"]);
    expect(third.nextCursor).toBe(null);
  });
});

describe("workspace isolation", () => {
  it("does not read, rename, move, delete or find a foreign note", async () => {
    const note = await notesService.createNote(workspaceId, { title: "Mine" });

    expect(await notesService.getNote(otherWorkspaceId, note.id)).toBe(null);

    await expect(
      notesService.updateNote(otherWorkspaceId, note.id, {
        title: "Stolen",
        version: 1,
      }),
    ).rejects.toBeInstanceOf(notesService.NoteNotFoundError);

    await expect(
      notesService.moveNote(otherWorkspaceId, note.id, { folderId: null }),
    ).rejects.toBeInstanceOf(notesService.NoteNotFoundError);

    await expect(
      notesService.deleteNote(otherWorkspaceId, note.id),
    ).rejects.toBeInstanceOf(notesService.NoteNotFoundError);

    const search = await notesService.searchNotes(otherWorkspaceId, {
      query: "Mine",
      sort: "updatedAt",
    });
    expect(search.items).toEqual([]);
  });
});
