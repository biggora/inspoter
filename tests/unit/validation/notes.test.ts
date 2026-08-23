import { describe, expect, it } from "vitest";

import {
  NOTE_FOLDER_NAME_MAX,
  NOTE_TITLE_MAX,
  noteCreateSchema,
  noteFolderCreateSchema,
  noteFolderReorderSchema,
  noteFolderUpdateSchema,
  noteMoveSchema,
  noteSearchQuerySchema,
  noteUpdateSchema,
} from "@/lib/validation/notes";

describe("noteCreateSchema", () => {
  it("trims the title and rejects an empty one", () => {
    expect(noteCreateSchema.parse({ title: "  Hello  " }).title).toBe("Hello");
    expect(noteCreateSchema.safeParse({ title: "   " }).success).toBe(false);
  });

  it("accepts a title exactly at the max and rejects one over it", () => {
    expect(
      noteCreateSchema.safeParse({ title: "x".repeat(NOTE_TITLE_MAX) }).success,
    ).toBe(true);
    expect(
      noteCreateSchema.safeParse({ title: "x".repeat(NOTE_TITLE_MAX + 1) })
        .success,
    ).toBe(false);
  });

  it("accepts a null folderId (root) and rejects an empty string", () => {
    expect(
      noteCreateSchema.safeParse({ title: "Note", folderId: null }).success,
    ).toBe(true);
    expect(
      noteCreateSchema.safeParse({ title: "Note", folderId: "" }).success,
    ).toBe(false);
    expect(
      noteCreateSchema.safeParse({ title: "Note", folderId: "f1" }).success,
    ).toBe(true);
  });

  // The limit is byte-based, not character-based: a run of multibyte
  // characters can be under the character count while over the byte count.
  it("measures content length in UTF-8 bytes, not characters", () => {
    const cyrillicChar = "Ж"; // 2 bytes in UTF-8
    const charCount = 150_000;
    const content = cyrillicChar.repeat(charCount);
    expect(charCount).toBeLessThan(262_144);
    expect(Buffer.byteLength(content, "utf8")).toBeGreaterThan(262_144);

    expect(noteCreateSchema.safeParse({ title: "Note", content }).success).toBe(
      false,
    );

    const emoji = "😀"; // 4 bytes in UTF-8, 2 UTF-16 code units
    const emojiContent = emoji.repeat(70_000);
    expect(emojiContent.length).toBeLessThan(262_144);
    expect(Buffer.byteLength(emojiContent, "utf8")).toBeGreaterThan(262_144);
    expect(
      noteCreateSchema.safeParse({ title: "Note", content: emojiContent })
        .success,
    ).toBe(false);
  });

  it("accepts content right at the byte limit", () => {
    const content = "a".repeat(262_144);
    expect(noteCreateSchema.safeParse({ title: "Note", content }).success).toBe(
      true,
    );
    expect(
      noteCreateSchema.safeParse({ title: "Note", content: content + "a" })
        .success,
    ).toBe(false);
  });

  it("rejects unknown keys", () => {
    expect(
      noteCreateSchema.safeParse({ title: "Note", extra: 1 }).success,
    ).toBe(false);
  });
});

describe("noteUpdateSchema", () => {
  it("requires version and rejects zero or a fractional value", () => {
    expect(noteUpdateSchema.safeParse({ title: "New" }).success).toBe(false);
    expect(
      noteUpdateSchema.safeParse({ title: "New", version: 0 }).success,
    ).toBe(false);
    expect(
      noteUpdateSchema.safeParse({ title: "New", version: 1.5 }).success,
    ).toBe(false);
    expect(
      noteUpdateSchema.safeParse({ title: "New", version: 1 }).success,
    ).toBe(true);
  });

  it("requires at least one of title/content", () => {
    expect(noteUpdateSchema.safeParse({ version: 1 }).success).toBe(false);
    expect(
      noteUpdateSchema.safeParse({ version: 1, title: "New" }).success,
    ).toBe(true);
    expect(
      noteUpdateSchema.safeParse({ version: 1, content: "body" }).success,
    ).toBe(true);
  });

  it("rejects unknown keys", () => {
    expect(
      noteUpdateSchema.safeParse({ version: 1, title: "New", folderId: "f1" })
        .success,
    ).toBe(false);
  });
});

describe("noteMoveSchema", () => {
  it("requires folderId to be present, accepting null or a non-empty string", () => {
    expect(noteMoveSchema.safeParse({}).success).toBe(false);
    expect(noteMoveSchema.safeParse({ folderId: null }).success).toBe(true);
    expect(noteMoveSchema.safeParse({ folderId: "f1" }).success).toBe(true);
    expect(noteMoveSchema.safeParse({ folderId: "" }).success).toBe(false);
  });
});

