import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// Favicon suggestion route (Phase 3): GET /api/bookmarks/favicon-suggest.
// SSRF-safe by construction — the only outbound fetch target is Google's
// fixed favicon-inference endpoint; the bookmark's own hostname is passed
// only as a query-string value, never as the connection target. No
// tests/unit/api/** convention existed yet for src/app/api/** route
// handlers, so this file establishes one (mirrors tests/unit/providers/
// http.test.ts's vi.stubGlobal("fetch", ...) mocking style).

const { requireAuthWithWorkspaceHeaderMock } = vi.hoisted(() => ({
  requireAuthWithWorkspaceHeaderMock: vi.fn(),
}));

vi.mock("@/lib/auth/dal", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/dal")>();
  return {
    ...actual,
    requireAuthWithWorkspaceHeader: requireAuthWithWorkspaceHeaderMock,
  };
});

function imageResponse(status = 200): Response {
  return new Response(null, {
    status,
    headers: { "content-type": "image/png" },
  });
}

function htmlResponse(status = 200): Response {
  return new Response(null, {
    status,
    headers: { "content-type": "text/html" },
  });
}

function makeRequest(query: string | null): NextRequest {
  const url =
    query === null
      ? "http://localhost/api/bookmarks/favicon-suggest"
      : `http://localhost/api/bookmarks/favicon-suggest?url=${query}`;
  return new NextRequest(url);
}

beforeEach(() => {
  requireAuthWithWorkspaceHeaderMock.mockReset().mockResolvedValue({
    operator: { id: "test-operator" },
    workspace: { id: "test-workspace" },
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("buildFaviconSuggestUrl", () => {
  it("builds the fixed Google favicon-inference URL for a plain hostname", async () => {
    const { buildFaviconSuggestUrl } =
      await import("@/app/api/bookmarks/favicon-suggest/route");
    expect(buildFaviconSuggestUrl("github.com")).toBe(
      "https://www.google.com/s2/favicons?sz=64&domain=github.com",
    );
  });

  it("URL-encodes special characters in the hostname", async () => {
    const { buildFaviconSuggestUrl } =
      await import("@/app/api/bookmarks/favicon-suggest/route");
    const hostname = "münchen.example.com";
    expect(buildFaviconSuggestUrl(hostname)).toBe(
      `https://www.google.com/s2/favicons?sz=64&domain=${encodeURIComponent(hostname)}`,
    );
    expect(buildFaviconSuggestUrl(hostname)).not.toContain("ü");
  });
});

describe("GET /api/bookmarks/favicon-suggest", () => {
  it("returns 400 when the url param is missing", async () => {
    const { GET } = await import("@/app/api/bookmarks/favicon-suggest/route");
    const res = await GET(makeRequest(null));
    expect(res.status).toBe(400);
  });

  it("returns 400 when the url param is empty", async () => {
    const { GET } = await import("@/app/api/bookmarks/favicon-suggest/route");
    const res = await GET(makeRequest(""));
    expect(res.status).toBe(400);
  });

  it("returns 400 for a non-http(s) url", async () => {
    const { GET } = await import("@/app/api/bookmarks/favicon-suggest/route");
    const res = await GET(makeRequest(encodeURIComponent("ftp://example.com")));
    expect(res.status).toBe(400);
  });

  it("returns 400 for a malformed url", async () => {
    const { GET } = await import("@/app/api/bookmarks/favicon-suggest/route");
    const res = await GET(makeRequest(encodeURIComponent("not a url")));
    expect(res.status).toBe(400);
  });

  it("returns 200 with the built icon URL on a successful image response", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(imageResponse(200));
    vi.stubGlobal("fetch", fetchMock);

    const { GET, buildFaviconSuggestUrl } =
      await import("@/app/api/bookmarks/favicon-suggest/route");
    const res = await GET(
      makeRequest(encodeURIComponent("https://github.com/some/path")),
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      icon: buildFaviconSuggestUrl("github.com"),
    });

    // Hard security invariant: the only outbound fetch target is the fixed
    // Google favicon endpoint — never the bookmark's own URL/host.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const requestedUrl = new URL(fetchMock.mock.calls[0][0] as string);
    expect(requestedUrl.origin).toBe("https://www.google.com");
  });

  it("returns 200 with icon:null on a non-2xx response", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(imageResponse(404));
    vi.stubGlobal("fetch", fetchMock);

    const { GET } = await import("@/app/api/bookmarks/favicon-suggest/route");
    const res = await GET(
      makeRequest(encodeURIComponent("https://example.com")),
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ icon: null });
  });

  it("returns 200 with icon:null on a non-image content-type", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(htmlResponse(200));
    vi.stubGlobal("fetch", fetchMock);

    const { GET } = await import("@/app/api/bookmarks/favicon-suggest/route");
    const res = await GET(
      makeRequest(encodeURIComponent("https://example.com")),
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ icon: null });
  });

  it("returns 200 with icon:null when fetch throws (network error / timeout)", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("fetch failed"));
    vi.stubGlobal("fetch", fetchMock);

    const { GET } = await import("@/app/api/bookmarks/favicon-suggest/route");
    const res = await GET(
      makeRequest(encodeURIComponent("https://example.com")),
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ icon: null });
  });
});
