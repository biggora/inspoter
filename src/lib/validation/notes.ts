import { z } from "zod";
import { VALIDATION_MESSAGES } from "@/lib/validation/error-map";

// Zod schemas — single source of input validation for the Notes section
// (Obsidian-like notes, slice 1), shared by every /api/notes/** route
// handler. Limit constants live here (not in the service layer) so both the
// schema and the service that re-checks storage size share one number.

const M = VALIDATION_MESSAGES.note;

export const NOTE_TITLE_MAX = 120;
export const NOTE_FOLDER_NAME_MAX = 60;
export const NOTE_CONTENT_MAX_BYTES = 262_144;
export const NOTE_TAG_NAME_MAX = 40;

const titleSchema = z
  .string()
  .trim()
  .min(1, { error: () => M.titleRequired })
  .max(NOTE_TITLE_MAX, { error: () => M.titleTooLong });

// The limit is about stored bytes, not glyph count: a multibyte string can
// sit comfortably under NOTE_CONTENT_MAX_BYTES in character length while
// exceeding it once encoded as UTF-8.
const contentSchema = z
  .string()
  .refine(
    (value) => Buffer.byteLength(value, "utf8") <= NOTE_CONTENT_MAX_BYTES,
    { error: () => M.contentTooLong },
  );

const folderNameSchema = z
  .string()
  .trim()
  .min(1, { error: () => M.folderNameRequired })
  .max(NOTE_FOLDER_NAME_MAX, { error: () => M.folderNameTooLong });

// null = explicitly move to the storage root; an empty string is never a
// valid id, so it is rejected the same as any other malformed id.
const folderIdSchema = z
  .string()
  .min(1, { error: () => M.folderIdInvalid })
  .nullable();

const versionSchema = z
  .number({ error: () => M.versionRequired })
  .int({ error: () => M.versionRequired })
  .min(1, { error: () => M.versionRequired });

export const noteCreateSchema = z
  .object({
    title: titleSchema,
    content: contentSchema.optional(),
    folderId: folderIdSchema.optional(),
  })
  .strict();

export const noteUpdateSchema = z
  .object({
    title: titleSchema.optional(),
    content: contentSchema.optional(),
    version: versionSchema,
  })
  .strict()
  .refine((input) => input.title !== undefined || input.content !== undefined, {
    error: () => M.updateFieldsRequired,
  });

export const noteMoveSchema = z
  .object({
    folderId: folderIdSchema,
  })
  .strict();

export const noteSearchQuerySchema = z
  .object({
    query: z.string().trim().min(1).optional(),
    folderId: z.string().trim().min(1).optional(),
    includeSubfolders: z
      .enum(["true", "false"])
      .transform((value) => value === "true")
      .optional(),
    sort: z.enum(["updatedAt", "title"]).default("updatedAt"),
    limit: z.coerce.number().int().min(1).max(200).optional(),
    cursor: z.string().trim().min(1).optional(),
  })
  .strict();

export const noteFolderCreateSchema = z
  .object({
    name: folderNameSchema,
    parentFolderId: folderIdSchema.optional(),
  })
  .strict();

export const noteFolderUpdateSchema = z
  .object({
    name: folderNameSchema.optional(),
    parentFolderId: folderIdSchema.optional(),
  })
  .strict();

export const noteFolderReorderSchema = z
  .object({
    parentFolderId: folderIdSchema,
    order: z.array(z.string().min(1)).min(1, { error: () => M.orderRequired }),
  })
  .strict();

export type NoteCreateInput = z.infer<typeof noteCreateSchema>;
export type NoteUpdateInput = z.infer<typeof noteUpdateSchema>;
export type NoteMoveInput = z.infer<typeof noteMoveSchema>;
export type NoteSearchQuery = z.infer<typeof noteSearchQuerySchema>;
export type NoteFolderCreateInput = z.infer<typeof noteFolderCreateSchema>;
export type NoteFolderUpdateInput = z.infer<typeof noteFolderUpdateSchema>;
export type NoteFolderReorderInput = z.infer<typeof noteFolderReorderSchema>;
