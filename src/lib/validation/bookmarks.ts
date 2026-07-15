import { z } from "zod";

// Zod schemas — single source of input validation for Bookmarks (ADR-011),
// shared by the /api/{categories,bookmarks} route handlers (architecture
// §6.1). AC-BM-005 (category name required/trimmed), AC-BM-007 (bookmark
// name+url required), AC-BM-008 (url must be http(s)).

export const httpUrlSchema = z
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

// AC-BM-0xx: category hierarchy (Phase 4) — a category may optionally belong
// to a top-level parent category, capping nesting at exactly one level
// (enforced service-side, see assertParentIsTopLevel). `null` clears the
// parent (promotes the category back to top-level); omitting the field
// leaves the current parent assignment untouched on update.
export const categorySchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  parentCategoryId: z.string().min(1).optional().nullable(),
});

export const categoryUpdateSchema = categorySchema;

// AC-BM-015..018: optional accent color tone token for a bookmark card's
// icon tile. Limited to the three brand color families that already have
// paired -100/-700 Tailwind utilities defined (inspot-tokens.css) so
// contrast/dark-mode is guaranteed to work without inventing new tokens.
export const bookmarkColorTokens = ["primary", "accent", "secondary"] as const;

export const bookmarkSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  url: httpUrlSchema,
  icon: z.string().trim().min(1).optional().nullable(),
  color: z.enum(bookmarkColorTokens).optional().nullable(),
  description: z.string().trim().optional().nullable(),
  categoryId: z.string().min(1, "categoryId is required"),
});

export const bookmarkUpdateSchema = z.object({
  name: z.string().trim().min(1, "Name is required").optional(),
  url: httpUrlSchema.optional(),
  icon: z.string().trim().min(1).optional().nullable(),
  color: z.enum(bookmarkColorTokens).optional().nullable(),
  description: z.string().trim().optional().nullable(),
  categoryId: z.string().min(1).optional(),
});

// FR-BM-005 / AC-BM-022..025: drag-and-drop reordering of categories and
// bookmarks. `order` is the full list of category ids in their new position
// order. A bookmark drag touches at most two categories (source + dest).
export const categoryReorderSchema = z.object({
  order: z.array(z.string().min(1)).min(1),
});

export const bookmarkReorderSchema = z.object({
  categories: z
    .array(
      z.object({
        categoryId: z.string().min(1),
        bookmarkIds: z.array(z.string().min(1)),
      }),
    )
    .min(1)
    .max(2), // a drag ever touches at most 2 categories (source + destination)
});

export type CategoryInput = z.infer<typeof categorySchema>;
export type BookmarkInput = z.infer<typeof bookmarkSchema>;
export type BookmarkUpdateInput = z.infer<typeof bookmarkUpdateSchema>;
export type CategoryReorderInput = z.infer<typeof categoryReorderSchema>;
export type BookmarkReorderInput = z.infer<typeof bookmarkReorderSchema>;
