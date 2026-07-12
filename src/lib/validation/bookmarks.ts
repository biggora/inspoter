import { z } from "zod";

// Zod schemas — single source of input validation for Bookmarks (ADR-011),
// shared by the /api/{categories,bookmarks} route handlers (architecture
// §6.1). AC-BM-005 (category name required/trimmed), AC-BM-007 (bookmark
// name+url required), AC-BM-008 (url must be http(s)).

const httpUrlSchema = z
  .string()
  .trim()
  .min(1, "URL is required")
  .refine(
    (value) => {
      try {
        const parsed = new URL(value);
        return parsed.protocol === "http:" || parsed.protocol === "https:";
      } catch {
        return false;
      }
    },
    { message: "URL must be a valid http(s) URL" },
  );

export const categorySchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
});

export const categoryUpdateSchema = categorySchema;

export const bookmarkSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  url: httpUrlSchema,
  icon: z.string().trim().min(1).optional().nullable(),
  description: z.string().trim().optional().nullable(),
  categoryId: z.string().min(1, "categoryId is required"),
});

export const bookmarkUpdateSchema = z.object({
  name: z.string().trim().min(1, "Name is required").optional(),
  url: httpUrlSchema.optional(),
  icon: z.string().trim().min(1).optional().nullable(),
  description: z.string().trim().optional().nullable(),
  categoryId: z.string().min(1).optional(),
});

export type CategoryInput = z.infer<typeof categorySchema>;
export type BookmarkInput = z.infer<typeof bookmarkSchema>;
export type BookmarkUpdateInput = z.infer<typeof bookmarkUpdateSchema>;
