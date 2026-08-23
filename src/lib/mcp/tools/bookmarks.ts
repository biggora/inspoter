import { z } from "zod";
import * as bookmarksService from "@/lib/services/bookmarks";
import { defineTool, type McpToolDefinition } from "@/lib/mcp/tool";
import { McpResourceNotFoundError } from "@/lib/mcp/errors";
import { suggestFavicon } from "@/lib/bookmarks/favicon";
import { bookmarkColorTokens } from "@/lib/validation/bookmarks";

// The flattening and the search predicate live in the service so this file and
// /api/v1/bookmarks answer the same question the same way; the flat shape is
// what makes a result readable to a model, while the dashboard keeps the tree.

const bookmarkFields = {
  description: z.string().nullish(),
  icon: z
    .string()
    .nullish()
    .describe("Remix icon name (e.g. ri-link) or an icon URL."),
  color: z.enum(bookmarkColorTokens).nullish(),
};

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
    handler: (args, ctx) => bookmarksService.search(ctx.workspaceId, args),
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
      "List bookmark categories and their subcategories. Use an id from here as a categoryId.",
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
    name: "bookmark_favicon_suggest",
    scope: "bookmarks:read",
    title: "Suggest a bookmark icon",
    description:
      "Suggest an icon URL for a bookmark address. Answers null when no icon can be inferred. The bookmark's own host is never contacted — only its hostname is looked up.",
    inputSchema: z.object({ url: z.url() }),
    readOnly: true,
    handler: async (args) => ({ icon: await suggestFavicon(args.url) }),
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
      ...bookmarkFields,
    }),
    readOnly: false,
    handler: (args, ctx) =>
      bookmarksService.createBookmark(ctx.workspaceId, args),
  }),

  defineTool({
    name: "bookmark_update",
    scope: "bookmarks:write",
    title: "Update a bookmark",
    description:
      "Change one bookmark. Omitted fields keep their current value; passing `categoryId` moves it to another category.",
    inputSchema: z.object({
      id: z.string(),
      name: z.string().min(1).optional(),
      url: z.url().optional(),
      categoryId: z.string().optional(),
      ...bookmarkFields,
    }),
    readOnly: false,
    handler: async ({ id, ...input }, ctx) => {
      const bookmark = await bookmarksService.getBookmark(id, ctx.workspaceId);
      if (!bookmark) throw new McpResourceNotFoundError("Bookmark", id);
      return bookmarksService.updateBookmark(id, ctx.workspaceId, input);
    },
  }),

  defineTool({
    name: "bookmark_delete",
    scope: "bookmarks:write",
    title: "Delete a bookmark",
    description: "Delete one bookmark. Its category is left alone.",
    inputSchema: z.object({ id: z.string() }),
    readOnly: false,
    handler: async (args, ctx) => {
      const bookmark = await bookmarksService.getBookmark(
        args.id,
        ctx.workspaceId,
      );
      if (!bookmark) throw new McpResourceNotFoundError("Bookmark", args.id);
      await bookmarksService.deleteBookmark(args.id, ctx.workspaceId);
      return { id: args.id, deleted: true };
    },
  }),

  defineTool({
    name: "bookmarks_reorder",
    scope: "bookmarks:write",
    title: "Reorder bookmarks",
    description:
      "Set the order of the bookmarks inside one or two categories. Every bookmark of a listed category must appear in its list; naming two categories moves a bookmark between them.",
    inputSchema: z.object({
      categories: z
        .array(
          z.object({
            categoryId: z.string(),
            bookmarkIds: z.array(z.string()),
          }),
        )
        .min(1)
        .max(2),
    }),
    readOnly: false,
    handler: async (args, ctx) => {
      await bookmarksService.reorderBookmarks(ctx.workspaceId, args.categories);
      return { reordered: true };
    },
  }),

  defineTool({
    name: "bookmark_category_create",
    scope: "bookmarks:write",
    title: "Create a bookmark category",
    description:
      "Create a category, optionally under an existing top-level one. Nesting is capped at a single level.",
    inputSchema: z.object({
      name: z.string().min(1),
      parentCategoryId: z
        .string()
        .nullish()
        .describe("A top-level category id, or null for a top-level category."),
    }),
    readOnly: false,
    handler: (args, ctx) =>
      bookmarksService.createCategory(ctx.workspaceId, args),
  }),

  defineTool({
    name: "bookmark_category_rename",
    scope: "bookmarks:write",
    title: "Rename or re-parent a bookmark category",
    description:
      "Rename a category and optionally move it under a top-level one. Pass `parentCategoryId: null` to promote it back to top level; omit the field to leave the parent alone.",
    inputSchema: z.object({
      id: z.string(),
      name: z.string().min(1),
      parentCategoryId: z.string().nullish(),
    }),
    readOnly: false,
    handler: ({ id, ...input }, ctx) =>
      bookmarksService.renameCategory(id, ctx.workspaceId, input),
  }),

  defineTool({
    name: "bookmark_categories_reorder",
    scope: "bookmarks:write",
    title: "Reorder bookmark categories",
    description:
      "Set the order of the categories. `order` is the full list of category ids in their new order.",
    inputSchema: z.object({ order: z.array(z.string()).min(1) }),
    readOnly: false,
    handler: async (args, ctx) => {
      await bookmarksService.reorderCategories(ctx.workspaceId, args.order);
      return { reordered: true };
    },
  }),
];
