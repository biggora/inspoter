import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import * as bookmarksService from "@/lib/services/bookmarks";

const NAME_PREFIX = `mode-a-${randomUUID()}`;
let workspaceId: string;

beforeAll(async () => {
  const workspace = await db.workspace.create({
    data: {
      name: "Test Workspace",
      slug: `test-${randomUUID()}`,
      updatedAt: new Date(),
    },
  });
  workspaceId = workspace.id;
});

afterAll(async () => {
  await db.category.deleteMany({
    where: { name: { startsWith: NAME_PREFIX } },
  });
  if (workspaceId) {
    await db.workspace.delete({ where: { id: workspaceId } }).catch(() => {});
  }
});

describe("AC-BM-001/012: createCategory + list()", () => {
  it("AC-BM-001: creates a category that is persisted and returned by list()", async () => {
    const category = await bookmarksService.createCategory(workspaceId, {
      name: `${NAME_PREFIX}-infra`,
    });
    expect(category.name).toBe(`${NAME_PREFIX}-infra`);

    const grouped = await bookmarksService.list(workspaceId);
    expect(grouped.some((c) => c.id === category.id)).toBe(true);
  });

  it("AC-BM-012: list() groups bookmarks under their category", async () => {
    const category = await bookmarksService.createCategory(workspaceId, {
      name: `${NAME_PREFIX}-devtools`,
    });
    const bookmark = await bookmarksService.createBookmark(workspaceId, {
      name: "Grafana",
      url: "https://grafana.example.com",
      categoryId: category.id,
    });

    const grouped = await bookmarksService.list(workspaceId);
    const found = grouped.find((c) => c.id === category.id);
    expect(found?.bookmarks.some((b) => b.id === bookmark.id)).toBe(true);
  });
});

describe("AC-BM-002: renameCategory", () => {
  it("persists the new name", async () => {
    const category = await bookmarksService.createCategory(workspaceId, {
      name: `${NAME_PREFIX}-old-name`,
    });
    const renamed = await bookmarksService.renameCategory(
      category.id,
      workspaceId,
      {
        name: `${NAME_PREFIX}-new-name`,
      },
    );
    expect(renamed.name).toBe(`${NAME_PREFIX}-new-name`);
  });
});

describe("AC-BM-003/004: deleteCategory cascade", () => {
  it("removes the category and cascades delete to its bookmarks (no orphans)", async () => {
    const category = await bookmarksService.createCategory(workspaceId, {
      name: `${NAME_PREFIX}-cascade`,
    });
    const bookmark = await bookmarksService.createBookmark(workspaceId, {
      name: "Proxmox",
      url: "https://proxmox.example.com",
      categoryId: category.id,
    });

    await bookmarksService.deleteCategory(category.id, workspaceId);

    const remainingBookmarks = await db.bookmark.findMany({
      where: { id: bookmark.id },
    });
    const remainingCategories = await db.category.findMany({
      where: { id: category.id },
    });
    expect(remainingBookmarks).toHaveLength(0);
    expect(remainingCategories).toHaveLength(0);
  });
});

