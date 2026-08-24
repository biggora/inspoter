import { z } from "zod";

import { defineWebMcpTool, type WebMcpTool } from "@/lib/web-mcp/define-tool";
import { bookmarkColorTokens } from "@/lib/validation/bookmarks";
import type { Bookmark } from "@/generated/prisma/client";
import type { CategoryWithBookmarks } from "@/lib/services/bookmarks";
import type {
  BookmarkInput,
  BookmarkSearchParams,
  BookmarkSearchResult,
  CategorySummary,
} from "@/components/bookmarks/api";

// WebMCP tools for Bookmarks. Registered from the dashboard layout (see
// src/components/shell/web-mcp-global-tools.tsx) rather than from the
// Bookmarks page, so they need no live page state — only the
// /api/{bookmarks,categories} client.
//
// Tool names deliberately match the server-side MCP catalog in
// src/lib/mcp/tools/bookmarks.ts; the two registries are separate, and
// matching names keep both surfaces legible to anyone reading them together.
//
// Every id parameter names the tool it comes from: this layer never resolves
// free text to a record. Results are flat for the same reason the service's
// `flatten()` exists — a flat row is what a model can read, while the
// dashboard keeps the tree.

/**
 * Every client API call the bookmark tools make, injected rather than
 * imported so the factory unit-tests without React or `fetch`. Each member
 * matches the signature of its counterpart in
 * `src/components/bookmarks/api.ts`.
 */
export interface BookmarksToolDeps {
  /** bookmarksApi.search */
  searchBookmarks: (
    params?: BookmarkSearchParams,
  ) => Promise<BookmarkSearchResult>;
  /** categoriesApi.list */
  listCategories: () => Promise<CategoryWithBookmarks[]>;
  /** bookmarkFaviconApi.suggest */
  suggestFavicon: (url: string) => Promise<{ icon: string | null }>;
  /** bookmarksApi.create */
  createBookmark: (input: BookmarkInput) => Promise<Bookmark>;
  /** bookmarksApi.update */
  updateBookmark: (
    id: string,
    input: Partial<BookmarkInput>,
  ) => Promise<Bookmark>;
  /** bookmarksApi.remove */
  deleteBookmark: (id: string) => Promise<unknown>;
  /** categoriesApi.create */
  createCategory: (
    name: string,
    parentCategoryId?: string | null,
  ) => Promise<CategorySummary>;
  /** categoriesApi.rename */
  renameCategory: (
    id: string,
    name: string,
    parentCategoryId?: string | null,
  ) => Promise<CategorySummary>;
  /** Re-runs the server fetch so a visible Bookmarks page shows the change. */
  refresh: () => void;
}

// --- output budget ---
// A single tool result should stay near ~1500 characters, so list sizes are
// capped and free-text fields are trimmed rather than returned whole.

const MAX_NAME_LENGTH = 80;
const MAX_DESCRIPTION_LENGTH = 300;
const MAX_CATEGORIES = 50;

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

const colorField = z
  .enum(bookmarkColorTokens)
  .nullish()
  .describe("Accent color tone for the bookmark's icon tile");

const descriptionField = z
  .string()
  .max(2000)
  .nullish()
  .describe("Free-text note shown on the bookmark card");

const iconField = z
  .string()
  .min(1)
  .nullish()
  .describe("Remix icon name (e.g. ri-link) or an icon URL");

// --- bookmarks_search ---

const searchInputSchema = z
  .object({
    query: z
      .string()
      .min(1)
      .max(200)
      .optional()
      .describe("Substring of the name, URL or description; omit to list all"),
    categoryId: z
      .string()
      .min(1)
      .optional()
      .describe("Category id from bookmark_categories_list, to filter by"),
    limit: z
      .number()
      .int()
      .min(1)
      .max(20)
      .default(10)
      .describe("Maximum number of bookmarks to return"),
  })
  .strict();

function createSearchTool(deps: BookmarksToolDeps): WebMcpTool {
  return defineWebMcpTool({
    name: "bookmarks_search",
    title: "Search bookmarks",
    description:
      "Searches the workspace's bookmarks by name, URL or description, or lists them all when no query is given. Each row carries the bookmark's id plus the id and name of the category it sits in. Use bookmarks_get for a single bookmark's description, icon and color.",
    inputSchema: searchInputSchema,
    readOnly: true,
    // Bookmark names, URLs and descriptions are operator-authored free text.
    untrustedOutput: true,
    async handler({ query, categoryId, limit }) {
      const result = await deps.searchBookmarks({ query, categoryId, limit });
      return {
        total: result.total,
        bookmarks: result.items.map((bookmark) => ({
          id: bookmark.id,
          name: truncate(bookmark.name, MAX_NAME_LENGTH),
          url: bookmark.url,
          categoryId: bookmark.categoryId,
          categoryName: bookmark.categoryName,
        })),
      };
    },
  });
}

