import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import * as folderService from "@/lib/services/note-folders";

let workspaceId: string;
let otherWorkspaceId: string;

async function makeWorkspace(slugPrefix: string): Promise<string> {
  const workspace = await db.workspace.create({
    data: {
      name: "Note folders test workspace",
      slug: `${slugPrefix}-${randomUUID()}`,
      updatedAt: new Date(),
    },
  });
  return workspace.id;
}

beforeAll(async () => {
  workspaceId = await makeWorkspace("note-folders");
  otherWorkspaceId = await makeWorkspace("note-folders-other");
});

afterAll(async () => {
  for (const id of [workspaceId, otherWorkspaceId]) {
    if (id) await db.workspace.delete({ where: { id } }).catch(() => {});
  }
});

beforeEach(async () => {
  await db.noteFolder.deleteMany({
    where: { workspaceId: { in: [workspaceId, otherWorkspaceId] } },
  });
});

// Builds a straight-line chain of `depth + 1` folders (root at depth 0
// through a leaf at depth `depth`) and returns their ids, root first.
async function buildChain(ws: string, depth: number): Promise<string[]> {
  const ids: string[] = [];
  let parentFolderId: string | null = null;
  for (let level = 0; level <= depth; level++) {
    const folder = await folderService.createFolder(ws, {
      name: `Level ${level}`,
      parentFolderId,
    });
    ids.push(folder.id);
    parentFolderId = folder.id;
  }
  return ids;
}

describe("nesting depth", () => {
  it("allows nesting down to the maximum depth", async () => {
    const chain = await buildChain(
      workspaceId,
      folderService.NOTE_FOLDER_MAX_DEPTH,
    );
    const leaf = await folderService.getFolder(
      workspaceId,
      chain[chain.length - 1],
    );
    expect(leaf?.depth).toBe(folderService.NOTE_FOLDER_MAX_DEPTH);
  });

  it("rejects a folder one level past the maximum depth with a domain error", async () => {
    const chain = await buildChain(
      workspaceId,
      folderService.NOTE_FOLDER_MAX_DEPTH,
    );
    await expect(
      folderService.createFolder(workspaceId, {
        name: "Too deep",
        parentFolderId: chain[chain.length - 1],
      }),
    ).rejects.toBeInstanceOf(folderService.NoteHierarchyValidationError);
  });

  it("rejects a move that would push a descendant past the maximum depth", async () => {
    const chain = await buildChain(
      workspaceId,
      folderService.NOTE_FOLDER_MAX_DEPTH,
    );
    const deepest = chain[chain.length - 1];

    const top = await folderService.createFolder(workspaceId, { name: "M0" });
    const child = await folderService.createFolder(workspaceId, {
      name: "M1",
      parentFolderId: top.id,
    });

    await expect(
      folderService.updateFolder(workspaceId, top.id, {
        parentFolderId: deepest,
      }),
    ).rejects.toBeInstanceOf(folderService.NoteHierarchyValidationError);

    // Nothing was written: both folders keep their original depth.
    const unchangedTop = await folderService.getFolder(workspaceId, top.id);
    const unchangedChild = await folderService.getFolder(workspaceId, child.id);
    expect(unchangedTop?.depth).toBe(0);
    expect(unchangedChild?.depth).toBe(1);
  });
});

describe("cycle protection", () => {
  it("rejects immediate self-parenting with a domain error", async () => {
    const folder = await folderService.createFolder(workspaceId, { name: "A" });
    await expect(
      folderService.updateFolder(workspaceId, folder.id, {
        parentFolderId: folder.id,
      }),
    ).rejects.toBeInstanceOf(folderService.NoteHierarchyValidationError);
  });

  it("rejects a longer cycle (A -> B -> C, move A under C)", async () => {
    const a = await folderService.createFolder(workspaceId, { name: "A" });
    const b = await folderService.createFolder(workspaceId, {
      name: "B",
      parentFolderId: a.id,
    });
    const c = await folderService.createFolder(workspaceId, {
      name: "C",
      parentFolderId: b.id,
    });

    await expect(
      folderService.updateFolder(workspaceId, a.id, { parentFolderId: c.id }),
    ).rejects.toBeInstanceOf(folderService.NoteHierarchyValidationError);
  });
});

