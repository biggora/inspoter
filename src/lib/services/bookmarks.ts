import { db } from "@/lib/db";
import type { Bookmark, Category } from "@/generated/prisma/client";

// Phase 4 (FR-BM-00x): exactly one level of category nesting. `list()`
// returns only top-level categories; each carries its direct subcategories
// (already position-ordered, each with their own position-ordered
// bookmarks) in `childCategories`. Subcategories are never duplicated at
// the top level.
export type CategoryWithBookmarks = Category & {
  bookmarks: Bookmark[];
  childCategories: (Category & { bookmarks: Bookmark[] })[];
};

export class BookmarkReorderValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BookmarkReorderValidationError";
  }
}

// Category hierarchy validation (Phase 4): self-reference, cross-workspace,
// depth-cap (max one level), and "already has children" rule violations.
export class CategoryHierarchyValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CategoryHierarchyValidationError";
  }
}

export interface CreateCategoryInput {
  name: string;
  parentCategoryId?: string | null;
}

export interface RenameCategoryInput {
  name: string;
  parentCategoryId?: string | null;
}

export interface CreateBookmarkInput {
  name: string;
  url: string;
  icon?: string | null;
  color?: string | null;
  description?: string | null;
  categoryId: string;
}

export interface UpdateBookmarkInput {
  name?: string;
  url?: string;
  icon?: string | null;
  color?: string | null;
  description?: string | null;
  categoryId?: string;
}

// --- Category hierarchy validation helpers (Phase 4) ---
// Each rule is its own small, independently testable function; callers
// compose them via validateParentCategoryAssignment(). `categoryId` is
// undefined on create (the category doesn't exist yet) and set on update.

function assertNotSelfParent(
  categoryId: string | undefined,
  parentCategoryId: string,
): void {
  if (categoryId !== undefined && categoryId === parentCategoryId) {
    throw new CategoryHierarchyValidationError(
      "A category cannot be its own parent.",
    );
  }
}

async function getParentCategoryOrThrow(
  workspaceId: string,
  parentCategoryId: string,
): Promise<Category> {
  const parent = await db.category.findFirst({
    where: { id: parentCategoryId, workspaceId },
  });
  if (!parent) {
    throw new CategoryHierarchyValidationError(
      "Parent category does not exist in this workspace.",
    );
  }
  return parent;
}

function assertParentIsTopLevel(parent: Category): void {
  if (parent.parentCategoryId !== null) {
    throw new CategoryHierarchyValidationError(
      "Parent category is itself a subcategory; nesting is limited to one level.",
    );
  }
}

async function assertNoExistingChildCategories(
  workspaceId: string,
  categoryId: string,
): Promise<void> {
  const childCount = await db.category.count({
    where: { workspaceId, parentCategoryId: categoryId },
  });
  if (childCount > 0) {
    throw new CategoryHierarchyValidationError(
      "A category with subcategories cannot itself become a subcategory.",
    );
  }
}

async function validateParentCategoryAssignment(
  workspaceId: string,
  parentCategoryId: string,
  categoryId?: string,
): Promise<void> {
  assertNotSelfParent(categoryId, parentCategoryId);
  const parent = await getParentCategoryOrThrow(workspaceId, parentCategoryId);
  assertParentIsTopLevel(parent);
  if (categoryId !== undefined) {
    await assertNoExistingChildCategories(workspaceId, categoryId);
  }
}

export async function list(
  workspaceId: string,
): Promise<CategoryWithBookmarks[]> {
  const categories = await db.category.findMany({
    where: { workspaceId },
    orderBy: { position: "asc" },
    include: { bookmarks: { orderBy: { position: "asc" } } },
  });

  const childrenByParentId = new Map<
    string,
    (Category & { bookmarks: Bookmark[] })[]
  >();
  for (const category of categories) {
    if (category.parentCategoryId === null) continue;
    const siblings = childrenByParentId.get(category.parentCategoryId) ?? [];
    siblings.push(category);
    childrenByParentId.set(category.parentCategoryId, siblings);
  }

  return categories
    .filter((category) => category.parentCategoryId === null)
    .map((category) => ({
      ...category,
      childCategories: childrenByParentId.get(category.id) ?? [],
    }));
}

