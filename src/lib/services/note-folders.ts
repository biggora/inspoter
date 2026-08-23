import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { normalizeTitle } from "@/lib/notes/parse";
import type {
  NoteFolderCreateInput,
  NoteFolderReorderInput,
  NoteFolderUpdateInput,
} from "@/lib/validation/notes";

// Sole Prisma caller for NoteFolder. Modeled on src/lib/services/kanban.ts:
// workspaceId first, every query scoped by it, and P2025/P2002 translated to
// domain errors rather than leaking raw Prisma errors to callers.

export const NOTE_FOLDER_LIMIT = 500;
// Must match the "NoteFolder_depth_check" CHECK constraint added by
// prisma/migrations/20260824120000_notes/migration.sql. That CHECK is the
// last line of defense (a raw Postgres error if this ever drifts); the real
// guard is the pre-write check in updateFolder/createFolder below, which
// turns a would-be violation into NoteHierarchyValidationError instead.
export const NOTE_FOLDER_MAX_DEPTH = 8;

export class NoteFolderNotFoundError extends Error {
  readonly code = "RESOURCE_NOT_FOUND";

  constructor() {
    super("Folder not found.");
    this.name = "NoteFolderNotFoundError";
  }
}

export class NoteFolderNameConflictError extends Error {
  readonly code = "NOTE_FOLDER_NAME_CONFLICT";

  constructor() {
    super("A folder with this name already exists here.");
    this.name = "NoteFolderNameConflictError";
  }
}

// No `code`, matching KanbanValidationError / CategoryHierarchyValidationError:
// this is a request-shape problem (self-parent, cycle, depth overflow), not a
// stable API error the client branches on by code.
export class NoteHierarchyValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NoteHierarchyValidationError";
  }
}

export class NoteFolderLimitReachedError extends Error {
  readonly code = "NOTE_FOLDER_LIMIT_REACHED";

  constructor(message: string) {
    super(message);
    this.name = "NoteFolderLimitReachedError";
  }
}

// --- Read model ---

// Flat, not a tree: the client (and a later MCP tool) can rebuild the tree
// from parentFolderId cheaply, and a flat shape is one predicate for both
// "list everything" and "list one level" instead of two response shapes.
export interface NoteFolderNode {
  id: string;
  name: string;
  parentFolderId: string | null;
  depth: number;
  position: number;
  noteCount: number;
  createdAt: Date;
  updatedAt: Date;
}

const FOLDER_INCLUDE = {
  _count: { select: { notes: true } },
} satisfies Prisma.NoteFolderInclude;

type FolderRow = Prisma.NoteFolderGetPayload<{
  include: typeof FOLDER_INCLUDE;
}>;

function toFolderNode(folder: FolderRow): NoteFolderNode {
  return {
    id: folder.id,
    name: folder.name,
    parentFolderId: folder.parentFolderId,
    depth: folder.depth,
    position: folder.position,
    noteCount: folder._count.notes,
    createdAt: folder.createdAt,
    updatedAt: folder.updatedAt,
  };
}

export async function listFolders(
  workspaceId: string,
): Promise<NoteFolderNode[]> {
  const folders = await db.noteFolder.findMany({
    where: { workspaceId },
    orderBy: [{ parentFolderId: "asc" }, { position: "asc" }, { id: "asc" }],
    include: FOLDER_INCLUDE,
  });
  return folders.map(toFolderNode);
}

export async function getFolder(
  workspaceId: string,
  id: string,
): Promise<NoteFolderNode | null> {
  const folder = await db.noteFolder.findFirst({
    where: { id, workspaceId },
    include: FOLDER_INCLUDE,
  });
  return folder ? toFolderNode(folder) : null;
}

// --- Shared helpers ---

function assertNotSelfParent(id: string, parentFolderId: string): void {
  if (id === parentFolderId) {
    throw new NoteHierarchyValidationError(
      "A folder cannot be its own parent.",
    );
  }
}

// A missing/foreign parentFolderId is treated the same as any other foreign
// id in this service: it looks like "not found", not a validation error, so
// it can never disclose whether an id exists in another workspace.
async function requireFolderRow(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  id: string,
): Promise<{ id: string; parentFolderId: string | null; depth: number }> {
  const folder = await tx.noteFolder.findFirst({
    where: { id, workspaceId },
    select: { id: true, parentFolderId: true, depth: true },
  });
  if (!folder) throw new NoteFolderNotFoundError();
  return folder;
}

function toNotFound(error: unknown): unknown {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2025"
  ) {
    return new NoteFolderNotFoundError();
  }
  return error;
}

