import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import {
  NOTE_IMAGE_MAX_BYTES,
  isNoteImageUrl,
  noteImageMarkdown,
  noteImageUrl,
} from "@/lib/notes/images";
import * as imagesService from "@/lib/services/note-images";
import * as notesService from "@/lib/services/notes";

let workspaceId: string;
let otherWorkspaceId: string;
// Member of workspaceId only.
let memberId: string;

async function makeWorkspace(slugPrefix: string): Promise<string> {
  const workspace = await db.workspace.create({
    data: {
      name: "Note images test workspace",
      slug: `${slugPrefix}-${randomUUID()}`,
      updatedAt: new Date(),
    },
  });
  return workspace.id;
}

// Only the leading magic bytes matter to the service; the tail makes each
// fixture distinct so sha256 dedupe does not collapse unrelated cases.
function image(
  header: number[],
  tag: string = randomUUID(),
  padding?: number,
): Uint8Array {
  const tail = Buffer.from(tag);
  const out = new Uint8Array(padding ?? header.length + tail.length);
  out.set(header, 0);
  if (padding === undefined) out.set(tail, header.length);
  return out;
}

const PNG_HEADER = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG_HEADER = [0xff, 0xd8, 0xff, 0xe0];
const WEBP_HEADER = [
  ...Buffer.from("RIFF"),
  0x10,
  0x00,
  0x00,
  0x00,
  ...Buffer.from("WEBP"),
];

const png = (tag?: string) => image(PNG_HEADER, tag);

async function imageCount(id = workspaceId): Promise<number> {
  return db.noteImage.count({ where: { workspaceId: id } });
}

beforeAll(async () => {
  workspaceId = await makeWorkspace("note-images");
  otherWorkspaceId = await makeWorkspace("note-images-other");
  const member = await db.operator.create({
    data: { username: `note-images-member-${randomUUID()}` },
  });
  memberId = member.id;
  await db.workspaceMember.create({
    data: { workspaceId, operatorId: memberId, role: "OWNER" },
  });
});

afterAll(async () => {
  for (const id of [workspaceId, otherWorkspaceId]) {
    if (id) await db.workspace.delete({ where: { id } }).catch(() => {});
  }
  if (memberId) {
    await db.operator.delete({ where: { id: memberId } }).catch(() => {});
  }
});

beforeEach(async () => {
  const scope = { workspaceId: { in: [workspaceId, otherWorkspaceId] } };
  await db.noteImage.deleteMany({ where: scope });
  await db.note.deleteMany({ where: scope });
});

