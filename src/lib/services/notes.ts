import { Prisma, type Note } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { buildExcerpt, normalizeTitle } from "@/lib/notes/parse";
import type {
  NoteCreateInput,
  NoteMoveInput,
  NoteSearchQuery,
  NoteUpdateInput,
} from "@/lib/validation/notes";
import { enqueueNoteIndexJob } from "@/lib/services/note-index";

// Sole Prisma caller for Note (folder/hierarchy concerns live in
// src/lib/services/note-folders.ts). Modeled on src/lib/services/kanban.ts:
// workspaceId first, every query scoped by it, P2025/P2002 translated to
// domain errors.

export const NOTE_LIMIT = 10_000;
export const NOTE_SEARCH_PAGE_SIZE = 50;

export class NoteNotFoundError extends Error {
  readonly code = "RESOURCE_NOT_FOUND";

  constructor() {
    super("Note not found.");
    this.name = "NoteNotFoundError";
  }
}

export class NoteTitleConflictError extends Error {
  readonly code = "NOTE_TITLE_CONFLICT";
  readonly suggestedTitle: string;

  constructor(suggestedTitle: string) {
    super("A note with this title already exists.");
    this.name = "NoteTitleConflictError";
    this.suggestedTitle = suggestedTitle;
  }
}

export class NoteVersionConflictError extends Error {
  readonly code = "NOTE_VERSION_CONFLICT";
  readonly currentVersion: number;

  constructor(currentVersion: number) {
    super("The note has changed since it was loaded.");
    this.name = "NoteVersionConflictError";
    this.currentVersion = currentVersion;
  }
}

export class NoteLimitReachedError extends Error {
  readonly code = "NOTE_LIMIT_REACHED";

  constructor(message: string) {
    super(message);
    this.name = "NoteLimitReachedError";
  }
}

// --- Read models ---
// Both are DTOs for the route layer and the client — not Prisma passthrough
// — so the generated (and unreadable, per its Unsupported("tsvector") type)
// searchVector column never has to be excluded field-by-field at the call
// site.

export interface NoteSummary {
  id: string;
  title: string;
  excerpt: string;
  folderId: string | null;
  isPinned: boolean;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface NoteDetail extends NoteSummary {
  content: string;
}

function toSummary(note: Note): NoteSummary {
  return {
    id: note.id,
    title: note.title,
    excerpt: note.excerpt,
    folderId: note.folderId,
    isPinned: note.isPinned,
    version: note.version,
    createdAt: note.createdAt,
    updatedAt: note.updatedAt,
  };
}

function toDetail(note: Note): NoteDetail {
  return { ...toSummary(note), content: note.content };
}

// --- Shared helpers ---

async function requireNoteDetail(
  workspaceId: string,
  id: string,
): Promise<NoteDetail> {
  const note = await getNote(workspaceId, id);
  if (!note) throw new NoteNotFoundError();
  return note;
}

// A missing/foreign folderId is treated like any other foreign id in this
// service: it looks like "not found" rather than a distinct validation
// error, the same convention note-folders.ts uses for a bad parentFolderId.
async function requireFolder(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  folderId: string,
): Promise<void> {
  const folder = await tx.noteFolder.findFirst({
    where: { id: folderId, workspaceId },
    select: { id: true },
  });
  if (!folder) throw new NoteNotFoundError();
}

function toNotFound(error: unknown): unknown {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2025"
  ) {
    return new NoteNotFoundError();
  }
  return error;
}

async function toTitleConflict(
  error: unknown,
  workspaceId: string,
  base: string,
): Promise<unknown> {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  ) {
    return new NoteTitleConflictError(
      await suggestUniqueTitle(workspaceId, base),
    );
  }
  return error;
}

// Descendant folder ids (including the folder itself), for the
// includeSubfolders branch of searchNotes. A recursive CTE run directly
// against NoteFolder here, rather than reusing note-folders.ts's listFolders
// and filtering in memory: search is the hot path and the folder tree's
// noteCount aggregation that listFolders does is work this call doesn't
// need. If the caller's folderId belongs to another workspace or doesn't
// exist, this returns [] and the resulting `folderId IN ()` matches
// nothing — the same "looks like not found" outcome workspace isolation
// requires elsewhere in this service.
async function collectFolderIds(
  workspaceId: string,
  folderId: string,
): Promise<string[]> {
  const rows = await db.$queryRaw<{ id: string }[]>`
    WITH RECURSIVE subtree AS (
      SELECT "id" FROM "NoteFolder" WHERE "id" = ${folderId} AND "workspaceId" = ${workspaceId}
      UNION ALL
      SELECT nf."id" FROM "NoteFolder" nf
      INNER JOIN subtree s ON nf."parentFolderId" = s."id"
      WHERE nf."workspaceId" = ${workspaceId}
    )
    SELECT "id" FROM subtree
  `;
  return rows.map((row) => row.id);
}

// --- Cursor pagination ---
// Same opaque-cursor shape as src/lib/services/services.ts: workspace id +
// sort position + row id, base64url JSON. A cursor from another workspace,
// or one whose sort no longer matches the request, is silently discarded
// (treated as "start from page one") rather than rejected or trusted —
// trusting it would let a cursor minted under workspace A page through
// workspace B's notes once the `w` check is skipped.