// Both partial unique indexes (root siblings and in-folder siblings) map to
// the same domain error — the client doesn't need to know which one fired.
function toNameConflict(error: unknown): unknown {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  ) {
    return new NoteFolderNameConflictError();
  }
  return error;
}

// --- Create ---

export async function createFolder(
  workspaceId: string,
  input: NoteFolderCreateInput,
): Promise<NoteFolderNode> {
  // Same normalization function as notes' normalizedTitle: same semantics of
  // "these two strings address the same thing" applies to folder names too
  // (NFC + casefold + trailing-dot strip), so "Inbox" and "inbox" collide the
  // same way "Home" and "home" would for a note title.
  const normalizedName = normalizeTitle(input.name);

  try {
    const folder = await db.$transaction(async (tx) => {
      const count = await tx.noteFolder.count({ where: { workspaceId } });
      if (count >= NOTE_FOLDER_LIMIT) {
        throw new NoteFolderLimitReachedError(
          "Workspace folder limit reached.",
        );
      }

      let depth = 0;
      let parentFolderId: string | null = null;
      if (input.parentFolderId != null) {
        const parent = await requireFolderRow(
          tx,
          workspaceId,
          input.parentFolderId,
        );
        parentFolderId = parent.id;
        depth = parent.depth + 1;
        if (depth > NOTE_FOLDER_MAX_DEPTH) {
          throw new NoteHierarchyValidationError(
            `Folder nesting cannot exceed ${NOTE_FOLDER_MAX_DEPTH} levels.`,
          );
        }
      }

      const last = await tx.noteFolder.findFirst({
        where: { workspaceId, parentFolderId },
        orderBy: { position: "desc" },
        select: { position: true },
      });

      return tx.noteFolder.create({
        data: {
          workspaceId,
          name: input.name,
          normalizedName,
          parentFolderId,
          parentFolderWorkspaceId: parentFolderId != null ? workspaceId : null,
          depth,
          position: (last?.position ?? -1) + 1,
        },
        include: FOLDER_INCLUDE,
      });
    });

    return toFolderNode(folder);
  } catch (error) {
    // Not a pre-check + insert (that would race two concurrent creates of
    // the same name); the unique index is the source of truth and P2002 is
    // translated after the fact.
    throw toNameConflict(error);
  }
}

// --- Update (rename and/or move) ---