export async function createCategory(
  workspaceId: string,
  input: CreateCategoryInput,
): Promise<Category> {
  if (input.parentCategoryId != null) {
    await validateParentCategoryAssignment(
      workspaceId,
      input.parentCategoryId,
    );
  }

  const { _max } = await db.category.aggregate({
    where: { workspaceId },
    _max: { position: true },
  });
  const position = (_max.position ?? -1) + 1;
  return db.category.create({
    data: {
      name: input.name,
      workspaceId,
      position,
      ...(input.parentCategoryId != null
        ? {
            parentCategoryId: input.parentCategoryId,
            parentCategoryWorkspaceId: workspaceId,
          }
        : {}),
    },
  });
}

export async function renameCategory(
  id: string,
  workspaceId: string,
  input: RenameCategoryInput,
): Promise<Category> {
  if (input.parentCategoryId != null) {
    await validateParentCategoryAssignment(
      workspaceId,
      input.parentCategoryId,
      id,
    );
  }

  return db.category.update({
    where: { id, workspaceId },
    data: {
      name: input.name,
      ...(input.parentCategoryId === undefined
        ? {}
        : input.parentCategoryId === null
          ? { parentCategoryId: null, parentCategoryWorkspaceId: null }
          : {
              parentCategoryId: input.parentCategoryId,
              parentCategoryWorkspaceId: workspaceId,
            }),
    },
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
  const { _max } = await db.bookmark.aggregate({
    where: { categoryId: input.categoryId },
    _max: { position: true },
  });
  const position = (_max.position ?? -1) + 1;
  return db.bookmark.create({
    data: {
      workspaceId,
      name: input.name,
      url: input.url,
      icon: input.icon ?? null,
      color: input.color ?? null,
      description: input.description ?? null,
      position,
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
      ...(input.color !== undefined ? { color: input.color } : {}),
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

export async function reorderCategories(
  workspaceId: string,
  order: string[],
): Promise<void> {
  const found = await db.category.findMany({
    where: { id: { in: order }, workspaceId },
    select: { id: true },
  });
  if (found.length !== new Set(order).size) {
    throw new BookmarkReorderValidationError(
      "One or more categories do not belong to this workspace.",
    );
  }

  await db.$transaction(
    order.map((id, index) =>
      db.category.update({
        where: { id, workspaceId },
        data: { position: index },
      }),
    ),
  );
}

export async function reorderBookmarks(
  workspaceId: string,
  categories: { categoryId: string; bookmarkIds: string[] }[],
): Promise<void> {
  const categoryIds = categories.map((category) => category.categoryId);
  const foundCategories = await db.category.findMany({
    where: { id: { in: categoryIds }, workspaceId },
    select: { id: true },
  });
  if (foundCategories.length !== new Set(categoryIds).size) {
    throw new BookmarkReorderValidationError(
      "One or more categories do not belong to this workspace.",
    );
  }

  const allBookmarkIds = categories.flatMap((category) => category.bookmarkIds);
  const foundBookmarks = await db.bookmark.findMany({
    where: { id: { in: allBookmarkIds }, workspaceId },
    select: { id: true },
  });
  if (foundBookmarks.length !== new Set(allBookmarkIds).size) {
    throw new BookmarkReorderValidationError(
      "One or more bookmarks do not belong to this workspace.",
    );
  }

  await db.$transaction(
    categories.flatMap((category) =>
      category.bookmarkIds.map((id, index) =>
        db.bookmark.update({
          where: { id, workspaceId },
          data: {
            position: index,
            categoryId: category.categoryId,
            categoryWorkspaceId: workspaceId,
          },
        }),
      ),
    ),
  );
}