interface NoteCursor {
  w: string;
  s: "updatedAt" | "title";
  v: string;
  id: string;
}

function encodeCursor(
  workspaceId: string,
  sort: "updatedAt" | "title",
  note: Pick<Note, "id" | "title" | "updatedAt">,
): string {
  const v = sort === "updatedAt" ? note.updatedAt.toISOString() : note.title;
  return Buffer.from(
    JSON.stringify({ w: workspaceId, s: sort, v, id: note.id }),
  ).toString("base64url");
}

function decodeCursor(cursor: string): NoteCursor | null {
  try {
    const parsed = JSON.parse(
      Buffer.from(cursor, "base64url").toString("utf-8"),
    ) as Partial<NoteCursor>;
    return typeof parsed.w === "string" &&
      (parsed.s === "updatedAt" || parsed.s === "title") &&
      typeof parsed.v === "string" &&
      typeof parsed.id === "string"
      ? { w: parsed.w, s: parsed.s, v: parsed.v, id: parsed.id }
      : null;
  } catch {
    return null;
  }
}

// Keyset (not offset) pagination: updatedAt sorts newest-first (`<` walks
// toward older rows), title sorts A-Z (`>` walks toward later rows). The id
// tiebreak matches the corresponding orderBy exactly, so the comparison can
// never disagree with the order it is paging through.
function cursorWhere(
  sort: "updatedAt" | "title",
  cursor: NoteCursor,
): Prisma.NoteWhereInput {
  if (sort === "updatedAt") {
    const value = new Date(cursor.v);
    return {
      OR: [
        { updatedAt: { lt: value } },
        { updatedAt: value, id: { lt: cursor.id } },
      ],
    };
  }
  return {
    OR: [
      { title: { gt: cursor.v } },
      { title: cursor.v, id: { gt: cursor.id } },
    ],
  };
}

// --- Search ---
// THE single place the note search predicate lives. Every caller —
// the /api/notes browser route, /api/v1/notes, and the future MCP notes
// tool — must call this function rather than reimplement the filter, the
// same lesson src/lib/services/kanban.ts's searchCards learned the hard way
// (src/lib/mcp/tools/kanban.ts once duplicated kanbanService.searchCards's
// predicate and the two silently drifted). Do not add a second query-building
// path here for a new caller; extend this one instead.
export async function searchNotes(
  workspaceId: string,
  filters: NoteSearchQuery,
): Promise<{ items: NoteSummary[]; total: number; nextCursor: string | null }> {
  const sort = filters.sort ?? "updatedAt";
  const limit = filters.limit ?? NOTE_SEARCH_PAGE_SIZE;

  const folderWhere: Prisma.NoteWhereInput = {};
  if (filters.folderId !== undefined) {
    if (filters.includeSubfolders) {
      const ids = await collectFolderIds(workspaceId, filters.folderId);
      folderWhere.folderId = { in: ids };
    } else {
      folderWhere.folderId = filters.folderId;
    }
  }

  // Slice 1: plain substring match via Prisma `contains`. Slice 4 adds a
  // second branch here — a $queryRaw query over the generated `searchVector`
  // column (ts_rank_cd against to_tsquery('simple', ...)) — chosen by the
  // same `filters.query` input, still inside this one function. Do not write
  // that branch yet; this comment is the marker for where it goes.
  const queryWhere: Prisma.NoteWhereInput = filters.query
    ? {
        OR: [
          { title: { contains: filters.query, mode: "insensitive" } },
          { content: { contains: filters.query, mode: "insensitive" } },
        ],
      }
    : {};

  const baseWhere: Prisma.NoteWhereInput = {
    workspaceId,
    ...folderWhere,
    ...queryWhere,
  };

  const decoded = filters.cursor ? decodeCursor(filters.cursor) : null;
  const cursor =
    decoded && decoded.w === workspaceId && decoded.s === sort ? decoded : null;

  const where: Prisma.NoteWhereInput = cursor
    ? { AND: [baseWhere, cursorWhere(sort, cursor)] }
    : baseWhere;

  const orderBy: Prisma.NoteOrderByWithRelationInput[] =
    sort === "updatedAt"
      ? [{ updatedAt: "desc" }, { id: "desc" }]
      : [{ title: "asc" }, { id: "asc" }];

  const [rows, total] = await Promise.all([
    db.note.findMany({ where, orderBy, take: limit + 1 }),
    db.note.count({ where: baseWhere }),
  ]);

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const last = page[page.length - 1];
  const nextCursor =
    hasMore && last ? encodeCursor(workspaceId, sort, last) : null;

  return { items: page.map(toSummary), total, nextCursor };
}

export async function getNote(
  workspaceId: string,
  id: string,
): Promise<NoteDetail | null> {
  const note = await db.note.findFirst({ where: { id, workspaceId } });
  return note ? toDetail(note) : null;
}

export async function getNoteByTitle(
  workspaceId: string,
  title: string,
): Promise<NoteSummary | null> {
  const note = await db.note.findFirst({
    where: { workspaceId, normalizedTitle: normalizeTitle(title) },
  });
  return note ? toSummary(note) : null;
}

