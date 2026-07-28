import { z } from "zod";
import * as bookmarksService from "@/lib/services/bookmarks";
import type { Bookmark, Category } from "@/generated/prisma/client";
import { defineTool, type McpToolDefinition } from "@/lib/mcp/tool";
import { McpResourceNotFoundError } from "@/lib/mcp/errors";

// bookmarks.list() returns the category tree the dashboard renders. Search is
// applied here rather than pushed into the service: the whole workspace's
// bookmarks are a small, already-loaded set, and the tree shape is what makes
// the result readable to a model.
interface FlatBookmark extends Bookmark {
  categoryName: string;
  parentCategoryName: string | null;
}

function flatten(
  categories: bookmarksService.CategoryWithBookmarks[],
): FlatBookmark[] {
  const flat: FlatBookmark[] = [];
  const push = (
    bookmarks: Bookmark[],
    category: Category,
    parent: Category | null,
  ) => {
    for (const bookmark of bookmarks) {
      flat.push({
        ...bookmark,
        categoryName: category.name,
        parentCategoryName: parent?.name ?? null,
      });
    }
  };

  for (const category of categories) {
    push(category.bookmarks, category, null);
    for (const child of category.childCategories) {
      push(child.bookmarks, child, category);
    }
  }
  return flat;
}

function matches(bookmark: FlatBookmark, query: string): boolean {
  const needle = query.toLowerCase();
  return [bookmark.name, bookmark.url, bookmark.description ?? ""].some(
    (field) => field.toLowerCase().includes(needle),
  );
}

export const bookmarkTools: McpToolDefinition[] = [
  defineTool({
    name: "bookmarks_search",
    scope: "bookmarks:read",
    title: "Search bookmarks",
    description:
      "Search the workspace's bookmarks by name, URL or description. Omit `query` to list them all.",
    inputSchema: z.object({
      query: z.string().optional(),
      categoryId: z.string().optional(),
      limit: z.number().int().min(1).max(500).optional(),
    }),
    readOnly: true,
    handler: async (args, ctx) => {
      const tree = await bookmarksService.list(ctx.workspaceId);
      let items = flatten(tree);
      if (args.categoryId) {
        items = items.filter((item) => item.categoryId === args.categoryId);
      }
      if (args.query) {
        items = items.filter((item) => matches(item, args.query as string));
      }
      return { items: items.slice(0, args.limit ?? 100), total: items.length };
    },
  }),

  defineTool({
    name: "bookmarks_get",
    scope: "bookmarks:read",
    title: "Read a bookmark",
    description: "Read one bookmark by id.",
    inputSchema: z.object({ id: z.string() }),
    readOnly: true,
    handler: async (args, ctx) => {
      const bookmark = await bookmarksService.getBookmark(
        args.id,
        ctx.workspaceId,
      );
      if (!bookmark) throw new McpResourceNotFoundError("Bookmark", args.id);
      return bookmark;
    },
  }),

  defineTool({
    name: "bookmark_categories_list",
    scope: "bookmarks:read",
    title: "List bookmark categories",
    description:
      "List bookmark categories and their subcategories. Use an id from here as bookmark_create's categoryId.",
    inputSchema: z.object({}),
    readOnly: true,
    handler: async (_args, ctx) => {
      const tree = await bookmarksService.list(ctx.workspaceId);
      return tree.map((category) => ({
        id: category.id,
        name: category.name,
        bookmarkCount: category.bookmarks.length,
        childCategories: category.childCategories.map((child) => ({
          id: child.id,
          name: child.name,
          bookmarkCount: child.bookmarks.length,
        })),
      }));
    },
  }),

  defineTool({
    name: "bookmark_create",
    scope: "bookmarks:write",
    title: "Add a bookmark",
    description:
      "Add a bookmark to an existing category. The category must come from bookmark_categories_list.",
    inputSchema: z.object({
      name: z.string().min(1),
      url: z.url(),
      categoryId: z.string(),
      description: z.string().nullish(),
      icon: z.string().nullish().describe("Remix icon name, e.g. ri-link"),
      color: z.string().nullish(),
    }),
    readOnly: false,
    handler: (args, ctx) =>
      bookmarksService.createBookmark(ctx.workspaceId, args),
  }),
];
