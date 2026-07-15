import { afterEach, describe, expect, it, vi } from "vitest";
import { CloudflareDnsProvider } from "@/lib/providers/dns/cloudflare";

// Contract tests for the real Cloudflare DNS provider (architecture.md
// §4.1) — mocks globalThis.fetch with recorded Cloudflare API v4 response
// shapes so provider mapping and error handling are verified without
// network calls.

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("CloudflareDnsProvider", () => {
  it("sends the bearer token on every request", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(200, { success: true, errors: [], result: [] }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const provider = new CloudflareDnsProvider("test-id", "Test Cloudflare", "test-token");
    await provider.listDomains();

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.cloudflare.com/client/v4/zones",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer test-token",
        }),
      }),
    );
  });

  it("listDomains maps zones to Domain[]", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      jsonResponse(200, {
        success: true,
        errors: [],
        result: [
          { id: "zone-1", name: "example.com", status: "active" },
          { id: "zone-2", name: "example.dev", status: "active" },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const provider = new CloudflareDnsProvider("test-id", "Test Cloudflare", "test-token");
    const result = await provider.listDomains();

    expect(result).toEqual({
      ok: true,
      data: [
        { id: "zone-1", name: "example.com", provider: "cloudflare" },
        { id: "zone-2", name: "example.dev", provider: "cloudflare" },
      ],
    });
  });

  it("listRecords maps dns_records to DnsRecord[]", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      jsonResponse(200, {
        success: true,
        errors: [],
        result: [
          {
            id: "rec-1",
            type: "A",
            name: "example.com",
            content: "192.0.2.10",
            ttl: 3600,
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const provider = new CloudflareDnsProvider("test-id", "Test Cloudflare", "test-token");
    const result = await provider.listRecords("zone-1");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.cloudflare.com/client/v4/zones/zone-1/dns_records",
      expect.anything(),
    );
    expect(result).toEqual({
      ok: true,
      data: [
        {
          id: "rec-1",
          type: "A",
          name: "example.com",
          value: "192.0.2.10",
          ttl: 3600,
        },
      ],
    });
  });

  it("createRecord posts the mapped body and returns the created record", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      jsonResponse(200, {
        success: true,
        errors: [],
        result: {
          id: "rec-new",
          type: "A",
          name: "www",
          content: "192.0.2.20",
          ttl: 300,
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const provider = new CloudflareDnsProvider("test-id", "Test Cloudflare", "test-token");
    const result = await provider.createRecord("zone-1", {
      type: "A",
      name: "www",
      value: "192.0.2.20",
      ttl: 300,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.cloudflare.com/client/v4/zones/zone-1/dns_records",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          type: "A",
          name: "www",
          content: "192.0.2.20",
          ttl: 300,
        }),
      }),
    );
    expect(result).toEqual({
      ok: true,
      data: { id: "rec-new", type: "A", name: "www", value: "192.0.2.20", ttl: 300 },
    });
  });

  it("createRecord includes priority when provided", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      jsonResponse(200, {
        success: true,
        errors: [],
        result: {
          id: "rec-mx",
          type: "MX",
          name: "@",
          content: "mail.example.com",
          ttl: 300,
          priority: 10,
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const provider = new CloudflareDnsProvider("test-id", "Test Cloudflare", "test-token");
    await provider.createRecord("zone-1", {
      type: "MX",
      name: "@",
      value: "mail.example.com",
      ttl: 300,
      priority: 10,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        body: JSON.stringify({
          type: "MX",
          name: "@",
          content: "mail.example.com",
          ttl: 300,
          priority: 10,
        }),
      }),
    );
  });

  it("updateRecord patches only the provided fields", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      jsonResponse(200, {
        success: true,
        errors: [],
        result: {
          id: "rec-1",
          type: "A",
          name: "example.com",
          content: "192.0.2.99",
          ttl: 3600,
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const provider = new CloudflareDnsProvider("test-id", "Test Cloudflare", "test-token");
    const result = await provider.updateRecord("zone-1", "rec-1", {
      value: "192.0.2.99",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.cloudflare.com/client/v4/zones/zone-1/dns_records/rec-1",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ content: "192.0.2.99" }),
      }),
    );
    expect(result).toEqual({
      ok: true,
      data: {
        id: "rec-1",
        type: "A",
        name: "example.com",
        value: "192.0.2.99",
        ttl: 3600,
      },
    });
  });

  it("deleteRecord returns ok:true with no data on success", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      jsonResponse(200, {
        success: true,
        errors: [],
        result: { id: "rec-1" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const provider = new CloudflareDnsProvider("test-id", "Test Cloudflare", "test-token");
    const result = await provider.deleteRecord("zone-1", "rec-1");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.cloudflare.com/client/v4/zones/zone-1/dns_records/rec-1",
      expect.objectContaining({ method: "DELETE" }),
    );
    expect(result).toEqual({ ok: true, data: undefined });
  });

  it("returns 'Authentication failed' on a 401 response", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse(401, {}));
    vi.stubGlobal("fetch", fetchMock);

    const provider = new CloudflareDnsProvider("test-id", "Test Cloudflare", "bad-token");
    const result = await provider.listDomains();

    expect(result).toEqual({
      ok: false,
      kind: "error",
      message: "Authentication failed",
    });
  });

  it("maps a success:false envelope (200 status) to a ProviderResult error", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      jsonResponse(200, {
        success: false,
        errors: [{ code: 1003, message: "Invalid zone identifier" }],
        result: null,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const provider = new CloudflareDnsProvider("test-id", "Test Cloudflare", "test-token");
    const result = await provider.listRecords("bad-zone");

    expect(result).toEqual({
      ok: false,
      kind: "error",
      message: "Invalid zone identifier",
    });
  });

  it("propagates a 'Provider error' after repeated 5xx failures", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(500, {}));
    vi.stubGlobal("fetch", fetchMock);

    const provider = new CloudflareDnsProvider("test-id", "Test Cloudflare", "test-token");
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