export async function createNote(
  workspaceId: string,
  input: NoteCreateInput,
): Promise<NoteDetail> {
  const content = input.content ?? "";

  try {
    const note = await db.$transaction(async (tx) => {
      const count = await tx.note.count({ where: { workspaceId } });
      if (count >= NOTE_LIMIT) {
        throw new NoteLimitReachedError("Workspace note limit reached.");
      }
      if (input.folderId != null) {
        await requireFolder(tx, workspaceId, input.folderId);
      }
      return tx.note.create({
        data: {
          workspaceId,
          folderId: input.folderId ?? null,
          folderWorkspaceId: input.folderId != null ? workspaceId : null,
          title: input.title,
          normalizedTitle: normalizeTitle(input.title),
          content,
          excerpt: buildExcerpt(content),
        },
      });
    });
    const detail = toDetail(note);
    await enqueueNoteIndexJob(workspaceId, detail.id, detail.version);
    return detail;
  } catch (error) {
    throw await toTitleConflict(error, workspaceId, input.title);
  }
}

// Optimistic concurrency via updateMany + a version predicate, not a plain
// update: `update` would happily overwrite a stale write. count === 0 is
// ambiguous by itself (missing row vs. stale version), so it's disambiguated
// with a follow-up read.
//
// The counter is a dedicated `version` column rather than a check against
// `updatedAt`, because updatedAt also moves when link re-indexing
// (a later slice) touches a note after someone else renamed the note it
// points at — that would look like a conflict to an operator who is still
// mid-edit on unrelated content, even though nothing they were editing
// actually changed underneath them.
export async function updateNote(
  workspaceId: string,
  id: string,
  input: NoteUpdateInput,
): Promise<NoteDetail> {
  const data: Prisma.NoteUpdateManyMutationInput = {
    version: { increment: 1 },
  };
  if (input.title !== undefined) {
    data.title = input.title;
    data.normalizedTitle = normalizeTitle(input.title);
  }
  if (input.content !== undefined) {
    data.content = input.content;
    data.excerpt = buildExcerpt(input.content);
  }

  let result: Prisma.BatchPayload;
  try {
    result = await db.note.updateMany({
      where: { id, workspaceId, version: input.version },
      data,
    });
  } catch (error) {
    // P2002 here can only be the normalizedTitle unique constraint, and only
    // reachable when input.title changed the value, so input.title is
    // defined whenever this fires.
    throw await toTitleConflict(error, workspaceId, input.title!);
  }

  if (result.count === 0) {
    const existing = await db.note.findFirst({
      where: { id, workspaceId },
      select: { version: true },
    });
    if (!existing) throw new NoteNotFoundError();
    throw new NoteVersionConflictError(existing.version);
  }

  const detail = await requireNoteDetail(workspaceId, id);
  await enqueueNoteIndexJob(workspaceId, detail.id, detail.version);
  return detail;
}

export async function moveNote(
  workspaceId: string,
  id: string,
  input: NoteMoveInput,
): Promise<NoteSummary> {
  const note = await db.$transaction(async (tx) => {
    const existing = await tx.note.findFirst({
      where: { id, workspaceId },
      select: { id: true },
    });
    if (!existing) throw new NoteNotFoundError();
    if (input.folderId != null) {
      await requireFolder(tx, workspaceId, input.folderId);
    }
    return tx.note.update({
      where: { id_workspaceId: { id, workspaceId } },
      data: {
        folderId: input.folderId,
        folderWorkspaceId: input.folderId != null ? workspaceId : null,
      },
    });
  });
  return toSummary(note);
}

export async function deleteNote(
  workspaceId: string,
  id: string,
): Promise<void> {
  try {
    await db.note.delete({ where: { id_workspaceId: { id, workspaceId } } });
  } catch (error) {
    throw toNotFound(error);
  }
}

// Picks the first free "base N" (N >= 2) — bare `base` is never returned,
// since a caller only reaches here after a conflict on that exact title. One
// query fetches every title that could possibly collide, then the free
// number is found in memory: querying "base 2", "base 3", ... one at a time
// would be both slow and still race-prone under concurrent creates.
export async function suggestUniqueTitle(
  workspaceId: string,
  base: string,
): Promise<string> {
  const trimmedBase = base.trim();
  const normalizedBase = normalizeTitle(trimmedBase);

  const rows = await db.note.findMany({
    where: {
      workspaceId,
      OR: [
        { normalizedTitle: normalizedBase },
        { normalizedTitle: { startsWith: `${normalizedBase} ` } },
      ],
    },
    select: { normalizedTitle: true },
  });
  const taken = new Set(rows.map((row) => row.normalizedTitle));

  // Bounded by taken.size + 1: every iteration either finds a free slot or
  // consumes one more entry of a finite set, so this can never spin forever
  // — including when trimmedBase is empty.
  let n = 2;
  while (taken.has(normalizeTitle(`${trimmedBase} ${n}`))) {
    n += 1;
  }
  return `${trimmedBase} ${n}`;
}