describe("noteSearchQuerySchema", () => {
  it("coerces limit from a string and enforces its bounds", () => {
    expect(noteSearchQuerySchema.parse({ limit: "50" }).limit).toBe(50);
    expect(noteSearchQuerySchema.safeParse({ limit: "0" }).success).toBe(false);
    expect(noteSearchQuerySchema.safeParse({ limit: "201" }).success).toBe(
      false,
    );
    expect(noteSearchQuerySchema.safeParse({ limit: "200" }).success).toBe(
      true,
    );
  });

  it("coerces includeSubfolders from true/false strings", () => {
    expect(
      noteSearchQuerySchema.parse({ includeSubfolders: "true" })
        .includeSubfolders,
    ).toBe(true);
    expect(
      noteSearchQuerySchema.parse({ includeSubfolders: "false" })
        .includeSubfolders,
    ).toBe(false);
    expect(
      noteSearchQuerySchema.safeParse({ includeSubfolders: "yes" }).success,
    ).toBe(false);
  });

  it("defaults sort to updatedAt and rejects an unknown value", () => {
    expect(noteSearchQuerySchema.parse({}).sort).toBe("updatedAt");
    expect(noteSearchQuerySchema.safeParse({ sort: "title" }).success).toBe(
      true,
    );
    expect(noteSearchQuerySchema.safeParse({ sort: "createdAt" }).success).toBe(
      false,
    );
  });

  it("rejects unknown keys", () => {
    expect(noteSearchQuerySchema.safeParse({ bogus: "x" }).success).toBe(false);
  });
});

describe("noteFolderCreateSchema", () => {
  it("trims the name and rejects an empty one", () => {
    expect(noteFolderCreateSchema.parse({ name: "  Work  " }).name).toBe(
      "Work",
    );
    expect(noteFolderCreateSchema.safeParse({ name: "   " }).success).toBe(
      false,
    );
  });

  it("accepts a name exactly at the max and rejects one over it", () => {
    expect(
      noteFolderCreateSchema.safeParse({
        name: "x".repeat(NOTE_FOLDER_NAME_MAX),
      }).success,
    ).toBe(true);
    expect(
      noteFolderCreateSchema.safeParse({
        name: "x".repeat(NOTE_FOLDER_NAME_MAX + 1),
      }).success,
    ).toBe(false);
  });

  it("accepts a null parentFolderId and rejects an empty string", () => {
    expect(
      noteFolderCreateSchema.safeParse({ name: "Work", parentFolderId: null })
        .success,
    ).toBe(true);
    expect(
      noteFolderCreateSchema.safeParse({ name: "Work", parentFolderId: "" })
        .success,
    ).toBe(false);
  });

  it("rejects unknown keys", () => {
    expect(
      noteFolderCreateSchema.safeParse({ name: "Work", order: 1 }).success,
    ).toBe(false);
  });
});

describe("noteFolderUpdateSchema", () => {
  it("does not require any field", () => {
    expect(noteFolderUpdateSchema.safeParse({}).success).toBe(true);
  });

  it("accepts a null parentFolderId and rejects an empty string", () => {
    expect(
      noteFolderUpdateSchema.safeParse({ parentFolderId: null }).success,
    ).toBe(true);
    expect(
      noteFolderUpdateSchema.safeParse({ parentFolderId: "" }).success,
    ).toBe(false);
  });

  it("rejects unknown keys", () => {
    expect(
      noteFolderUpdateSchema.safeParse({ name: "Work", extra: true }).success,
    ).toBe(false);
  });
});

describe("noteFolderReorderSchema", () => {
  it("requires a non-empty order of non-empty strings", () => {
    expect(
      noteFolderReorderSchema.safeParse({
        parentFolderId: null,
        order: [],
      }).success,
    ).toBe(false);
    expect(
      noteFolderReorderSchema.safeParse({
        parentFolderId: null,
        order: [""],
      }).success,
    ).toBe(false);
    expect(
      noteFolderReorderSchema.safeParse({
        parentFolderId: null,
        order: ["f1", "f2"],
      }).success,
    ).toBe(true);
  });

  it("accepts a non-null parentFolderId", () => {
    expect(
      noteFolderReorderSchema.safeParse({
        parentFolderId: "root",
        order: ["f1"],
      }).success,
    ).toBe(true);
  });

  it("rejects unknown keys", () => {
    expect(
      noteFolderReorderSchema.safeParse({
        parentFolderId: null,
        order: ["f1"],
        extra: 1,
      }).success,
    ).toBe(false);
  });
});