describe("AC-BM-006/009/010: bookmark CRUD", () => {
  it("AC-BM-006: creates a bookmark under a category", async () => {
    const category = await bookmarksService.createCategory(workspaceId, {
      name: `${NAME_PREFIX}-create-bookmark`,
    });
    const bookmark = await bookmarksService.createBookmark(workspaceId, {
      name: "pfSense",
      url: "https://pfsense.example.com",
      categoryId: category.id,
    });
    expect(bookmark.name).toBe("pfSense");
    expect(bookmark.categoryId).toBe(category.id);
  });

  it("AC-BM-009: edits an existing bookmark's fields, including moving category", async () => {
    const categoryA = await bookmarksService.createCategory(workspaceId, {
      name: `${NAME_PREFIX}-cat-a`,
    });
    const categoryB = await bookmarksService.createCategory(workspaceId, {
      name: `${NAME_PREFIX}-cat-b`,
    });
    const bookmark = await bookmarksService.createBookmark(workspaceId, {
      name: "GitHub",
      url: "https://github.com",
      categoryId: categoryA.id,
    });

    const updated = await bookmarksService.updateBookmark(
      bookmark.id,
      workspaceId,
      {
        name: "GitHub (work)",
        categoryId: categoryB.id,
      },
    );

    expect(updated.name).toBe("GitHub (work)");
    expect(updated.categoryId).toBe(categoryB.id);
  });

  it("AC-BM-010: deletes a bookmark", async () => {
    const category = await bookmarksService.createCategory(workspaceId, {
      name: `${NAME_PREFIX}-delete-bookmark`,
    });
    const bookmark = await bookmarksService.createBookmark(workspaceId, {
      name: "Temp",
      url: "https://temp.example.com",
      categoryId: category.id,
    });

    await bookmarksService.deleteBookmark(bookmark.id, workspaceId);

    const remaining = await db.bookmark.findMany({
      where: { id: bookmark.id },
    });
    expect(remaining).toHaveLength(0);
  });
});

describe("position assignment (bug fix)", () => {
  it("assigns each new category in a workspace an incrementing position, independent of other workspaces", async () => {
    const otherWorkspace = await db.workspace.create({
      data: {
        name: "Other Workspace",
        slug: `test-other-${randomUUID()}`,
        updatedAt: new Date(),
      },
    });
    try {
      const catA = await bookmarksService.createCategory(workspaceId, {
        name: `${NAME_PREFIX}-position-a`,
      });
      const catB = await bookmarksService.createCategory(workspaceId, {
        name: `${NAME_PREFIX}-position-b`,
      });
      const catC = await bookmarksService.createCategory(workspaceId, {
        name: `${NAME_PREFIX}-position-c`,
      });
      // Prior to the fix, position always defaulted to 0 for every category
      // (write side never set it), so this assertion would have failed.
      expect(catA.position).toBeLessThan(catB.position);
      expect(catB.position).toBeLessThan(catC.position);

      const otherCat = await bookmarksService.createCategory(
        otherWorkspace.id,
        { name: `${NAME_PREFIX}-position-other-ws` },
      );
      // A brand-new workspace's first category still starts at position 0,
      // matching the pre-fix behavior for a lone category.
      expect(otherCat.position).toBe(0);
    } finally {
      await db.workspace.delete({ where: { id: otherWorkspace.id } });
    }
  });

  it("assigns each new bookmark in a category an incrementing position, independent of other categories", async () => {
    const categoryA = await bookmarksService.createCategory(workspaceId, {
      name: `${NAME_PREFIX}-bm-position-a`,
    });
    const categoryB = await bookmarksService.createCategory(workspaceId, {
      name: `${NAME_PREFIX}-bm-position-b`,
    });

    const bookmarkA1 = await bookmarksService.createBookmark(workspaceId, {
      name: "A1",
      url: "https://a1.example.com",
      categoryId: categoryA.id,
    });
    const bookmarkA2 = await bookmarksService.createBookmark(workspaceId, {
      name: "A2",
      url: "https://a2.example.com",
      categoryId: categoryA.id,
    });
    // First bookmark in a brand-new category still starts at position 0.
    expect(bookmarkA1.position).toBe(0);
    expect(bookmarkA2.position).toBeGreaterThan(bookmarkA1.position);

    const bookmarkB1 = await bookmarksService.createBookmark(workspaceId, {
      name: "B1",
      url: "https://b1.example.com",
      categoryId: categoryB.id,
    });
    // A different category's position sequence is independent.
    expect(bookmarkB1.position).toBe(0);
  });
});