// --- bookmarks_get ---

const getInputSchema = z
  .object({
    id: z.string().min(1).describe("Bookmark id from bookmarks_search"),
  })
  .strict();

// No by-id read route exists for bookmarks — the dashboard renders the whole
// tree from a server component — so the lookup runs over one page of the flat
// list. The page is deliberately wide: a workspace's bookmarks are a small set
// the Bookmarks page already loads whole on every render.
const LOOKUP_PAGE_SIZE = 500;

function createGetTool(deps: BookmarksToolDeps): WebMcpTool {
  return defineWebMcpTool({
    name: "bookmarks_get",
    title: "Read a bookmark",
    description:
      "Reads one bookmark by id, including its description, icon and color — the fields bookmarks_search leaves out.",
    inputSchema: getInputSchema,
    readOnly: true,
    untrustedOutput: true,
    async handler({ id }) {
      const { items } = await deps.searchBookmarks({ limit: LOOKUP_PAGE_SIZE });
      const bookmark = items.find((item) => item.id === id);
      if (!bookmark) {
        throw new Error(
          `No bookmark with id "${id}". Use bookmarks_search to find one.`,
        );
      }

      return {
        id: bookmark.id,
        name: truncate(bookmark.name, MAX_NAME_LENGTH),
        url: bookmark.url,
        description: bookmark.description
          ? truncate(bookmark.description, MAX_DESCRIPTION_LENGTH)
          : null,
        icon: bookmark.icon,
        color: bookmark.color,
        categoryId: bookmark.categoryId,
        categoryName: bookmark.categoryName,
        parentCategoryName: bookmark.parentCategoryName,
      };
    },
  });
}

// --- bookmark_categories_list ---

function createCategoriesListTool(deps: BookmarksToolDeps): WebMcpTool {
  return defineWebMcpTool({
    name: "bookmark_categories_list",
    title: "List bookmark categories",
    description:
      "Lists every bookmark category, flattened to one row per category. A subcategory's row carries both the id and the name of its parent; a top-level category has null for both. Use an id from here as a categoryId.",
    inputSchema: z.object({}).strict(),
    readOnly: true,
    // Category names are operator-authored free text.
    untrustedOutput: true,
    async handler() {
      const tree = await deps.listCategories();
      const rows = tree.flatMap((category) => [
        {
          id: category.id,
          name: truncate(category.name, MAX_NAME_LENGTH),
          bookmarkCount: category.bookmarks.length,
          parentCategoryId: null as string | null,
          parentCategoryName: null as string | null,
        },
        ...category.childCategories.map((child) => ({
          id: child.id,
          name: truncate(child.name, MAX_NAME_LENGTH),
          bookmarkCount: child.bookmarks.length,
          parentCategoryId: category.id as string | null,
          parentCategoryName: truncate(category.name, MAX_NAME_LENGTH) as
            string | null,
        })),
      ]);

      return { total: rows.length, categories: rows.slice(0, MAX_CATEGORIES) };
    },
  });
}

// --- bookmark_favicon_suggest ---

const faviconSuggestInputSchema = z
  .object({
    url: z.url().describe("The bookmark's http(s) address"),
  })
  .strict();

function createFaviconSuggestTool(deps: BookmarksToolDeps): WebMcpTool {
  return defineWebMcpTool({
    name: "bookmark_favicon_suggest",
    title: "Suggest a bookmark icon",
    description:
      "Suggests an icon URL for a bookmark address, or null when none can be inferred. The bookmark's own host is never contacted — only its hostname is looked up.",
    inputSchema: faviconSuggestInputSchema,
    readOnly: true,
    async handler({ url }) {
      return { icon: (await deps.suggestFavicon(url)).icon };
    },
  });
}

// --- bookmark_create ---

const createInputSchema = z
  .object({
    name: z.string().trim().min(1).max(200).describe("Bookmark name"),
    url: z.url().describe("The bookmark's http(s) address"),
    categoryId: z
      .string()
      .min(1)
      .describe("Category id from bookmark_categories_list"),
    description: descriptionField,
    icon: iconField,
    color: colorField,
  })
  .strict();

function createCreateTool(deps: BookmarksToolDeps): WebMcpTool {
  return defineWebMcpTool({
    name: "bookmark_create",
    title: "Add a bookmark",
    description:
      "Adds a bookmark to an existing category. The category must come from bookmark_categories_list — there is no default category, and a bookmark cannot be created without one.",
    inputSchema: createInputSchema,
    readOnly: false,
    async handler({ name, url, categoryId, description, icon, color }) {
      const created = await deps.createBookmark({
        name,
        url,
        categoryId,
        description: description ?? null,
        icon: icon ?? null,
        color: color ?? null,
      });
      deps.refresh();
      return { bookmarkId: created.id, name: created.name, categoryId };
    },
  });
}