describe("createNoteImage: accepted types", () => {
  it.each([
    ["image/png", PNG_HEADER],
    ["image/jpeg", JPEG_HEADER],
    ["image/webp", WEBP_HEADER],
  ])("stores a %s image and returns its url and markdown", async (type, h) => {
    const created = await imagesService.createNoteImage(workspaceId, {
      bytes: image(h),
      alt: "Contact sheet",
    });

    expect(created.url).toBe(noteImageUrl(created.id));
    expect(created.markdown).toBe(
      noteImageMarkdown(created.id, "Contact sheet"),
    );
    // Prisma's generated ids must satisfy the shape isNoteImageUrl accepts,
    // or every uploaded image would be dropped from note content.
    expect(isNoteImageUrl(created.url)).toBe(true);

    const row = await db.noteImage.findUniqueOrThrow({
      where: { id: created.id },
    });
    expect(row.contentType).toBe(type);
    expect(row.noteId).toBeNull();
    expect(row.noteWorkspaceId).toBeNull();
    expect(row.byteSize).toBe(row.bytes.byteLength);
    expect(row.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("accepts an image of exactly the maximum size", async () => {
    const created = await imagesService.createNoteImage(workspaceId, {
      bytes: image(PNG_HEADER, undefined, NOTE_IMAGE_MAX_BYTES),
    });
    const fetched = await imagesService.getNoteImageForOperator(
      memberId,
      created.id,
    );
    expect(fetched?.byteSize).toBe(NOTE_IMAGE_MAX_BYTES);
  });
});

describe("createNoteImage: rejected input writes nothing", () => {
  it("rejects SVG", async () => {
    await expect(
      imagesService.createNoteImage(workspaceId, {
        bytes: new Uint8Array(
          Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'),
        ),
      }),
    ).rejects.toBeInstanceOf(imagesService.NoteImageUnsupportedTypeError);
    expect(await imageCount()).toBe(0);
  });

  it("rejects text content, whatever name or type it was uploaded under", async () => {
    // The service takes no filename or declared type, so "evil.png" sent as
    // image/png reaches it as plain text bytes.
    await expect(
      imagesService.createNoteImage(workspaceId, {
        bytes: new Uint8Array(
          Buffer.from("<html>pretending to be a png</html>"),
        ),
      }),
    ).rejects.toMatchObject({ code: "NOTE_IMAGE_UNSUPPORTED_TYPE" });
    expect(await imageCount()).toBe(0);
  });

  it("rejects a truncated header", async () => {
    await expect(
      imagesService.createNoteImage(workspaceId, {
        bytes: Uint8Array.from(PNG_HEADER.slice(0, 5)),
      }),
    ).rejects.toBeInstanceOf(imagesService.NoteImageUnsupportedTypeError);
    expect(await imageCount()).toBe(0);
  });

  it("rejects an empty upload", async () => {
    await expect(
      imagesService.createNoteImage(workspaceId, { bytes: new Uint8Array(0) }),
    ).rejects.toMatchObject({ code: "NOTE_IMAGE_INVALID" });
    expect(await imageCount()).toBe(0);
  });

  it("rejects an oversize image before looking at its type", async () => {
    // Not even a valid image: the size check must come first.
    await expect(
      imagesService.createNoteImage(workspaceId, {
        bytes: new Uint8Array(NOTE_IMAGE_MAX_BYTES + 1),
      }),
    ).rejects.toMatchObject({ code: "NOTE_IMAGE_TOO_LARGE" });
    await expect(
      imagesService.createNoteImage(workspaceId, {
        bytes: image(PNG_HEADER, undefined, NOTE_IMAGE_MAX_BYTES + 1),
      }),
    ).rejects.toBeInstanceOf(imagesService.NoteImageTooLargeError);
    expect(await imageCount()).toBe(0);
  });

  it("rejects a noteId that is missing or belongs to another workspace", async () => {
    const foreign = await notesService.createNote(otherWorkspaceId, {
      title: "Foreign note",
    });
    for (const noteId of ["nonexistent-id", foreign.id]) {
      await expect(
        imagesService.createNoteImage(workspaceId, {
          bytes: png(),
          noteId,
        }),
      ).rejects.toBeInstanceOf(notesService.NoteNotFoundError);
    }
    expect(await imageCount()).toBe(0);
    expect(await imageCount(otherWorkspaceId)).toBe(0);
  });
});

describe("createNoteImage: idempotency", () => {
  it("returns the same id for identical bytes", async () => {
    const bytes = png("same-bytes");
    const first = await imagesService.createNoteImage(workspaceId, { bytes });
    const second = await imagesService.createNoteImage(workspaceId, { bytes });

    expect(second).toEqual(first);
    expect(await imageCount()).toBe(1);
  });

  it("returns the same id but a markdown carrying the new alt text", async () => {
    const bytes = png("same-bytes-alt");
    const first = await imagesService.createNoteImage(workspaceId, {
      bytes,
      alt: "First",
    });
    const second = await imagesService.createNoteImage(workspaceId, {
      bytes,
      alt: "Second",
    });

    expect(second.id).toBe(first.id);
    expect(second.markdown).toBe(noteImageMarkdown(first.id, "Second"));
    expect(await imageCount()).toBe(1);
  });

  it("does not share a row across workspaces", async () => {
    const bytes = png("cross-workspace");
    const mine = await imagesService.createNoteImage(workspaceId, { bytes });
    const theirs = await imagesService.createNoteImage(otherWorkspaceId, {
      bytes,
    });

    expect(theirs.id).not.toBe(mine.id);
  });

  it("does not share a row across notes, nor between a note and the unattached pool", async () => {
    const bytes = png("cross-note");
    const noteA = await notesService.createNote(workspaceId, { title: "A" });
    const noteB = await notesService.createNote(workspaceId, { title: "B" });

    const unattached = await imagesService.createNoteImage(workspaceId, {
      bytes,
    });
    const inA = await imagesService.createNoteImage(workspaceId, {
      bytes,
      noteId: noteA.id,
    });
    const inAAgain = await imagesService.createNoteImage(workspaceId, {
      bytes,
      noteId: noteA.id,
    });
    const inB = await imagesService.createNoteImage(workspaceId, {
      bytes,
      noteId: noteB.id,
    });

    expect(new Set([unattached.id, inA.id, inB.id]).size).toBe(3);
    expect(inAAgain.id).toBe(inA.id);

    const row = await db.noteImage.findUniqueOrThrow({ where: { id: inA.id } });
    expect(row.noteId).toBe(noteA.id);
    expect(row.noteWorkspaceId).toBe(workspaceId);

    // Deleting note A takes only A's copy with it.
    await notesService.deleteNote(workspaceId, noteA.id);
    expect(await db.noteImage.findUnique({ where: { id: inA.id } })).toBeNull();
    expect(
      await db.noteImage.findUnique({ where: { id: inB.id } }),
    ).not.toBeNull();
    expect(
      await db.noteImage.findUnique({ where: { id: unattached.id } }),
    ).not.toBeNull();
  });
});

describe("getNoteImageForOperator", () => {
  it("returns the stored bytes, detected type and size", async () => {
    const bytes = image(JPEG_HEADER, "jpeg-fetch");
    const created = await imagesService.createNoteImage(workspaceId, {
      bytes,
    });

    const fetched = await imagesService.getNoteImageForOperator(
      memberId,
      created.id,
    );
    expect(fetched).not.toBeNull();
    expect(fetched?.contentType).toBe("image/jpeg");
    expect(fetched?.byteSize).toBe(bytes.byteLength);
    expect(Buffer.from(fetched!.bytes).equals(Buffer.from(bytes))).toBe(true);
  });

  it("returns null for an image of a workspace the operator is not a member of", async () => {
    const created = await imagesService.createNoteImage(otherWorkspaceId, {
      bytes: png(),
    });
    expect(
      await imagesService.getNoteImageForOperator(memberId, created.id),
    ).toBeNull();
  });

  it("returns null for an unknown id", async () => {
    expect(
      await imagesService.getNoteImageForOperator(memberId, "nonexistent-id"),
    ).toBeNull();
  });
});

describe("note lifecycle", () => {
  it("deleting a note deletes its images", async () => {
    const note = await notesService.createNote(workspaceId, {
      title: "Doomed",
    });
    const created = await imagesService.createNoteImage(workspaceId, {
      bytes: png(),
      noteId: note.id,
    });

    await notesService.deleteNote(workspaceId, note.id);

    expect(
      await imagesService.getNoteImageForOperator(memberId, created.id),
    ).toBeNull();
  });

  it("createNote attaches the orphan images its content references", async () => {
    const referenced = await imagesService.createNoteImage(workspaceId, {
      bytes: png(),
    });
    const unreferenced = await imagesService.createNoteImage(workspaceId, {
      bytes: png(),
    });

    const note = await notesService.createNote(workspaceId, {
      title: "With picture",
      content: `Intro\n\n${referenced.markdown}\n`,
    });

    const rows = await db.noteImage.findMany({
      where: { id: { in: [referenced.id, unreferenced.id] } },
    });
    const byId = new Map(rows.map((row) => [row.id, row]));
    expect(byId.get(referenced.id)?.noteId).toBe(note.id);
    expect(byId.get(referenced.id)?.noteWorkspaceId).toBe(workspaceId);
    expect(byId.get(unreferenced.id)?.noteId).toBeNull();
  });

  it("updateNote attaches images referenced by new content, and only then", async () => {
    const note = await notesService.createNote(workspaceId, {
      title: "Editing",
    });
    const created = await imagesService.createNoteImage(workspaceId, {
      bytes: png(),
    });

    // A title-only update does not touch images.
    const renamed = await notesService.updateNote(workspaceId, note.id, {
      version: note.version,
      title: "Editing renamed",
    });
    expect(
      (await db.noteImage.findUniqueOrThrow({ where: { id: created.id } }))
        .noteId,
    ).toBeNull();

    await notesService.updateNote(workspaceId, note.id, {
      version: renamed.version,
      content: `Now with ${created.markdown}`,
    });
    expect(
      (await db.noteImage.findUniqueOrThrow({ where: { id: created.id } }))
        .noteId,
    ).toBe(note.id);
  });

  it("does not attach when the update loses a version conflict", async () => {
    const note = await notesService.createNote(workspaceId, {
      title: "Conflict",
    });
    const created = await imagesService.createNoteImage(workspaceId, {
      bytes: png(),
    });

    await expect(
      notesService.updateNote(workspaceId, note.id, {
        version: note.version + 5,
        content: created.markdown,
      }),
    ).rejects.toBeInstanceOf(notesService.NoteVersionConflictError);
    expect(
      (await db.noteImage.findUniqueOrThrow({ where: { id: created.id } }))
        .noteId,
    ).toBeNull();
  });

  it("leaves images that belong to another note or workspace alone", async () => {
    const owner = await notesService.createNote(workspaceId, {
      title: "Owner",
    });
    const owned = await imagesService.createNoteImage(workspaceId, {
      bytes: png(),
      noteId: owner.id,
    });
    const foreign = await imagesService.createNoteImage(otherWorkspaceId, {
      bytes: png(),
    });

    await notesService.createNote(workspaceId, {
      title: "Thief",
      content: `${owned.markdown}\n${foreign.markdown}`,
    });

    expect(
      (await db.noteImage.findUniqueOrThrow({ where: { id: owned.id } }))
        .noteId,
    ).toBe(owner.id);
    expect(
      (await db.noteImage.findUniqueOrThrow({ where: { id: foreign.id } }))
        .noteId,
    ).toBeNull();
  });
});

describe("pruneOrphanNoteImages", () => {
  it("deletes unreferenced orphans but keeps images attached to a note", async () => {
    const referenced = await imagesService.createNoteImage(workspaceId, {
      bytes: png(),
    });
    const orphan = await imagesService.createNoteImage(workspaceId, {
      bytes: png(),
    });
    await notesService.createNote(workspaceId, {
      title: "Keeper",
      content: referenced.markdown,
    });

    const future = new Date(Date.now() + 60_000);
    const deleted = await imagesService.pruneOrphanNoteImages(future, 500);

    expect(deleted).toBe(1);
    expect(
      await db.noteImage.findUnique({ where: { id: orphan.id } }),
    ).toBeNull();
    expect(
      await db.noteImage.findUnique({ where: { id: referenced.id } }),
    ).not.toBeNull();
  });

  it("keeps orphans newer than the cutoff", async () => {
    const fresh = await imagesService.createNoteImage(workspaceId, {
      bytes: png(),
    });
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);

    expect(await imagesService.pruneOrphanNoteImages(cutoff, 500)).toBe(0);
    expect(
      await db.noteImage.findUnique({ where: { id: fresh.id } }),
    ).not.toBeNull();
  });

  it("deletes at most batchSize rows per call", async () => {
    for (let i = 0; i < 3; i += 1) {
      await imagesService.createNoteImage(workspaceId, { bytes: png() });
    }
    const future = new Date(Date.now() + 60_000);

    expect(await imagesService.pruneOrphanNoteImages(future, 2)).toBe(2);
    expect(await imageCount()).toBe(1);
    expect(await imagesService.pruneOrphanNoteImages(future, 2)).toBe(1);
  });
});
