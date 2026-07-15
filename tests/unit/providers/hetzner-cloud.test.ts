import { afterEach, describe, expect, it, vi } from "vitest";
import { HetznerServerProvider } from "@/lib/providers/servers/hetzner";

// Contract tests for the real Hetzner Cloud server provider (architecture.md
// §4.1) — mocks globalThis.fetch with recorded Hetzner Cloud API v1 response
// shapes so provider mapping and error handling are verified without
// network calls.

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const rawServer = {
  id: 12345,
  name: "web-prod-01",
  server_type: {
    cores: 2,
    memory: 4,
    disk: 40,
    description: "CX22",
  },
  status: "running",
  public_net: { ipv4: { ip: "49.12.34.56" } },
  datacenter: { name: "nbg1-dc3" },
  image: { description: "Ubuntu 24.04" },
};

const mappedServer = {
  id: "12345",
  name: "web-prod-01",
  type: "CX22",
  status: "running",
  ip: "49.12.34.56",
  cpu: "2 vCPU",
  ram: "4 GB",
  disk: "40 GB",
  os: "Ubuntu 24.04",
  location: "nbg1-dc3",
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("HetznerServerProvider", () => {
  it("sends the bearer token on every request", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, { servers: [] }));
    vi.stubGlobal("fetch", fetchMock);

    const provider = new HetznerServerProvider("test-token");
    await provider.listServers();

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.hetzner.cloud/v1/servers",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer test-token",
        }),
      }),
    );
  });

  it("listServers maps servers to Server[]", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, { servers: [rawServer] }));
    vi.stubGlobal("fetch", fetchMock);

    const provider = new HetznerServerProvider("test-token");
    const result = await provider.listServers();

    expect(result).toEqual({ ok: true, data: [mappedServer] });
  });

  it("getServer maps a single server", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, { server: rawServer }));
    vi.stubGlobal("fetch", fetchMock);

    const provider = new HetznerServerProvider("test-token");
    const result = await provider.getServer("12345");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.hetzner.cloud/v1/servers/12345",
      expect.anything(),
    );
    expect(result).toEqual({ ok: true, data: mappedServer });
  });

  it("maps unknown Hetzner statuses to 'unknown'", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      jsonResponse(200, {
        server: { ...rawServer, status: "rebuilding" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const provider = new HetznerServerProvider("test-token");
    const result = await provider.getServer("12345");

    expect(result).toEqual({
      ok: true,
      data: { ...mappedServer, status: "unknown" },
    });
  });

  it("falls back to an empty ip and 'Unknown' os when absent", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      jsonResponse(200, {
        server: { ...rawServer, public_net: { ipv4: null }, image: null },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const provider = new HetznerServerProvider("test-token");
    const result = await provider.getServer("12345");

    expect(result).toEqual({
      ok: true,
      data: { ...mappedServer, ip: "", os: "Unknown" },
    });
  });

  it("power('start') calls the poweron action endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      jsonResponse(200, { action: { id: 1, status: "running" } }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const provider = new HetznerServerProvider("test-token");
    const result = await provider.power("12345", "start");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.hetzner.cloud/v1/servers/12345/actions/poweron",
      expect.objectContaining({ method: "POST" }),
    );
    expect(result).toEqual({ ok: true, data: undefined });
  });

  it("power('stop') calls the poweroff action endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      jsonResponse(200, { action: { id: 2, status: "off" } }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const provider = new HetznerServerProvider("test-token");
    await provider.power("12345", "stop");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.hetzner.cloud/v1/servers/12345/actions/poweroff",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("power('restart') calls the reboot action endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      jsonResponse(200, { action: { id: 3, status: "running" } }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const provider = new HetznerServerProvider("test-token");
    await provider.power("12345", "restart");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.hetzner.cloud/v1/servers/12345/actions/reboot",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("returns 'Authentication failed' on a 401 response", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse(401, {}));
    vi.stubGlobal("fetch", fetchMock);

    const provider = new HetznerServerProvider("bad-token");
    const result = await provider.listServers();

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

    const provider = new HetznerServerProvider("test-token");
    const promise = provider.listServers();

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