describe("move recomputes depth of the whole subtree", () => {
  it("shifts every descendant by the same delta", async () => {
    const a = await folderService.createFolder(workspaceId, { name: "A" });
    const b = await folderService.createFolder(workspaceId, {
      name: "B",
      parentFolderId: a.id,
    });
    const c = await folderService.createFolder(workspaceId, {
      name: "C",
      parentFolderId: b.id,
    });

    const d = await folderService.createFolder(workspaceId, { name: "D" });
    const e = await folderService.createFolder(workspaceId, {
      name: "E",
      parentFolderId: d.id,
    });

    // Move B (carrying child C) under E. B: depth 1 -> 2 (delta +1).
    // C: depth 2 -> 3.
    await folderService.updateFolder(workspaceId, b.id, {
      parentFolderId: e.id,
    });

    const movedB = await folderService.getFolder(workspaceId, b.id);
    const movedC = await folderService.getFolder(workspaceId, c.id);
    expect(movedB?.depth).toBe(2);
    expect(movedB?.parentFolderId).toBe(e.id);
    expect(movedC?.depth).toBe(3);
  });

  it("shifts descendants to a shallower depth when moved up the tree", async () => {
    const a = await folderService.createFolder(workspaceId, { name: "A" });
    const b = await folderService.createFolder(workspaceId, {
      name: "B",
      parentFolderId: a.id,
    });
    const c = await folderService.createFolder(workspaceId, {
      name: "C",
      parentFolderId: b.id,
    });

    // Move C to the root: depth 2 -> 0.
    await folderService.updateFolder(workspaceId, c.id, {
      parentFolderId: null,
    });
    const movedC = await folderService.getFolder(workspaceId, c.id);
    expect(movedC?.depth).toBe(0);
    expect(movedC?.parentFolderId).toBe(null);
  });
});

describe("name conflicts", () => {
  it("rejects a duplicate name among root folders", async () => {
    await folderService.createFolder(workspaceId, { name: "Inbox" });
    await expect(
      folderService.createFolder(workspaceId, { name: "Inbox" }),
    ).rejects.toBeInstanceOf(folderService.NoteFolderNameConflictError);
  });

  it("rejects a duplicate name inside the same parent", async () => {
    const parent = await folderService.createFolder(workspaceId, {
      name: "Parent",
    });
    await folderService.createFolder(workspaceId, {
      name: "Child",
      parentFolderId: parent.id,
    });
    await expect(
      folderService.createFolder(workspaceId, {
        name: "Child",
        parentFolderId: parent.id,
      }),
    ).rejects.toBeInstanceOf(folderService.NoteFolderNameConflictError);
  });

  it("allows the same name under different parents", async () => {
    const parentX = await folderService.createFolder(workspaceId, {
      name: "X",
    });
    const parentY = await folderService.createFolder(workspaceId, {
      name: "Y",
    });
    await expect(
      folderService.createFolder(workspaceId, {
        name: "Notes",
        parentFolderId: parentX.id,
      }),
    ).resolves.toBeTruthy();
    await expect(
      folderService.createFolder(workspaceId, {
        name: "Notes",
        parentFolderId: parentY.id,
      }),
    ).resolves.toBeTruthy();
  });

  it("rejects a rename that collides with a sibling", async () => {
    await folderService.createFolder(workspaceId, { name: "A" });
    const b = await folderService.createFolder(workspaceId, { name: "B" });
    await expect(
      folderService.updateFolder(workspaceId, b.id, { name: "A" }),
    ).rejects.toBeInstanceOf(folderService.NoteFolderNameConflictError);
  });

  it("rejects a move that collides with a name already in the destination", async () => {
    const target = await folderService.createFolder(workspaceId, {
      name: "Target",
    });
    await folderService.createFolder(workspaceId, {
      name: "Same",
      parentFolderId: target.id,
    });
    const mover = await folderService.createFolder(workspaceId, {
      name: "Same",
    });

    await expect(
      folderService.updateFolder(workspaceId, mover.id, {
        parentFolderId: target.id,
      }),
    ).rejects.toBeInstanceOf(folderService.NoteFolderNameConflictError);
  });
});

