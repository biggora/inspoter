import { afterEach, describe, expect, it, vi } from "vitest";
import * as serversService from "@/lib/services/servers";

// Servers service (architecture.md §4.4, AC-SRV-*) — mock Hetzner provider
// uses module-global in-memory state and time-based status transitions, no
// database involved. No credentials are configured for this workspace, so
// the factory falls back to the single mock provider ("mock-hetzner-cloud").

const WORKSPACE_ID = "test-workspace";
const PROVIDER_ID = "mock-hetzner-cloud";

describe("listServers()", () => {
  it("AC-SRV-002: returns deterministic mock servers with name, type, and status", async () => {
    const result = await serversService.listServers(WORKSPACE_ID);
    expect(result).toHaveLength(1);

    const [provider] = result;
    expect(provider.providerId).toBe(PROVIDER_ID);
    expect(provider.error).toBeNull();

    expect(provider.servers.map((s) => s.id)).toEqual([
      "srv-01",
      "srv-02",
      "srv-03",
      "srv-04",
      "srv-05",
      "srv-06",
    ]);

    const byId = Object.fromEntries(provider.servers.map((s) => [s.id, s]));
    expect(byId["srv-01"]).toMatchObject({
      name: "web-prod-01",
      status: "running",
    });
    expect(byId["srv-04"]).toMatchObject({
      name: "db-replica",
      status: "stopped",
    });
    expect(byId["srv-06"]).toMatchObject({
      name: "dev-staging",
      status: "stopped",
    });
  });
});

describe("getServer()", () => {
  it("AC-SRV-001: returns a single server by id", async () => {
    const result = await serversService.getServer(
      WORKSPACE_ID,
      PROVIDER_ID,
      "srv-03",
    );
    if (!result.ok) throw new Error("expected ok result");

    expect(result.data).toMatchObject({
      id: "srv-03",
      name: "db-primary",
      status: "running",
    });
  });

  it("returns 'Server not found' for an unknown id", async () => {
    const result = await serversService.getServer(
      WORKSPACE_ID,
      PROVIDER_ID,
      "does-not-exist",
    );
    expect(result).toEqual({
      ok: false,
      kind: "error",
      message: "Server not found",
    });
  });

  it("returns an error for an unknown providerId", async () => {
    const result = await serversService.getServer(
      WORKSPACE_ID,
      "unknown-provider",
      "srv-01",
    );
    expect(result).toEqual({
      ok: false,
      kind: "error",
      message: "Unknown server provider: unknown-provider",
    });
  });
});

describe("power()", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("AC-SRV-004: start transitions a stopped server to running within the 30s poll window", async () => {
    const now = Date.now();
    vi.useFakeTimers();
    vi.setSystemTime(now);

    const result = await serversService.power(
      WORKSPACE_ID,
      PROVIDER_ID,
      "srv-04",
      "start",
    );
    expect(result).toEqual({ ok: true, data: undefined });

    const immediate = await serversService.getServer(
      WORKSPACE_ID,
      PROVIDER_ID,
      "srv-04",
    );
    if (!immediate.ok) throw new Error("expected ok result");
    expect(immediate.data.status).toBe("starting");

    vi.setSystemTime(now + 2000);
    const after = await serversService.getServer(
      WORKSPACE_ID,
      PROVIDER_ID,
      "srv-04",
    );
    if (!after.ok) throw new Error("expected ok result");
    expect(after.data.status).toBe("running");
  });

  it("AC-SRV-005: stop transitions a running server to stopped within the 30s poll window", async () => {
    const now = Date.now();
    vi.useFakeTimers();
    vi.setSystemTime(now);

    const result = await serversService.power(
      WORKSPACE_ID,
      PROVIDER_ID,
      "srv-01",
      "stop",
    );
    expect(result).toEqual({ ok: true, data: undefined });

    const immediate = await serversService.getServer(
      WORKSPACE_ID,
      PROVIDER_ID,
      "srv-01",
    );
    if (!immediate.ok) throw new Error("expected ok result");
    expect(immediate.data.status).toBe("stopping");

    vi.setSystemTime(now + 2000);
    const after = await serversService.getServer(
      WORKSPACE_ID,
      PROVIDER_ID,
      "srv-01",
    );
    if (!after.ok) throw new Error("expected ok result");
    expect(after.data.status).toBe("stopped");
  });

  it("AC-SRV-006: restart transitions a running server back to running within the 60s poll window", async () => {
    const now = Date.now();
    vi.useFakeTimers();
    vi.setSystemTime(now);

    const result = await serversService.power(
      WORKSPACE_ID,
      PROVIDER_ID,
      "srv-02",
      "restart",
    );
    expect(result).toEqual({ ok: true, data: undefined });

    const immediate = await serversService.getServer(
      WORKSPACE_ID,
      PROVIDER_ID,
      "srv-02",
    );
    if (!immediate.ok) throw new Error("expected ok result");
    expect(immediate.data.status).toBe("restarting");

    vi.setSystemTime(now + 4000);
    const after = await serversService.getServer(
      WORKSPACE_ID,
      PROVIDER_ID,
      "srv-02",
    );
    if (!after.ok) throw new Error("expected ok result");
    expect(after.data.status).toBe("running");
  });

  it("returns 'Server not found' for an unknown id and performs no state transition", async () => {
    const result = await serversService.power(
      WORKSPACE_ID,
      PROVIDER_ID,
      "does-not-exist",
      "start",
    );
    expect(result).toEqual({
      ok: false,
      kind: "error",
      message: "Server not found",
    });
  });
});
