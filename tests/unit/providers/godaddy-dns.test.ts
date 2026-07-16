import { afterEach, describe, expect, it, vi } from "vitest";
import { GoDaddyDnsProvider } from "@/lib/providers/dns/godaddy";

// Contract tests for the real GoDaddy DNS provider (architecture.md §4.1) —
// mocks globalThis.fetch with recorded GoDaddy v1 response shapes so
// provider mapping and error handling are verified without network calls.
// GoDaddy's PUT/DELETE endpoints return an empty body on success, unlike
// Cloudflare's always-JSON envelope, so those paths are covered explicitly.

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function emptyResponse(status: number): Response {
  return new Response(null, { status });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GoDaddyDnsProvider", () => {
  it("sends the sso-key header on every request", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse(200, []));
    vi.stubGlobal("fetch", fetchMock);

    const provider = new GoDaddyDnsProvider(
      "test-id",
      "Test GoDaddy",
      "test-key",
      "test-secret",
    );
    await provider.listDomains();

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.godaddy.com/v1/domains",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "sso-key test-key:test-secret",
        }),
      }),
    );
  });

  it("listDomains maps domains to Domain[]", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      jsonResponse(200, [
        { domainId: 1, domain: "example.com", status: "ACTIVE" },
        { domainId: 2, domain: "example.dev", status: "ACTIVE" },
      ]),
    );
    vi.stubGlobal("fetch", fetchMock);

    const provider = new GoDaddyDnsProvider(
      "test-id",
      "Test GoDaddy",
      "test-key",
      "test-secret",
    );
    const result = await provider.listDomains();

    expect(result).toEqual({
      ok: true,
      data: [
        { id: "example.com", name: "example.com", provider: "godaddy" },
        { id: "example.dev", name: "example.dev", provider: "godaddy" },
      ],
    });
  });

  it("listRecords maps records to DnsRecord[] with a type-name id", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      jsonResponse(200, [
        { type: "A", name: "@", data: "192.0.2.10", ttl: 3600 },
        { type: "CNAME", name: "www", data: "example.com", ttl: 3600 },
      ]),
    );
    vi.stubGlobal("fetch", fetchMock);

    const provider = new GoDaddyDnsProvider(
      "test-id",
      "Test GoDaddy",
      "test-key",
      "test-secret",
    );
    const result = await provider.listRecords("example.com");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.godaddy.com/v1/domains/example.com/records",
      expect.anything(),
    );
    expect(result).toEqual({
      ok: true,
      data: [
        { id: "A-@", type: "A", name: "@", value: "192.0.2.10", ttl: 3600 },
        {
          id: "CNAME-www",
          type: "CNAME",
          name: "www",
          value: "example.com",
          ttl: 3600,
        },
      ],
    });
  });

  it("createRecord PUTs the mapped body and returns the created record on an empty response", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(emptyResponse(200));
    vi.stubGlobal("fetch", fetchMock);

    const provider = new GoDaddyDnsProvider(
      "test-id",
      "Test GoDaddy",
      "test-key",
      "test-secret",
    );
    const result = await provider.createRecord("example.com", {
      type: "A",
      name: "www",
      value: "192.0.2.20",
      ttl: 300,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.godaddy.com/v1/domains/example.com/records/A/www",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify([{ data: "192.0.2.20", ttl: 300 }]),
      }),
    );
    expect(result).toEqual({
      ok: true,
      data: {
        id: "A-www",
        type: "A",
        name: "www",
        value: "192.0.2.20",
        ttl: 300,
      },
    });
  });

  it("createRecord includes priority when provided", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(emptyResponse(200));
    vi.stubGlobal("fetch", fetchMock);

    const provider = new GoDaddyDnsProvider(
      "test-id",
      "Test GoDaddy",
      "test-key",
      "test-secret",
    );
    await provider.createRecord("example.com", {
      type: "MX",
      name: "@",
      value: "mail.example.com",
      ttl: 300,
      priority: 10,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.godaddy.com/v1/domains/example.com/records/MX/@",
      expect.objectContaining({
        body: JSON.stringify([
          { data: "mail.example.com", ttl: 300, priority: 10 },
        ]),
      }),
    );
  });

  it("updateRecord merges a partial patch with the current record before PUT", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(200, [
          { type: "A", name: "www", data: "192.0.2.10", ttl: 3600 },
        ]),
      )
      .mockResolvedValueOnce(emptyResponse(200));
    vi.stubGlobal("fetch", fetchMock);

    const provider = new GoDaddyDnsProvider(
      "test-id",
      "Test GoDaddy",
      "test-key",
      "test-secret",
    );
    const result = await provider.updateRecord("example.com", "A-www", {
      value: "192.0.2.99",
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://api.godaddy.com/v1/domains/example.com/records/A/www",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify([{ data: "192.0.2.99", ttl: 3600 }]),
      }),
    );
    expect(result).toEqual({
      ok: true,
      data: {
        id: "A-www",
        type: "A",
        name: "www",
        value: "192.0.2.99",
        ttl: 3600,
      },
    });
  });

  it("updateRecord skips the lookup when value and ttl are both provided", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(emptyResponse(200));
    vi.stubGlobal("fetch", fetchMock);

    const provider = new GoDaddyDnsProvider(
      "test-id",
      "Test GoDaddy",
      "test-key",
      "test-secret",
    );
    const result = await provider.updateRecord("example.com", "A-www", {
      value: "192.0.2.99",
      ttl: 600,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.godaddy.com/v1/domains/example.com/records/A/www",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify([{ data: "192.0.2.99", ttl: 600 }]),
      }),
    );
    expect(result).toEqual({
      ok: true,
      data: {
        id: "A-www",
        type: "A",
        name: "www",
        value: "192.0.2.99",
        ttl: 600,
      },
    });
  });

  it("updateRecord returns an error when the current record cannot be found", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse(200, []));
    vi.stubGlobal("fetch", fetchMock);

    const provider = new GoDaddyDnsProvider(
      "test-id",
      "Test GoDaddy",
      "test-key",
      "test-secret",
    );
    const result = await provider.updateRecord("example.com", "A-missing", {
      ttl: 600,
    });

    expect(result).toEqual({
      ok: false,
      kind: "error",
      message: "Record not found",
    });
  });

  it("deleteRecord DELETEs by type and name and returns ok:true on an empty response", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(emptyResponse(204));
    vi.stubGlobal("fetch", fetchMock);

    const provider = new GoDaddyDnsProvider(
      "test-id",
      "Test GoDaddy",
      "test-key",
      "test-secret",
    );
    const result = await provider.deleteRecord("example.com", "CNAME-www");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.godaddy.com/v1/domains/example.com/records/CNAME/www",
      expect.objectContaining({ method: "DELETE" }),
    );
    expect(result).toEqual({ ok: true, data: undefined });
  });

  it("returns 'Authentication failed' on a 401 response", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse(401, {}));
    vi.stubGlobal("fetch", fetchMock);

    const provider = new GoDaddyDnsProvider(
      "test-id",
      "Test GoDaddy",
      "bad-key",
      "bad-secret",
    );
    const result = await provider.listDomains();

    expect(result).toEqual({
      ok: false,
      kind: "error",
      message: "Authentication failed",
    });
  });

  it("propagates a 'Provider error' after repeated 5xx failures", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(500, {}));
    vi.stubGlobal("fetch", fetchMock);

    const provider = new GoDaddyDnsProvider(
      "test-id",
      "Test GoDaddy",
      "test-key",
      "test-secret",
    );
    const promise = provider.listDomains();

    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(2000);
    const result = await promise;

    expect(result).toEqual({
      ok: false,
      kind: "error",
      message: "Provider error",
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    vi.useRealTimers();
  });
});
