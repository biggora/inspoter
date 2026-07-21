import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createProviderHttpClient } from "@/lib/providers/http";

// Provider HTTP client — retries 429/5xx with exponential backoff, maps
// auth/rate-limit/server/network failures to ProviderResult errors, and
// never leaks auth headers into error messages.

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("createProviderHttpClient().request()", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("returns ok:true with parsed JSON on a 2xx response", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, { id: "abc" }));
    vi.stubGlobal("fetch", fetchMock);

    const client = createProviderHttpClient();
    const result = await client.request<{ id: string }>({ path: "/things" });

    expect(result).toEqual({ ok: true, data: { id: "abc" } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns 'Authentication failed' on 401 without retrying", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse(401, {}));
    vi.stubGlobal("fetch", fetchMock);

    const client = createProviderHttpClient({
      headers: { Authorization: "Bearer super-secret-token" },
    });
    const result = await client.request({ path: "/things" });

    expect(result).toEqual({
      ok: false,
      kind: "error",
      message: "Authentication failed",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(result)).not.toContain("super-secret-token");
  });

  it("returns 'Authentication failed' on 403 without retrying", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse(403, {}));
    vi.stubGlobal("fetch", fetchMock);

    const client = createProviderHttpClient();
    const result = await client.request({ path: "/things" });

    expect(result).toEqual({
      ok: false,
      kind: "error",
      message: "Authentication failed",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries 429 up to 3 attempts with 1s/2s/4s backoff, then returns 'Rate limited'", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(429, {}));
    vi.stubGlobal("fetch", fetchMock);

    const client = createProviderHttpClient();
    const promise = client.request({ path: "/things" });

    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(2000);
    const result = await promise;

    expect(result).toEqual({
      ok: false,
      kind: "error",
      message: "Rate limited",
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("recovers after a 429 retry once a subsequent attempt succeeds", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(429, {}))
      .mockResolvedValueOnce(jsonResponse(200, { id: "ok" }));
    vi.stubGlobal("fetch", fetchMock);

    const client = createProviderHttpClient();
    const promise = client.request<{ id: string }>({ path: "/things" });

    await vi.advanceTimersByTimeAsync(1000);
    const result = await promise;

    expect(result).toEqual({ ok: true, data: { id: "ok" } });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retries 5xx up to 3 attempts, then returns 'Provider error'", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(503, {}));
    vi.stubGlobal("fetch", fetchMock);

    const client = createProviderHttpClient();
    const promise = client.request({ path: "/things" });

    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(2000);
    const result = await promise;

    expect(result).toEqual({
      ok: false,
      kind: "error",
      message: "Provider error",
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("returns 'Provider error' on a non-retryable 4xx without retrying", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse(400, {}));
    vi.stubGlobal("fetch", fetchMock);

    const client = createProviderHttpClient();
    const result = await client.request({ path: "/things" });

    expect(result).toEqual({
      ok: false,
      kind: "error",
      message: "Provider error",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns 'Provider unreachable' on a network error", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("fetch failed"));
    vi.stubGlobal("fetch", fetchMock);

    const client = createProviderHttpClient();
    const result = await client.request({ path: "/things" });

    expect(result).toEqual({
      ok: false,
      kind: "error",
      message: "Provider unreachable",
    });
  });

  it("returns 'Provider unreachable' when the request aborts due to timeout", async () => {
    const abortError = new DOMException(
      "The operation was aborted.",
      "TimeoutError",
    );
    const fetchMock = vi.fn().mockRejectedValueOnce(abortError);
    vi.stubGlobal("fetch", fetchMock);

    const client = createProviderHttpClient({ timeout: 5000 });
    const result = await client.request({ path: "/things" });

    expect(result).toEqual({
      ok: false,
      kind: "error",
      message: "Provider unreachable",
    });
  });

  it("forwards an external signal to fetch alongside the timeout signal", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, { id: "abc" }));
    vi.stubGlobal("fetch", fetchMock);

    const client = createProviderHttpClient();
    const controller = new AbortController();
    await client.request({ path: "/things", signal: controller.signal });

    expect(fetchMock).toHaveBeenCalledWith(
      "/things",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it("returns 'Request aborted' when the external signal is already aborted", async () => {
    const abortError = new DOMException(
      "The operation was aborted.",
      "AbortError",
    );
    const fetchMock = vi.fn().mockRejectedValueOnce(abortError);
    vi.stubGlobal("fetch", fetchMock);

    const client = createProviderHttpClient();
    const controller = new AbortController();
    controller.abort();
    const result = await client.request({
      path: "/things",
      signal: controller.signal,
    });

    expect(result).toEqual({
      ok: false,
      kind: "error",
      message: "Request aborted",
    });
  });
});