export async function updateFolder(
  workspaceId: string,
  id: string,
  input: NoteFolderUpdateInput,
): Promise<NoteFolderNode> {
  try {
    const folder = await db.$transaction(async (tx) => {
      const existing = await requireFolderRow(tx, workspaceId, id);

      const nameChanged = input.name !== undefined;
      const namePatch = nameChanged
        ? { name: input.name, normalizedName: normalizeTitle(input.name!) }
        : {};

      // undefined = rename only, no move requested at all. null is a real
      // request ("move to the vault root"), so it must fall into the move
      // branch below, not be treated like "no change".
      if (input.parentFolderId === undefined) {
        return tx.noteFolder.update({
          where: { id_workspaceId: { id, workspaceId } },
          data: namePatch,
          include: FOLDER_INCLUDE,
        });
      }

      const newParentId = input.parentFolderId;
      let newDepth = 0;

      if (newParentId !== null) {
        assertNotSelfParent(id, newParentId);
        const parent = await requireFolderRow(tx, workspaceId, newParentId);
        newDepth = parent.depth + 1;

        // Cycle guard: walk from the candidate parent up to the root. The
        // CHECK constraint in the migration only rejects the immediate
        // self-parent case (A -> A); a longer cycle (A -> B -> C -> A) needs
        // rows compared to each other, which only this recursive CTE can do
        // before the write commits.
        const ancestors = await tx.$queryRaw<{ id: string }[]>`
          WITH RECURSIVE ancestors AS (
            SELECT "id", "parentFolderId"
            FROM "NoteFolder"
            WHERE "id" = ${newParentId} AND "workspaceId" = ${workspaceId}
            UNION ALL
            SELECT nf."id", nf."parentFolderId"
            FROM "NoteFolder" nf
            INNER JOIN ancestors a ON nf."id" = a."parentFolderId"
            WHERE nf."workspaceId" = ${workspaceId}
          )
          SELECT "id" FROM ancestors
        `;
        if (ancestors.some((row) => row.id === id)) {
          throw new NoteHierarchyValidationError(
            "Cannot move a folder into one of its own descendants.",
          );
        }
      }

      if (newParentId === existing.parentFolderId) {
        // Same parent as before — a rename (or a no-op), not a move. No
        // depth recompute, no reposition.
        return tx.noteFolder.update({
          where: { id_workspaceId: { id, workspaceId } },
          data: namePatch,
          include: FOLDER_INCLUDE,
        });
      }

      const delta = newDepth - existing.depth;

      // The whole subtree (this folder and every descendant) shifts by the
      // same delta. Checked against the OLD depths before any write, so a
      // would-be depth-8 violation three levels down surfaces as this
      // domain error instead of a raw Postgres CHECK failure.
      const subtree = await tx.$queryRaw<{ depth: number }[]>`
        WITH RECURSIVE subtree AS (
          SELECT "id", "depth"
          FROM "NoteFolder"
          WHERE "id" = ${id} AND "workspaceId" = ${workspaceId}
          UNION ALL
          SELECT nf."id", nf."depth"
          FROM "NoteFolder" nf
          INNER JOIN subtree s ON nf."parentFolderId" = s."id"
          WHERE nf."workspaceId" = ${workspaceId}
        )
        SELECT "depth" FROM subtree
      `;
      const maxDepth = Math.max(...subtree.map((row) => row.depth));
      if (maxDepth + delta > NOTE_FOLDER_MAX_DEPTH) {
        throw new NoteHierarchyValidationError(
          `Moving this folder would put a descendant past ${NOTE_FOLDER_MAX_DEPTH} levels of nesting.`,
        );
      }

      const last = await tx.noteFolder.findFirst({
        where: { workspaceId, parentFolderId: newParentId },
        orderBy: { position: "desc" },
        select: { position: true },
      });

      const updated = await tx.noteFolder.update({
        where: { id_workspaceId: { id, workspaceId } },
        data: {
          ...namePatch,
          parentFolderId: newParentId,
          parentFolderWorkspaceId: newParentId != null ? workspaceId : null,
          depth: newDepth,
          position: (last?.position ?? -1) + 1,
        },
        include: FOLDER_INCLUDE,
      });

      // Descendants' parentFolderId pointers are unchanged (only the moved
      // folder's own parent changed), so a fresh downward walk from `id`
      // still finds exactly the same subtree and can shift every row but the
      // top one by the same delta in a single statement.
      if (delta !== 0) {
        await tx.$executeRaw`
          WITH RECURSIVE subtree AS (
            SELECT "id" FROM "NoteFolder" WHERE "id" = ${id} AND "workspaceId" = ${workspaceId}
            UNION ALL
            SELECT nf."id" FROM "NoteFolder" nf
            INNER JOIN subtree s ON nf."parentFolderId" = s."id"
            WHERE nf."workspaceId" = ${workspaceId}
          )
          UPDATE "NoteFolder"
          SET "depth" = "depth" + ${delta}
          WHERE "workspaceId" = ${workspaceId}
            AND "id" IN (SELECT "id" FROM subtree WHERE "id" <> ${id})
        `;
      }

      return updated;
    });

    return toFolderNode(folder);
  } catch (error) {
    throw toNameConflict(error);
  }
}

// --- Reorder ---

export async function reorderFolders(
  workspaceId: string,
  input: NoteFolderReorderInput,
): Promise<void> {
  const ids = [...new Set(input.order)];
  if (ids.length !== input.order.length) {
    throw new NoteHierarchyValidationError(
      "Duplicate id in the requested order.",
    );
  }

  await db.$transaction(async (tx) => {
    // Every id must actually be a sibling under the given parent, in this
    // workspace — otherwise a foreign or mismatched-parent id could smuggle
    // itself into the position sequence.
    const found = await tx.noteFolder.findMany({
      where: {
        workspaceId,
        parentFolderId: input.parentFolderId,
        id: { in: ids },
      },
      select: { id: true },
    });
    if (found.length !== ids.length) {
      throw new NoteHierarchyValidationError(
        "Unknown folder in the requested order.",
      );
    }
    for (const [index, id] of ids.entries()) {
      await tx.noteFolder.update({
        where: { id_workspaceId: { id, workspaceId } },
        data: { position: index },
      });
    }
  });
}

// --- Delete ---

// The subtree (child folders and their notes) is removed by the database:
// NoteFolder's self-relation and Note.folderId both cascade on delete.
export async function deleteFolder(
  workspaceId: string,
  id: string,
): Promise<void> {
  try {
    await db.noteFolder.delete({
      where: { id_workspaceId: { id, workspaceId } },
    });
  } catch (error) {
    throw toNotFound(error);
  }
}