// --- bookmark_update ---

const updateInputSchema = z
  .object({
    id: z.string().min(1).describe("Bookmark id from bookmarks_search"),
    name: z.string().trim().min(1).max(200).optional().describe("New name"),
    url: z.url().optional().describe("New http(s) address"),
    categoryId: z
      .string()
      .min(1)
      .optional()
      .describe("Category id from bookmark_categories_list, to move it"),
    description: descriptionField,
    icon: iconField,
    color: colorField,
  })
  .strict();

function createUpdateTool(deps: BookmarksToolDeps): WebMcpTool {
  return defineWebMcpTool({
    name: "bookmark_update",
    title: "Update a bookmark",
    description:
      "Changes one bookmark. Omitted fields keep their current value; passing categoryId moves it to another category. Pass null for description, icon or color to clear it.",
    inputSchema: updateInputSchema,
    readOnly: false,
    async handler({ id, ...patch }) {
      if (Object.values(patch).every((value) => value === undefined)) {
        throw new Error("Pass at least one field to change.");
      }

      const updated = await deps.updateBookmark(id, patch);
      deps.refresh();
      return { bookmarkId: updated.id, name: updated.name };
    },
  });
}

// --- bookmark_delete ---

const deleteInputSchema = z
  .object({
    id: z.string().min(1).describe("Bookmark id from bookmarks_search"),
  })
  .strict();

function createDeleteTool(deps: BookmarksToolDeps): WebMcpTool {
  return defineWebMcpTool({
    name: "bookmark_delete",
    title: "Delete a bookmark",
    description:
      "Deletes one bookmark. Its category is left alone. This cannot be undone — confirm the bookmark with the operator first.",
    inputSchema: deleteInputSchema,
    readOnly: false,
    async handler({ id }) {
      await deps.deleteBookmark(id);
      deps.refresh();
      return { bookmarkId: id, deleted: true };
    },
  });
}

// --- bookmark_category_create ---

const parentCategoryIdField = z
  .string()
  .min(1)
  .nullable()
  .describe("Top-level category id from bookmark_categories_list, or null");

const categoryCreateInputSchema = z
  .object({
    name: z.string().trim().min(1).max(200).describe("Category name"),
    parentCategoryId: parentCategoryIdField,
  })
  .strict();

function createCategoryCreateTool(deps: BookmarksToolDeps): WebMcpTool {
  return defineWebMcpTool({
    name: "bookmark_category_create",
    title: "Create a bookmark category",
    description:
      "Creates a category, either top-level (parentCategoryId: null) or under an existing top-level one. Nesting is capped at a single level, so the parent may not itself be a subcategory.",
    inputSchema: categoryCreateInputSchema,
    readOnly: false,
    async handler({ name, parentCategoryId }) {
      const created = await deps.createCategory(name, parentCategoryId);
      deps.refresh();
      return { categoryId: created.id, name: created.name, parentCategoryId };
    },
  });
}

// --- bookmark_category_rename ---

const categoryRenameInputSchema = z
  .object({
    id: z.string().min(1).describe("Category id from bookmark_categories_list"),
    name: z.string().trim().min(1).max(200).describe("New category name"),
    parentCategoryId: parentCategoryIdField,
  })
  .strict();

function createCategoryRenameTool(deps: BookmarksToolDeps): WebMcpTool {
  return defineWebMcpTool({
    name: "bookmark_category_rename",
    title: "Rename a bookmark category",
    description:
      "Renames a category and sets where it sits: null promotes it back to top level, an id nests it under that top-level category. Both fields are always applied, so pass the current parent to leave the nesting as it is.",
    inputSchema: categoryRenameInputSchema,
    readOnly: false,
    async handler({ id, name, parentCategoryId }) {
      const renamed = await deps.renameCategory(id, name, parentCategoryId);
      deps.refresh();
      return { categoryId: renamed.id, name: renamed.name, parentCategoryId };
    },
  });
}

/** Every bookmark WebMCP tool, in the order an agent would discover them. */
export function createBookmarksTools(deps: BookmarksToolDeps): WebMcpTool[] {
  return [
    createCategoriesListTool(deps),
    createSearchTool(deps),
    createGetTool(deps),
    createFaviconSuggestTool(deps),
    createCreateTool(deps),
    createUpdateTool(deps),
    createDeleteTool(deps),
    createCategoryCreateTool(deps),
    createCategoryRenameTool(deps),
  ];
}
