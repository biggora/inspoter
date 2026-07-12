import { db } from "@/lib/db";
import type { Bookmark, Category } from "@/generated/prisma/client";

// Bookmarks service (architecture.md §6, ADR-012) — the only service module
// the Bookmarks server component and the /api/{categories,bookmarks} route
// handlers are allowed to call (routes never touch Prisma directly).
// Real bodies (plan.md §5.3 Step 8): `list()` reads grouped
// categories+bookmarks (AC-BM-012); category delete cascades to its
// bookmarks at the DB level (schema `onDelete: Cascade`, AC-BM-004).

/** A category grouped with its bookmarks, as returned by `list()` for the
 * Bookmarks server component's grouped display (AC-BM-012). */
export type CategoryWithBookmarks = Category & { bookmarks: Bookmark[] };

export interface CreateCategoryInput {
  name: string;
}

export interface RenameCategoryInput {
  name: string;
}

export interface CreateBookmarkInput {
  name: string;
  url: string;
  icon?: string | null;
  description?: string | null;
  categoryId: string;
}

export interface UpdateBookmarkInput {
  name?: string;
  url?: string;
  icon?: string | null;
  description?: string | null;
  categoryId?: string;
}

export async function list(): Promise<CategoryWithBookmarks[]> {
  return db.category.findMany({
    orderBy: { position: "asc" },
    include: { bookmarks: { orderBy: { position: "asc" } } },
  });
}

export async function createCategory(input: CreateCategoryInput): Promise<Category> {
  return db.category.create({ data: { name: input.name } });
}

export async function renameCategory(
  id: string,
  input: RenameCategoryInput,
): Promise<Category> {
  return db.category.update({ where: { id }, data: { name: input.name } });
}

export async function deleteCategory(id: string): Promise<void> {
  // Cascade to bookmarks is enforced at the DB level (schema.prisma
  // Bookmark.category onDelete: Cascade) — no orphans remain (AC-BM-004).
  await db.category.delete({ where: { id } });
}

export async function createBookmark(input: CreateBookmarkInput): Promise<Bookmark> {
  return db.bookmark.create({
    data: {
      name: input.name,
      url: input.url,
      icon: input.icon ?? null,
      description: input.description ?? null,
      categoryId: input.categoryId,
    },
  });
}

export async function updateBookmark(
  id: string,
  input: UpdateBookmarkInput,
): Promise<Bookmark> {
  return db.bookmark.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.url !== undefined ? { url: input.url } : {}),
      ...(input.icon !== undefined ? { icon: input.icon } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
    },
  });
}

export async function deleteBookmark(id: string): Promise<void> {
  await db.bookmark.delete({ where: { id } });
}
