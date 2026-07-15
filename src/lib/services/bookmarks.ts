import { db } from "@/lib/db";
import type { Bookmark, Category } from "@/generated/prisma/client";

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

export async function list(
  workspaceId: string,
): Promise<CategoryWithBookmarks[]> {
  return db.category.findMany({
    where: { workspaceId },
    orderBy: { position: "asc" },
    include: { bookmarks: { orderBy: { position: "asc" } } },
  });
}

export async function createCategory(
  workspaceId: string,
  input: CreateCategoryInput,
): Promise<Category> {
  return db.category.create({ data: { name: input.name, workspaceId } });
}

export async function renameCategory(
  id: string,
  workspaceId: string,
  input: RenameCategoryInput,
): Promise<Category> {
  return db.category.update({
    where: { id, workspaceId },
    data: { name: input.name },
  });
}

export async function deleteCategory(
  id: string,
  workspaceId: string,
): Promise<void> {
  await db.category.delete({ where: { id, workspaceId } });
}

export async function createBookmark(
  workspaceId: string,
  input: CreateBookmarkInput,
): Promise<Bookmark> {
  return db.bookmark.create({
    data: {
      workspaceId,
      name: input.name,
      url: input.url,
      icon: input.icon ?? null,
      description: input.description ?? null,
      categoryId: input.categoryId,
      categoryWorkspaceId: workspaceId,
    },
  });
}

export async function updateBookmark(
  id: string,
  workspaceId: string,
  input: UpdateBookmarkInput,
): Promise<Bookmark> {
  return db.bookmark.update({
    where: { id, workspaceId },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.url !== undefined ? { url: input.url } : {}),
      ...(input.icon !== undefined ? { icon: input.icon } : {}),
      ...(input.description !== undefined
        ? { description: input.description }
        : {}),
      ...(input.categoryId !== undefined
        ? { categoryId: input.categoryId, categoryWorkspaceId: workspaceId }
        : {}),
    },
  });
}

export async function deleteBookmark(
  id: string,
  workspaceId: string,
): Promise<void> {
  await db.bookmark.delete({ where: { id, workspaceId } });
}
