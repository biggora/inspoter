import { createHash } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import {
  NOTE_IMAGE_MAX_BYTES,
  detectNoteImageType,
  extractNoteImageIds,
  noteImageMarkdown,
  noteImageUrl,
} from "@/lib/notes/images";
import { NoteNotFoundError } from "@/lib/services/notes";

// Sole Prisma caller for NoteImage. An image is uploaded first, possibly
// before the note that will reference it exists, so rows start out with
// noteId = null and are linked by attachNoteImages when a note is saved with
// the image in its content. Rows still unlinked after the grace period are
// removed by pruneOrphanNoteImages.

export class NoteImageTooLargeError extends Error {
  readonly code = "NOTE_IMAGE_TOO_LARGE";

  constructor() {
    super("Image exceeds the maximum size.");
    this.name = "NoteImageTooLargeError";
  }
}

export class NoteImageUnsupportedTypeError extends Error {
  readonly code = "NOTE_IMAGE_UNSUPPORTED_TYPE";

  constructor() {
    super("Only PNG, JPEG and WebP images are supported.");
    this.name = "NoteImageUnsupportedTypeError";
  }
}

export class NoteImageInvalidError extends Error {
  readonly code = "NOTE_IMAGE_INVALID";

  constructor() {
    super("The image is empty or malformed.");
    this.name = "NoteImageInvalidError";
  }
}

export interface NoteImageRef {
  id: string;
  url: string;
  markdown: string;
}

function toRef(id: string, alt: string | undefined): NoteImageRef {
  return { id, url: noteImageUrl(id), markdown: noteImageMarkdown(id, alt) };
}

// Order matters: size and type are decided from the bytes before anything is
// written. The declared upload type is deliberately not an input — only the
// magic bytes count.
//
// Dedupe is scoped to the same (workspace, sha256, noteId) rather than just
// (workspace, sha256): a row shared across notes would vanish with the first
// note's deletion (onDelete: Cascade) and break the others. A repeat upload
// to the same note, or two unattached uploads, return the existing row.
export async function createNoteImage(
  workspaceId: string,
  input: { bytes: Uint8Array; alt?: string; noteId?: string | null },
): Promise<NoteImageRef> {
  const { bytes, alt } = input;
  if (bytes.byteLength === 0) throw new NoteImageInvalidError();
  if (bytes.byteLength > NOTE_IMAGE_MAX_BYTES) {
    throw new NoteImageTooLargeError();
  }
  const contentType = detectNoteImageType(bytes);
  if (contentType === null) throw new NoteImageUnsupportedTypeError();

  const noteId = input.noteId ?? null;
  if (noteId !== null) {
    const note = await db.note.findFirst({
      where: { id: noteId, workspaceId },
      select: { id: true },
    });
    if (!note) throw new NoteNotFoundError();
  }

  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const existing = await db.noteImage.findFirst({
    where: { workspaceId, sha256, noteId },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true },
  });
  if (existing) return toRef(existing.id, alt);

  const created = await db.noteImage.create({
    data: {
      workspaceId,
      noteId,
      noteWorkspaceId: noteId === null ? null : workspaceId,
      contentType,
      bytes: Buffer.from(bytes),
      byteSize: bytes.byteLength,
      sha256,
    },
    select: { id: true },
  });
  return toRef(created.id, alt);
}

export async function getNoteImage(
  workspaceId: string,
  id: string,
): Promise<{
  bytes: Uint8Array;
  contentType: string;
  byteSize: number;
} | null> {
  const image = await db.noteImage.findFirst({
    where: { id, workspaceId },
    select: { bytes: true, contentType: true, byteSize: true },
  });
  return image
    ? {
        bytes: new Uint8Array(image.bytes),
        contentType: image.contentType,
        byteSize: image.byteSize,
      }
    : null;
}

// Links the still-unattached images a note's content references to that note,
// so the orphan sweep does not delete them. Runs inside the caller's
// transaction. Images already attached to another note are left alone
// (noteId: null in the predicate): moving them would silently strip the
// image from the note that owns it. Ids from another workspace never match
// the workspaceId predicate.
export async function attachNoteImages(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  noteId: string,
  content: string,
): Promise<void> {
  const ids = extractNoteImageIds(content);
  if (ids.length === 0) return;
  await tx.noteImage.updateMany({
    where: { id: { in: ids }, workspaceId, noteId: null },
    data: { noteId, noteWorkspaceId: workspaceId },
  });
}

// Bounded batch (select ids, then deleteMany), same shape as
// pruneOldDeliveries, so a large backlog drains over several ticks. The
// delete re-checks noteId: null so a row attached between the select and the
// delete survives.
export async function pruneOrphanNoteImages(
  cutoff: Date,
  batchSize: number,
): Promise<number> {
  const candidates = await db.noteImage.findMany({
    where: { noteId: null, createdAt: { lt: cutoff } },
    orderBy: { createdAt: "asc" },
    select: { id: true },
    take: batchSize,
  });
  if (candidates.length === 0) return 0;
  const result = await db.noteImage.deleteMany({
    where: { id: { in: candidates.map((c) => c.id) }, noteId: null },
  });
  return result.count;
}