describe("AC-BM-015..018: bookmark color passthrough", () => {
  it("persists a color token supplied on create", async () => {
    const category = await bookmarksService.createCategory(workspaceId, {
      name: `${NAME_PREFIX}-color-create`,
    });
    const bookmark = await bookmarksService.createBookmark(workspaceId, {
      name: "Colored",
      url: "https://colored.example.com",
      categoryId: category.id,
      color: "accent",
    });
    expect(bookmark.color).toBe("accent");
  });

  it("defaults color to null when omitted on create", async () => {
    const category = await bookmarksService.createCategory(workspaceId, {
      name: `${NAME_PREFIX}-color-omitted`,
    });
    const bookmark = await bookmarksService.createBookmark(workspaceId, {
      name: "NoColor",
      url: "https://nocolor.example.com",
      categoryId: category.id,
    });
    expect(bookmark.color).toBeNull();
  });

  it("updates a bookmark's color", async () => {
    const category = await bookmarksService.createCategory(workspaceId, {
      name: `${NAME_PREFIX}-color-update`,
    });
    const bookmark = await bookmarksService.createBookmark(workspaceId, {
      name: "ToRecolor",
      url: "https://recolor.example.com",
      categoryId: category.id,
      color: "primary",
    });

    const updated = await bookmarksService.updateBookmark(
      bookmark.id,
      workspaceId,
      { color: "secondary" },
    );
    expect(updated.color).toBe("secondary");
  });

  it("explicitly clearing color (null) removes it", async () => {
    const category = await bookmarksService.createCategory(workspaceId, {
      name: `${NAME_PREFIX}-color-clear`,
    });
    const bookmark = await bookmarksService.createBookmark(workspaceId, {
      name: "ToClear",
      url: "https://clear.example.com",
      categoryId: category.id,
      color: "primary",
    });

    const updated = await bookmarksService.updateBookmark(
      bookmark.id,
      workspaceId,
      { color: null },
    );
    expect(updated.color).toBeNull();
  });
});

describe("AC-BM-022..025: reorderCategories/reorderBookmarks", () => {
  it("AC-BM-022: reorderCategories produces sequential 0-based positions matching the input order", async () => {
    const categoryA = await bookmarksService.createCategory(workspaceId, {
      name: `${NAME_PREFIX}-reorder-cat-a`,
    });
    const categoryB = await bookmarksService.createCategory(workspaceId, {
      name: `${NAME_PREFIX}-reorder-cat-b`,
    });
    const categoryC = await bookmarksService.createCategory(workspaceId, {
      name: `${NAME_PREFIX}-reorder-cat-c`,
    });

    await bookmarksService.reorderCategories(workspaceId, [
      categoryC.id,
      categoryA.id,
      categoryB.id,
    ]);

    const grouped = await bookmarksService.list(workspaceId);
    const byId = new Map(grouped.map((c) => [c.id, c]));
    expect(byId.get(categoryC.id)?.position).toBe(0);
    expect(byId.get(categoryA.id)?.position).toBe(1);
    expect(byId.get(categoryB.id)?.position).toBe(2);
  });

  it("AC-BM-023: reorderBookmarks within one category produces sequential positions matching the new order", async () => {
    const category = await bookmarksService.createCategory(workspaceId, {
      name: `${NAME_PREFIX}-reorder-bm-cat`,
    });
    const bookmark1 = await bookmarksService.createBookmark(workspaceId, {
      name: "Reorder B1",
      url: "https://reorder-b1.example.com",
      categoryId: category.id,
    });
    const bookmark2 = await bookmarksService.createBookmark(workspaceId, {
      name: "Reorder B2",
      url: "https://reorder-b2.example.com",
      categoryId: category.id,
    });
    const bookmark3 = await bookmarksService.createBookmark(workspaceId, {
      name: "Reorder B3",
      url: "https://reorder-b3.example.com",
      categoryId: category.id,
    });

    await bookmarksService.reorderBookmarks(workspaceId, [
      {
        categoryId: category.id,
        bookmarkIds: [bookmark3.id, bookmark1.id, bookmark2.id],
      },
    ]);

    const grouped = await bookmarksService.list(workspaceId);
    const found = grouped.find((c) => c.id === category.id);
    const byId = new Map((found?.bookmarks ?? []).map((b) => [b.id, b]));
    expect(byId.get(bookmark3.id)?.position).toBe(0);
    expect(byId.get(bookmark1.id)?.position).toBe(1);
    expect(byId.get(bookmark2.id)?.position).toBe(2);
  });

  it("AC-BM-024/025: reorderBookmarks moving a bookmark from category X to Y updates categoryId/position without orphaning X's remaining bookmarks", async () => {
    const categoryX = await bookmarksService.createCategory(workspaceId, {
      name: `${NAME_PREFIX}-reorder-move-x`,
    });
    const categoryY = await bookmarksService.createCategory(workspaceId, {
      name: `${NAME_PREFIX}-reorder-move-y`,
    });
    const xBookmark1 = await bookmarksService.createBookmark(workspaceId, {
      name: "Move X1",
      url: "https://move-x1.example.com",
      categoryId: categoryX.id,
    });
    const xBookmark2 = await bookmarksService.createBookmark(workspaceId, {
      name: "Move X2",
      url: "https://move-x2.example.com",
      categoryId: categoryX.id,
    });
    const yBookmark1 = await bookmarksService.createBookmark(workspaceId, {
      name: "Move Y1",
      url: "https://move-y1.example.com",
      categoryId: categoryY.id,
    });

    // Move xBookmark2 out of X into Y (ahead of Y's existing bookmark); X's
    // payload carries its one remaining member so it gets re-indexed, not
    // deleted/orphaned.
    await bookmarksService.reorderBookmarks(workspaceId, [
      { categoryId: categoryX.id, bookmarkIds: [xBookmark1.id] },
      {
        categoryId: categoryY.id,
        bookmarkIds: [xBookmark2.id, yBookmark1.id],
      },
    ]);

    const grouped = await bookmarksService.list(workspaceId);
    const foundX = grouped.find((c) => c.id === categoryX.id);
    const foundY = grouped.find((c) => c.id === categoryY.id);

    expect(foundX?.bookmarks.map((b) => b.id)).toEqual([xBookmark1.id]);
    expect(foundX?.bookmarks[0]?.position).toBe(0);

    const yById = new Map((foundY?.bookmarks ?? []).map((b) => [b.id, b]));
    expect(yById.get(xBookmark2.id)?.categoryId).toBe(categoryY.id);
    expect(yById.get(xBookmark2.id)?.position).toBe(0);
    expect(yById.get(yBookmark1.id)?.categoryId).toBe(categoryY.id);
    expect(yById.get(yBookmark1.id)?.position).toBe(1);
  });
});