describe("reorderFolders", () => {
  it("applies the requested order among siblings", async () => {
    const a = await folderService.createFolder(workspaceId, { name: "A" });
    const b = await folderService.createFolder(workspaceId, { name: "B" });
    const c = await folderService.createFolder(workspaceId, { name: "C" });

    await folderService.reorderFolders(workspaceId, {
      parentFolderId: null,
      order: [c.id, a.id, b.id],
    });

    const list = await folderService.listFolders(workspaceId);
    const byId = new Map(list.map((folder) => [folder.id, folder.position]));
    expect(byId.get(c.id)).toBe(0);
    expect(byId.get(a.id)).toBe(1);
    expect(byId.get(b.id)).toBe(2);
  });

  it("rejects an id that is not a sibling under the given parent", async () => {
    const parent = await folderService.createFolder(workspaceId, {
      name: "Parent",
    });
    const outsider = await folderService.createFolder(workspaceId, {
      name: "Outsider",
    });

    await expect(
      folderService.reorderFolders(workspaceId, {
        parentFolderId: parent.id,
        order: [outsider.id],
      }),
    ).rejects.toBeInstanceOf(folderService.NoteHierarchyValidationError);
  });
});

describe("cascade delete", () => {
  it("removes the whole subtree and any notes inside it", async () => {
    const parent = await folderService.createFolder(workspaceId, {
      name: "Parent",
    });
    const child = await folderService.createFolder(workspaceId, {
      name: "Child",
      parentFolderId: parent.id,
    });
    const note = await db.note.create({
      data: {
        workspaceId,
        folderId: child.id,
        folderWorkspaceId: workspaceId,
        title: "Nested note",
        normalizedTitle: "nested note",
      },
    });

    await folderService.deleteFolder(workspaceId, parent.id);

    expect(await db.noteFolder.count({ where: { id: parent.id } })).toBe(0);
    expect(await db.noteFolder.count({ where: { id: child.id } })).toBe(0);
    expect(await db.note.count({ where: { id: note.id } })).toBe(0);
  });
});

describe("workspace isolation", () => {
  it("does not return, update, delete or reorder another workspace's folder", async () => {
    const folder = await folderService.createFolder(workspaceId, {
      name: "Mine",
    });

    expect(await folderService.getFolder(otherWorkspaceId, folder.id)).toBe(
      null,
    );

    await expect(
      folderService.updateFolder(otherWorkspaceId, folder.id, {
        name: "Stolen",
      }),
    ).rejects.toBeInstanceOf(folderService.NoteFolderNotFoundError);

    await expect(
      folderService.deleteFolder(otherWorkspaceId, folder.id),
    ).rejects.toBeInstanceOf(folderService.NoteFolderNotFoundError);

    await expect(
      folderService.reorderFolders(otherWorkspaceId, {
        parentFolderId: null,
        order: [folder.id],
      }),
    ).rejects.toBeInstanceOf(folderService.NoteHierarchyValidationError);
  });

  it("treats a foreign parentFolderId as not found", async () => {
    const foreign = await folderService.createFolder(otherWorkspaceId, {
      name: "Foreign",
    });
    await expect(
      folderService.createFolder(workspaceId, {
        name: "Mine",
        parentFolderId: foreign.id,
      }),
    ).rejects.toBeInstanceOf(folderService.NoteFolderNotFoundError);
  });
});
