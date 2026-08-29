import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// Read routes for the Bookmarks collection endpoints: GET /api/bookmarks and
// GET /api/categories. Both existed as POST-only until the WebMCP layer needed
// a way to obtain a categoryId from the browser. The service layer is mocked
// (no database in the unit project) — the point of these tests is that the
// handlers reuse bookmarksService.search()/list() under the same session auth
// and workspace scoping the POST handlers beside them use.
//
// Follows the mocking style established by tests/unit/api/
// bookmarks-favicon-suggest.test.ts.

const { requireAuthWithWorkspaceHeaderMock, searchMock, listMock } = vi.hoisted(
  () => ({
    requireAuthWithWorkspaceHeaderMock: vi.fn(),
    searchMock: vi.fn(),
    listMock: vi.fn(),
  }),
);

vi.mock("@/lib/auth/dal", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/dal")>();
  return {
    ...actual,
    requireAuthWithWorkspaceHeader: requireAuthWithWorkspaceHeaderMock,
  };
});

vi.mock("@/lib/services/bookmarks", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/services/bookmarks")>();
  return { ...actual, search: searchMock, list: listMock };
});

function makeRequest(path: string): NextRequest {
  return new NextRequest(`http://localhost${path}`);
}

beforeEach(() => {
  requireAuthWithWorkspaceHeaderMock.mockReset().mockResolvedValue({
    operator: { id: "test-operator", username: "tester" },
    workspace: { id: "test-workspace" },
  });
  searchMock.mockReset().mockResolvedValue({ items: [], total: 0 });
  listMock.mockReset().mockResolvedValue([]);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GET /api/bookmarks", () => {
  it("answers with the service's flat { items, total } page", async () => {
    searchMock.mockResolvedValueOnce({
      items: [{ id: "bm-1", name: "Grafana", categoryName: "Ops" }],
      total: 1,
    });

    const { GET } = await import("@/app/api/bookmarks/route");
    const res = await GET(makeRequest("/api/bookmarks"));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      items: [{ id: "bm-1", name: "Grafana", categoryName: "Ops" }],
      total: 1,
    });
  }, 10_000);

  it("scopes the search to the authenticated workspace", async () => {
    const { GET } = await import("@/app/api/bookmarks/route");
    await GET(makeRequest("/api/bookmarks"));

    expect(searchMock).toHaveBeenCalledWith("test-workspace", {});
  });

  it("passes query, categoryId and a coerced numeric limit through", async () => {
    const { GET } = await import("@/app/api/bookmarks/route");
    await GET(
      makeRequest("/api/bookmarks?query=graf&categoryId=cat-1&limit=25"),
    );

    expect(searchMock).toHaveBeenCalledWith("test-workspace", {
      query: "graf",
      categoryId: "cat-1",
      limit: 25,
    });
  });

  it("returns 400 for a non-numeric limit, without touching the service", async () => {
    const { GET } = await import("@/app/api/bookmarks/route");
    const res = await GET(makeRequest("/api/bookmarks?limit=all"));

    expect(res.status).toBe(400);
    expect(searchMock).not.toHaveBeenCalled();
  });

  it("returns 400 for an unknown search param", async () => {
    const { GET } = await import("@/app/api/bookmarks/route");
    const res = await GET(makeRequest("/api/bookmarks?workspaceId=other"));

    expect(res.status).toBe(400);
    expect(searchMock).not.toHaveBeenCalled();
  });

  it("refuses the read when the workspace header is missing", async () => {
    const { WorkspaceContextRequiredError } = await import("@/lib/auth/dal");
    requireAuthWithWorkspaceHeaderMock.mockRejectedValueOnce(
      new WorkspaceContextRequiredError(),
    );

    const { GET } = await import("@/app/api/bookmarks/route");
    const res = await GET(makeRequest("/api/bookmarks"));

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      error: "WORKSPACE_CONTEXT_REQUIRED",
    });
    expect(searchMock).not.toHaveBeenCalled();
  });
});

describe("GET /api/categories", () => {
  it("answers with the category tree for the authenticated workspace", async () => {
    listMock.mockResolvedValueOnce([
      { id: "cat-1", name: "Ops", bookmarks: [], childCategories: [] },
    ]);

    const { GET } = await import("@/app/api/categories/route");
    const res = await GET(makeRequest("/api/categories"));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual([
      { id: "cat-1", name: "Ops", bookmarks: [], childCategories: [] },
    ]);
    expect(listMock).toHaveBeenCalledWith("test-workspace");
  });

  it("refuses the read when the workspace header is missing", async () => {
    const { WorkspaceContextRequiredError } = await import("@/lib/auth/dal");
    requireAuthWithWorkspaceHeaderMock.mockRejectedValueOnce(
      new WorkspaceContextRequiredError(),
    );

    const { GET } = await import("@/app/api/categories/route");
    const res = await GET(makeRequest("/api/categories"));

    expect(res.status).toBe(400);
    expect(listMock).not.toHaveBeenCalled();
  });
});