describe("Category hierarchy (Phase 4)", () => {
  it("rejects nesting under a category that is already a subcategory (depth-cap)", async () => {
    const a = await bookmarksService.createCategory(workspaceId, {
      name: `${NAME_PREFIX}-depth-a`,
    });
    const b = await bookmarksService.createCategory(workspaceId, {
      name: `${NAME_PREFIX}-depth-b`,
      parentCategoryId: a.id,
    });

    await expect(
      bookmarksService.createCategory(workspaceId, {
        name: `${NAME_PREFIX}-depth-c`,
        parentCategoryId: b.id,
      }),
    ).rejects.toThrow(bookmarksService.CategoryHierarchyValidationError);
  });

  it("rejects a category being renamed to its own parent (self-reference)", async () => {
    const category = await bookmarksService.createCategory(workspaceId, {
      name: `${NAME_PREFIX}-self-ref`,
    });

    await expect(
      bookmarksService.renameCategory(category.id, workspaceId, {
        name: category.name,
        parentCategoryId: category.id,
      }),
    ).rejects.toThrow(bookmarksService.CategoryHierarchyValidationError);
  });

  it("rejects a category with existing subcategories from becoming someone else's subcategory", async () => {
    const a = await bookmarksService.createCategory(workspaceId, {
      name: `${NAME_PREFIX}-has-children-a`,
    });
    const b = await bookmarksService.createCategory(workspaceId, {
      name: `${NAME_PREFIX}-has-children-b`,
    });
    await bookmarksService.createCategory(workspaceId, {
      name: `${NAME_PREFIX}-has-children-c`,
      parentCategoryId: a.id,
    });

    await expect(
      bookmarksService.renameCategory(a.id, workspaceId, {
        name: a.name,
        parentCategoryId: b.id,
      }),
    ).rejects.toThrow(bookmarksService.CategoryHierarchyValidationError);
  });

  it("accepts a valid one-level nesting and reflects it via list()'s childCategories", async () => {
    const a = await bookmarksService.createCategory(workspaceId, {
      name: `${NAME_PREFIX}-valid-nest-a`,
    });
    const b = await bookmarksService.createCategory(workspaceId, {
      name: `${NAME_PREFIX}-valid-nest-b`,
      parentCategoryId: a.id,
    });

    const grouped = await bookmarksService.list(workspaceId);
    expect(grouped.some((c) => c.id === b.id)).toBe(false);
    const foundA = grouped.find((c) => c.id === a.id);
    expect(foundA?.childCategories.some((c) => c.id === b.id)).toBe(true);
  });

  it("list() nests each subcategory under its own parent, in creation order, with position-ordered bookmarks", async () => {
    const a1 = await bookmarksService.createCategory(workspaceId, {
      name: `${NAME_PREFIX}-nest-a1`,
    });
    const a2 = await bookmarksService.createCategory(workspaceId, {
      name: `${NAME_PREFIX}-nest-a2`,
    });
    const b1 = await bookmarksService.createCategory(workspaceId, {
      name: `${NAME_PREFIX}-nest-b1`,
      parentCategoryId: a1.id,
    });
    const b2 = await bookmarksService.createCategory(workspaceId, {
      name: `${NAME_PREFIX}-nest-b2`,
      parentCategoryId: a1.id,
    });
    const c1 = await bookmarksService.createCategory(workspaceId, {
      name: `${NAME_PREFIX}-nest-c1`,
      parentCategoryId: a2.id,
    });

    const b1Bookmark1 = await bookmarksService.createBookmark(workspaceId, {
      name: "B1 First",
      url: "https://nest-b1-first.example.com",
      categoryId: b1.id,
    });
    const b1Bookmark2 = await bookmarksService.createBookmark(workspaceId, {
      name: "B1 Second",
      url: "https://nest-b1-second.example.com",
      categoryId: b1.id,
    });
    const b2Bookmark1 = await bookmarksService.createBookmark(workspaceId, {
      name: "B2 First",
      url: "https://nest-b2-first.example.com",
      categoryId: b2.id,
    });
    const c1Bookmark1 = await bookmarksService.createBookmark(workspaceId, {
      name: "C1 First",
      url: "https://nest-c1-first.example.com",
      categoryId: c1.id,
    });

    const grouped = await bookmarksService.list(workspaceId);

    // A1 and A2 appear at the top level; their subcategories do not.
    expect(grouped.some((c) => c.id === a1.id)).toBe(true);
    expect(grouped.some((c) => c.id === a2.id)).toBe(true);
    expect(grouped.some((c) => c.id === b1.id)).toBe(false);
    expect(grouped.some((c) => c.id === b2.id)).toBe(false);
    expect(grouped.some((c) => c.id === c1.id)).toBe(false);

    const foundA1 = grouped.find((c) => c.id === a1.id);
    const foundA2 = grouped.find((c) => c.id === a2.id);
    expect(foundA1?.childCategories.map((c) => c.id)).toEqual([
      b1.id,
      b2.id,
    ]);
    expect(foundA2?.childCategories.map((c) => c.id)).toEqual([c1.id]);

    const foundB1 = foundA1?.childCategories.find((c) => c.id === b1.id);
    expect(foundB1?.bookmarks.map((b) => b.id)).toEqual([
      b1Bookmark1.id,
      b1Bookmark2.id,
    ]);

    const foundB2 = foundA1?.childCategories.find((c) => c.id === b2.id);
    expect(foundB2?.bookmarks.map((b) => b.id)).toEqual([b2Bookmark1.id]);

    const foundC1 = foundA2?.childCategories.find((c) => c.id === c1.id);
    expect(foundC1?.bookmarks.map((b) => b.id)).toEqual([c1Bookmark1.id]);
  });
});
