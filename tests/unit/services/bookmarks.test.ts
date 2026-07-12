import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import * as bookmarksService from "@/lib/services/bookmarks";

// Frozen contract (plan.md §5.1/§5.3 step 8) — services/bookmarks.ts CRUD
// bodies. Mode B: the real bodies are implemented (Prisma-backed); these
// tests exercise them directly against the real DB.

const NAME_PREFIX = `mode-a-${randomUUID()}`;

afterAll(async () => {
  // Best-effort cleanup once real bodies land and start persisting rows.
  await db.category.deleteMany({ where: { name: { startsWith: NAME_PREFIX } } });
});

describe("AC-BM-001/012: createCategory + list()", () => {
  it("AC-BM-001: creates a category that is persisted and returned by list()", async () => {
    const category = await bookmarksService.createCategory({
      name: `${NAME_PREFIX}-infra`,
    });
    expect(category.name).toBe(`${NAME_PREFIX}-infra`);

    const grouped = await bookmarksService.list();
    expect(grouped.some((c) => c.id === category.id)).toBe(true);
  });

  it("AC-BM-012: list() groups bookmarks under their category", async () => {
    const category = await bookmarksService.createCategory({
      name: `${NAME_PREFIX}-devtools`,
    });
    const bookmark = await bookmarksService.createBookmark({
      name: "Grafana",
      url: "https://grafana.example.com",
      categoryId: category.id,
    });

    const grouped = await bookmarksService.list();
    const found = grouped.find((c) => c.id === category.id);
    expect(found?.bookmarks.some((b) => b.id === bookmark.id)).toBe(true);
  });
});

describe("AC-BM-002: renameCategory", () => {
  it("persists the new name", async () => {
    const category = await bookmarksService.createCategory({
      name: `${NAME_PREFIX}-old-name`,
    });
    const renamed = await bookmarksService.renameCategory(category.id, {
      name: `${NAME_PREFIX}-new-name`,
    });
    expect(renamed.name).toBe(`${NAME_PREFIX}-new-name`);
  });
});

describe("AC-BM-003/004: deleteCategory cascade", () => {
  it("removes the category and cascades delete to its bookmarks (no orphans)", async () => {
    const category = await bookmarksService.createCategory({
      name: `${NAME_PREFIX}-cascade`,
    });
    const bookmark = await bookmarksService.createBookmark({
      name: "Proxmox",
      url: "https://proxmox.example.com",
      categoryId: category.id,
    });

    await bookmarksService.deleteCategory(category.id);

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
    const category = await bookmarksService.createCategory({
      name: `${NAME_PREFIX}-create-bookmark`,
    });
    const bookmark = await bookmarksService.createBookmark({
      name: "pfSense",
      url: "https://pfsense.example.com",
      categoryId: category.id,
    });
    expect(bookmark.name).toBe("pfSense");
    expect(bookmark.categoryId).toBe(category.id);
  });

  it("AC-BM-009: edits an existing bookmark's fields, including moving category", async () => {
    const categoryA = await bookmarksService.createCategory({
      name: `${NAME_PREFIX}-cat-a`,
    });
    const categoryB = await bookmarksService.createCategory({
      name: `${NAME_PREFIX}-cat-b`,
    });
    const bookmark = await bookmarksService.createBookmark({
      name: "GitHub",
      url: "https://github.com",
      categoryId: categoryA.id,
    });

    const updated = await bookmarksService.updateBookmark(bookmark.id, {
      name: "GitHub (work)",
      categoryId: categoryB.id,
    });

    expect(updated.name).toBe("GitHub (work)");
    expect(updated.categoryId).toBe(categoryB.id);
  });

  it("AC-BM-010: deletes a bookmark", async () => {
    const category = await bookmarksService.createCategory({
      name: `${NAME_PREFIX}-delete-bookmark`,
    });
    const bookmark = await bookmarksService.createBookmark({
      name: "Temp",
      url: "https://temp.example.com",
      categoryId: category.id,
    });

    await bookmarksService.deleteBookmark(bookmark.id);

    const remaining = await db.bookmark.findMany({ where: { id: bookmark.id } });
    expect(remaining).toHaveLength(0);
  });
});
