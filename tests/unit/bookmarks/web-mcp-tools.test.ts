import { describe, expect, it, vi } from "vitest";

import {
  createBookmarksTools,
  type BookmarksToolDeps,
} from "@/components/bookmarks/web-mcp-tools";
import type { WebMcpTool } from "@/lib/web-mcp/define-tool";
import type {
  CategoryWithBookmarks,
  FlatBookmark,
} from "@/lib/services/bookmarks";
import type { Bookmark, Category } from "@/generated/prisma/client";
import { expectToolError, expectToolJson } from "../web-mcp/test-utils";

// Exercises every bookmark tool through the full WebMcpTool.execute() path —
// schema validation, handler, and the MCP result wrapping — with the client
// api injected as vi.fn() deps, so nothing here touches React or fetch.

const NOW = new Date("2026-01-01T00:00:00.000Z");
const WORKSPACE = "ws-1";

function makeBookmark(overrides: Partial<Bookmark> = {}): Bookmark {
  return {
    id: "bm-1",
    workspaceId: WORKSPACE,
    categoryId: "cat-1",
    categoryWorkspaceId: WORKSPACE,
    name: "Grafana",
    url: "https://grafana.example.com",
    icon: "ri-line-chart-line",
    color: "primary",
    description: "Metrics dashboards",
    position: 0,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function makeFlatBookmark(overrides: Partial<FlatBookmark> = {}): FlatBookmark {
  return {
    ...makeBookmark(),
    categoryName: "Operations",
    parentCategoryName: null,
    ...overrides,
  };
}

function makeCategory(overrides: Partial<Category> = {}): Category {
  return {
    id: "cat-1",
    workspaceId: WORKSPACE,
    name: "Operations",
    position: 0,
    createdAt: NOW,
    updatedAt: NOW,
    parentCategoryId: null,
    parentCategoryWorkspaceId: null,
    ...overrides,
  };
}

function makeTree(): CategoryWithBookmarks[] {
  return [
    {
      ...makeCategory(),
      bookmarks: [makeBookmark()],
      childCategories: [
        {
          ...makeCategory({
            id: "cat-2",
            name: "Monitoring",
            parentCategoryId: "cat-1",
            parentCategoryWorkspaceId: WORKSPACE,
          }),
          bookmarks: [makeBookmark({ id: "bm-2", categoryId: "cat-2" })],
        },
      ],
    },
  ];
}

function makeDeps(
  overrides: Partial<BookmarksToolDeps> = {},
): BookmarksToolDeps {
  return {
    searchBookmarks: vi.fn().mockResolvedValue({
      items: [makeFlatBookmark()],
      total: 1,
    }),
    listCategories: vi.fn().mockResolvedValue(makeTree()),
    suggestFavicon: vi.fn().mockResolvedValue({ icon: "https://icon.test/i" }),
    createBookmark: vi
      .fn()
      .mockImplementation(async (input) =>
        makeBookmark({ id: "bm-new", ...input }),
      ),
    updateBookmark: vi
      .fn()
      .mockImplementation(async (id, input) => makeBookmark({ id, ...input })),
    deleteBookmark: vi.fn().mockResolvedValue(undefined),
    createCategory: vi
      .fn()
      .mockImplementation(async (name) => ({ id: "cat-new", name })),
    renameCategory: vi
      .fn()
      .mockImplementation(async (id, name) => ({ id, name })),
    refresh: vi.fn(),
    ...overrides,
  };
}

function toolNamed(tools: WebMcpTool[], name: string): WebMcpTool {
  const tool = tools.find((candidate) => candidate.name === name);
  if (!tool) throw new Error(`No tool named ${name}`);
  return tool;
}

const EXPECTED_NAMES = [
  "bookmark_categories_list",
  "bookmarks_search",
  "bookmarks_get",
  "bookmark_favicon_suggest",
  "bookmark_create",
  "bookmark_update",
  "bookmark_delete",
  "bookmark_category_create",
  "bookmark_category_rename",
];

describe("createBookmarksTools", () => {
  it("exposes exactly the expected tool names", () => {
    const tools = createBookmarksTools(makeDeps());
    expect(tools.map((tool) => tool.name)).toEqual(EXPECTED_NAMES);
  });

  it("gives every tool a non-empty title for clients that caption tools", () => {
    for (const tool of createBookmarksTools(makeDeps())) {
      expect(tool.title.length).toBeGreaterThan(0);
    }
  });

  it("marks the reads read-only and the writes not", () => {
    const tools = createBookmarksTools(makeDeps());
    const readOnly = tools
      .filter((tool) => tool.annotations.readOnlyHint)
      .map((tool) => tool.name);

    expect(readOnly).toEqual([
      "bookmark_categories_list",
      "bookmarks_search",
      "bookmarks_get",
      "bookmark_favicon_suggest",
    ]);
  });

  it("flags the tools returning operator-authored text as untrusted", () => {
    const tools = createBookmarksTools(makeDeps());
    const untrusted = tools
      .filter((tool) => tool.annotations.untrustedContentHint)
      .map((tool) => tool.name);

    expect(untrusted).toEqual([
      "bookmark_categories_list",
      "bookmarks_search",
      "bookmarks_get",
    ]);
  });
});

describe("bookmark_categories_list", () => {
  it("flattens the tree so a subcategory row carries its parent's id and name", async () => {
    const tools = createBookmarksTools(makeDeps());
    const result = await toolNamed(tools, "bookmark_categories_list").execute(
      {},
    );

    expect(expectToolJson(result)).toEqual({
      total: 2,
      categories: [
        {
          id: "cat-1",
          name: "Operations",
          bookmarkCount: 1,
          parentCategoryId: null,
          parentCategoryName: null,
        },
        {
          id: "cat-2",
          name: "Monitoring",
          bookmarkCount: 1,
          parentCategoryId: "cat-1",
          parentCategoryName: "Operations",
        },
      ],
    });
  });

  it("surfaces a rejecting api call as an error result", async () => {
    const deps = makeDeps({
      listCategories: vi.fn().mockRejectedValue(new Error("Network down.")),
    });
    const result = await toolNamed(
      createBookmarksTools(deps),
      "bookmark_categories_list",
    ).execute({});

    expect(result.isError).toBe(true);
    expect(expectToolError(result)).toBe("Network down.");
  });
});

describe("bookmarks_search", () => {
  it("returns compact rows carrying both the category id and its name", async () => {
    const deps = makeDeps();
    const result = await toolNamed(
      createBookmarksTools(deps),
      "bookmarks_search",
    ).execute({ query: "graf" });

    expect(expectToolJson(result)).toEqual({
      total: 1,
      bookmarks: [
        {
          id: "bm-1",
          name: "Grafana",
          url: "https://grafana.example.com",
          categoryId: "cat-1",
          categoryName: "Operations",
        },
      ],
    });
  });

  it("passes the query, categoryId and limit through, defaulting the limit", async () => {
    const deps = makeDeps();
    const tool = toolNamed(createBookmarksTools(deps), "bookmarks_search");

    await tool.execute({ query: "graf", categoryId: "cat-1" });
    expect(deps.searchBookmarks).toHaveBeenCalledWith({
      query: "graf",
      categoryId: "cat-1",
      limit: 10,
    });

    await tool.execute({ limit: 20 });
    expect(deps.searchBookmarks).toHaveBeenLastCalledWith({
      query: undefined,
      categoryId: undefined,
      limit: 20,
    });
  });

  it("rejects a limit above the cap without calling the api", async () => {
    const deps = makeDeps();
    const result = await toolNamed(
      createBookmarksTools(deps),
      "bookmarks_search",
    ).execute({ limit: 21 });

    expect(expectToolError(result)).toContain("Invalid input");
    expect(deps.searchBookmarks).not.toHaveBeenCalled();
  });
});

describe("bookmarks_get", () => {
  it("returns the fields the search projection leaves out", async () => {
    const deps = makeDeps();
    const result = await toolNamed(
      createBookmarksTools(deps),
      "bookmarks_get",
    ).execute({ id: "bm-1" });

    expect(expectToolJson(result)).toMatchObject({
      id: "bm-1",
      description: "Metrics dashboards",
      icon: "ri-line-chart-line",
      color: "primary",
      categoryName: "Operations",
      parentCategoryName: null,
    });
  });

  it("errors when no bookmark carries that id", async () => {
    const deps = makeDeps();
    const result = await toolNamed(
      createBookmarksTools(deps),
      "bookmarks_get",
    ).execute({ id: "bm-missing" });

    expect(expectToolError(result)).toContain(
      'No bookmark with id "bm-missing"',
    );
  });
});

describe("bookmark_favicon_suggest", () => {
  it("answers with the suggested icon for the address", async () => {
    const deps = makeDeps();
    const result = await toolNamed(
      createBookmarksTools(deps),
      "bookmark_favicon_suggest",
    ).execute({ url: "https://grafana.example.com" });

    expect(expectToolJson(result)).toEqual({ icon: "https://icon.test/i" });
    expect(deps.suggestFavicon).toHaveBeenCalledWith(
      "https://grafana.example.com",
    );
  });

  it("rejects a non-URL argument without calling the api", async () => {
    const deps = makeDeps();
    const result = await toolNamed(
      createBookmarksTools(deps),
      "bookmark_favicon_suggest",
    ).execute({ url: "grafana" });

    expect(expectToolError(result)).toContain("Invalid input");
    expect(deps.suggestFavicon).not.toHaveBeenCalled();
  });
});

describe("bookmark_create", () => {
  it("requires a categoryId and refuses to create without one", async () => {
    const deps = makeDeps();
    const result = await toolNamed(
      createBookmarksTools(deps),
      "bookmark_create",
    ).execute({ name: "Grafana", url: "https://grafana.example.com" });

    expect(expectToolError(result)).toContain("Invalid input");
    expect(deps.createBookmark).not.toHaveBeenCalled();
    expect(deps.refresh).not.toHaveBeenCalled();
  });

  it("rejects an empty categoryId, so a real id must come from the list tool", async () => {
    const deps = makeDeps();
    const result = await toolNamed(
      createBookmarksTools(deps),
      "bookmark_create",
    ).execute({
      name: "Grafana",
      url: "https://grafana.example.com",
      categoryId: "",
    });

    expect(expectToolError(result)).toContain("Invalid input");
    expect(deps.createBookmark).not.toHaveBeenCalled();
  });

  it("sends the optional fields as explicit nulls and refreshes the page", async () => {
    const deps = makeDeps();
    const result = await toolNamed(
      createBookmarksTools(deps),
      "bookmark_create",
    ).execute({
      name: "Grafana",
      url: "https://grafana.example.com",
      categoryId: "cat-1",
    });

    expect(deps.createBookmark).toHaveBeenCalledWith({
      name: "Grafana",
      url: "https://grafana.example.com",
      categoryId: "cat-1",
      description: null,
      icon: null,
      color: null,
    });
    expect(deps.refresh).toHaveBeenCalledTimes(1);
    expect(expectToolJson(result)).toMatchObject({
      bookmarkId: "bm-new",
      categoryId: "cat-1",
    });
  });

  it("rejects a color outside the accent token set", async () => {
    const deps = makeDeps();
    const result = await toolNamed(
      createBookmarksTools(deps),
      "bookmark_create",
    ).execute({
      name: "Grafana",
      url: "https://grafana.example.com",
      categoryId: "cat-1",
      color: "crimson",
    });

    expect(expectToolError(result)).toContain("Invalid input");
    expect(deps.createBookmark).not.toHaveBeenCalled();
  });
});

describe("bookmark_update", () => {
  it("sends only the fields given, keeping a null as an explicit clear", async () => {
    const deps = makeDeps();
    await toolNamed(createBookmarksTools(deps), "bookmark_update").execute({
      id: "bm-1",
      name: "Grafana (prod)",
      description: null,
    });

    expect(deps.updateBookmark).toHaveBeenCalledWith("bm-1", {
      name: "Grafana (prod)",
      description: null,
    });
    expect(deps.refresh).toHaveBeenCalledTimes(1);
  });

  it("refuses an id-only call rather than issuing an empty patch", async () => {
    const deps = makeDeps();
    const result = await toolNamed(
      createBookmarksTools(deps),
      "bookmark_update",
    ).execute({ id: "bm-1" });

    expect(expectToolError(result)).toBe("Pass at least one field to change.");
    expect(deps.updateBookmark).not.toHaveBeenCalled();
    expect(deps.refresh).not.toHaveBeenCalled();
  });

  it("surfaces a rejecting api call as an error result and skips the refresh", async () => {
    const deps = makeDeps({
      updateBookmark: vi.fn().mockRejectedValue(new Error("Bookmark is gone.")),
    });
    const result = await toolNamed(
      createBookmarksTools(deps),
      "bookmark_update",
    ).execute({ id: "bm-1", name: "New" });

    expect(result.isError).toBe(true);
    expect(expectToolError(result)).toBe("Bookmark is gone.");
    expect(deps.refresh).not.toHaveBeenCalled();
  });
});

describe("bookmark_delete", () => {
  it("passes the id through and refreshes", async () => {
    const deps = makeDeps();
    const result = await toolNamed(
      createBookmarksTools(deps),
      "bookmark_delete",
    ).execute({ id: "bm-1" });

    expect(deps.deleteBookmark).toHaveBeenCalledWith("bm-1");
    expect(deps.refresh).toHaveBeenCalledTimes(1);
    expect(expectToolJson(result)).toEqual({
      bookmarkId: "bm-1",
      deleted: true,
    });
  });
});

describe("bookmark category writes", () => {
  it("creates a category under an explicit parent id", async () => {
    const deps = makeDeps();
    const result = await toolNamed(
      createBookmarksTools(deps),
      "bookmark_category_create",
    ).execute({ name: "Monitoring", parentCategoryId: "cat-1" });

    expect(deps.createCategory).toHaveBeenCalledWith("Monitoring", "cat-1");
    expect(expectToolJson(result)).toEqual({
      categoryId: "cat-new",
      name: "Monitoring",
      parentCategoryId: "cat-1",
    });
  });

  it("requires parentCategoryId to be stated, null included", async () => {
    const deps = makeDeps();
    const result = await toolNamed(
      createBookmarksTools(deps),
      "bookmark_category_create",
    ).execute({ name: "Monitoring" });

    expect(expectToolError(result)).toContain("Invalid input");
    expect(deps.createCategory).not.toHaveBeenCalled();
  });

  it("renames a category and promotes it with parentCategoryId: null", async () => {
    const deps = makeDeps();
    const result = await toolNamed(
      createBookmarksTools(deps),
      "bookmark_category_rename",
    ).execute({ id: "cat-2", name: "Metrics", parentCategoryId: null });

    expect(deps.renameCategory).toHaveBeenCalledWith("cat-2", "Metrics", null);
    expect(deps.refresh).toHaveBeenCalledTimes(1);
    expect(expectToolJson(result)).toEqual({
      categoryId: "cat-2",
      name: "Metrics",
      parentCategoryId: null,
    });
  });
});
