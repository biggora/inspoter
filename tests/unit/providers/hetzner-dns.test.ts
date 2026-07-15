import { afterEach, describe, expect, it, vi } from "vitest";
import { HetznerDnsProvider } from "@/lib/providers/dns/hetzner";

// Contract tests for the real Hetzner DNS provider (architecture.md §4.1) —
// mocks globalThis.fetch with recorded Hetzner DNS API v1 response shapes so
// provider mapping and error handling are verified without network calls.

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function emptyResponse(status: number): Response {
  return new Response("", { status });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("HetznerDnsProvider", () => {
  it("sends the Auth-API-Token header on every request", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, { zones: [] }));
    vi.stubGlobal("fetch", fetchMock);

    const provider = new HetznerDnsProvider("test-token");
    await provider.listDomains();

    expect(fetchMock).toHaveBeenCalledWith(
      "https://dns.hetzner.com/api/v1/zones",
      expect.objectContaining({
        headers: expect.objectContaining({
          "Auth-API-Token": "test-token",
        }),
      }),
    );
  });

  it("listDomains maps zones to Domain[]", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      jsonResponse(200, {
        zones: [
          { id: "zone-1", name: "example.com" },
          { id: "zone-2", name: "example.dev" },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const provider = new HetznerDnsProvider("test-token");
    const result = await provider.listDomains();

    expect(result).toEqual({
      ok: true,
      data: [
        { id: "zone-1", name: "example.com", provider: "hetzner" },
        { id: "zone-2", name: "example.dev", provider: "hetzner" },
      ],
    });
  });

  it("listRecords maps records to DnsRecord[]", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      jsonResponse(200, {
        records: [
          {
            id: "rec-1",
            type: "A",
            name: "example.com",
            value: "192.0.2.10",
            ttl: 3600,
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const provider = new HetznerDnsProvider("test-token");
    const result = await provider.listRecords("zone-1");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://dns.hetzner.com/api/v1/records?zone_id=zone-1",
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
        record: {
          id: "rec-new",
          type: "A",
          name: "www",
          value: "192.0.2.20",
          ttl: 300,
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const provider = new HetznerDnsProvider("test-token");
    const result = await provider.createRecord("zone-1", {
      type: "A",
      name: "www",
      value: "192.0.2.20",
      ttl: 300,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://dns.hetzner.com/api/v1/records",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          zone_id: "zone-1",
          type: "A",
          name: "www",
          value: "192.0.2.20",
          ttl: 300,
        }),
      }),
    );
    expect(result).toEqual({
      ok: true,
      data: { id: "rec-new", type: "A", name: "www", value: "192.0.2.20", ttl: 300 },
    });
  });

  it("updateRecord reads the existing record then PUTs the merged full record", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(200, {
          record: {
            id: "rec-1",
            type: "A",
            name: "example.com",
            value: "192.0.2.10",
            ttl: 3600,
          },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse(200, {
          record: {
            id: "rec-1",
            type: "A",
            name: "example.com",
            value: "192.0.2.99",
            ttl: 3600,
          },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const provider = new HetznerDnsProvider("test-token");
    const result = await provider.updateRecord("zone-1", "rec-1", {
      value: "192.0.2.99",
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://dns.hetzner.com/api/v1/records/rec-1",
      expect.anything(),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://dns.hetzner.com/api/v1/records/rec-1",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({
          zone_id: "zone-1",
          type: "A",
          name: "example.com",
          value: "192.0.2.99",
          ttl: 3600,
        }),
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

  it("updateRecord returns the read failure without issuing the PUT", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse(401, {}));
    vi.stubGlobal("fetch", fetchMock);

    const provider = new HetznerDnsProvider("bad-token");
    const result = await provider.updateRecord("zone-1", "rec-1", {
      value: "192.0.2.99",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      ok: false,
      kind: "error",
      message: "Authentication failed",
    });
  });

  it("deleteRecord treats an empty 200 response body as success", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(emptyResponse(200));
    vi.stubGlobal("fetch", fetchMock);

    const provider = new HetznerDnsProvider("test-token");
    const result = await provider.deleteRecord("zone-1", "rec-1");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://dns.hetzner.com/api/v1/records/rec-1",
      expect.objectContaining({ method: "DELETE" }),
    );
    expect(result).toEqual({ ok: true, data: undefined });
  });

  it("deleteRecord returns 'Authentication failed' on a 401 response", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse(401, {}));
    vi.stubGlobal("fetch", fetchMock);

    const provider = new HetznerDnsProvider("bad-token");
    const result = await provider.deleteRecord("zone-1", "rec-1");

    expect(result).toEqual({
      ok: false,
      kind: "error",
      message: "Authentication failed",
    });
  });

  it("returns 'Authentication failed' on a 401 response", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse(401, {}));
    vi.stubGlobal("fetch", fetchMock);

    const provider = new HetznerDnsProvider("bad-token");
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

    const provider = new HetznerDnsProvider("test-token");
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
