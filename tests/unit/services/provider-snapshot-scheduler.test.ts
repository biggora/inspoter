import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Scheduler tick for the provider listing cache. The due-scan and the refresh
// functions are mocked out, so this covers only what the scheduler itself
// owns: grouping due credentials per workspace, isolating a failing refresh,
// and skipping ticks that overlap.

const mocks = vi.hoisted(() => ({
  listDueCredentials: vi.fn(),
  refreshDnsSnapshots: vi.fn(),
  refreshHostingSnapshots: vi.fn(),
  refreshServerSnapshots: vi.fn(),
  logError: vi.fn(),
}));

vi.mock("@/lib/services/provider-snapshots", () => ({
  listDueCredentials: mocks.listDueCredentials,
}));
vi.mock("@/lib/services/domains", () => ({
  refreshDnsSnapshots: mocks.refreshDnsSnapshots,
}));
vi.mock("@/lib/services/hosting", () => ({
  refreshHostingSnapshots: mocks.refreshHostingSnapshots,
}));
vi.mock("@/lib/services/servers", () => ({
  refreshServerSnapshots: mocks.refreshServerSnapshots,
}));
vi.mock("@/lib/services/logs", () => ({ logError: mocks.logError }));
vi.mock("@/lib/config/env", () => ({
  env: { PROVIDER_SNAPSHOT_TICK_MS: 60_000 },
}));

async function runOneTick() {
  vi.useFakeTimers();
  const { startProviderSnapshotScheduler } =
    await import("@/lib/services/provider-snapshot-scheduler");
  startProviderSnapshotScheduler();
  await vi.advanceTimersByTimeAsync(60_000);
  vi.useRealTimers();
}

beforeEach(() => {
  vi.resetModules();
  // The scheduler is one-per-process, guarded on globalThis — clear the flag
  // so each test's fresh module instance can actually start.
  delete (
    globalThis as { __inspoterProviderSnapshotSchedulerStarted?: boolean }
  ).__inspoterProviderSnapshotSchedulerStarted;

  mocks.listDueCredentials.mockReset().mockResolvedValue([]);
  mocks.refreshDnsSnapshots.mockReset().mockResolvedValue(undefined);
  mocks.refreshHostingSnapshots.mockReset().mockResolvedValue(undefined);
  mocks.refreshServerSnapshots.mockReset().mockResolvedValue(undefined);
  mocks.logError.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("provider snapshot scheduler tick", () => {
  it("refreshes every section that has due credentials", async () => {
    mocks.listDueCredentials.mockImplementation(async (kind: string) => {
      if (kind === "DNS_ZONES")
        return [{ workspaceId: "w1", credentialId: "dns-1" }];
      if (kind === "HOSTING_ACCOUNTS")
        return [{ workspaceId: "w1", credentialId: "host-1" }];
      return [{ workspaceId: "w2", credentialId: "srv-1" }];
    });

    await runOneTick();

    expect(mocks.refreshDnsSnapshots).toHaveBeenCalledWith("w1", ["dns-1"]);
    expect(mocks.refreshHostingSnapshots).toHaveBeenCalledWith("w1", [
      "host-1",
    ]);
    expect(mocks.refreshServerSnapshots).toHaveBeenCalledWith("w2", ["srv-1"]);
  });

  it("groups a workspace's due credentials into one refresh call", async () => {
    mocks.listDueCredentials.mockImplementation(async (kind: string) =>
      kind === "DNS_ZONES"
        ? [
            { workspaceId: "w1", credentialId: "a" },
            { workspaceId: "w1", credentialId: "b" },
            { workspaceId: "w2", credentialId: "c" },
          ]
        : [],
    );

    await runOneTick();

    expect(mocks.refreshDnsSnapshots).toHaveBeenCalledTimes(2);
    expect(mocks.refreshDnsSnapshots).toHaveBeenCalledWith("w1", ["a", "b"]);
    expect(mocks.refreshDnsSnapshots).toHaveBeenCalledWith("w2", ["c"]);
  });

  it("does nothing when nothing is due", async () => {
    await runOneTick();

    expect(mocks.refreshDnsSnapshots).not.toHaveBeenCalled();
    expect(mocks.refreshHostingSnapshots).not.toHaveBeenCalled();
    expect(mocks.refreshServerSnapshots).not.toHaveBeenCalled();
  });

  it("keeps going when one workspace's refresh throws, and logs it", async () => {
    mocks.listDueCredentials.mockImplementation(async (kind: string) =>
      kind === "DNS_ZONES"
        ? [
            { workspaceId: "broken", credentialId: "a" },
            { workspaceId: "healthy", credentialId: "b" },
          ]
        : [],
    );
    mocks.refreshDnsSnapshots.mockImplementation(async (ws: string) => {
      if (ws === "broken") throw new Error("connection reset");
    });

    await runOneTick();

    expect(mocks.refreshDnsSnapshots).toHaveBeenCalledWith("healthy", ["b"]);
    // A broken workspace must not stop the other sections either.
    expect(mocks.refreshServerSnapshots).toHaveBeenCalledTimes(0);
    expect(mocks.listDueCredentials).toHaveBeenCalledTimes(3);
    expect(mocks.logError).toHaveBeenCalledWith(
      "broken",
      "scheduler:provider-snapshot",
      expect.stringContaining("connection reset"),
      expect.stringContaining("DNS_ZONES"),
    );
  });

  it("skips a tick while the previous one is still running", async () => {
    let releaseFirst!: () => void;
    const firstRun = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    mocks.listDueCredentials.mockImplementation(async (kind: string) => {
      if (kind !== "DNS_ZONES") return [];
      await firstRun;
      return [{ workspaceId: "w1", credentialId: "a" }];
    });

    vi.useFakeTimers();
    const { startProviderSnapshotScheduler } =
      await import("@/lib/services/provider-snapshot-scheduler");
    startProviderSnapshotScheduler();

    await vi.advanceTimersByTimeAsync(60_000);
    await vi.advanceTimersByTimeAsync(60_000);
    releaseFirst();
    await vi.advanceTimersByTimeAsync(0);
    vi.useRealTimers();

    // Two intervals fired, but the second returned immediately instead of
    // stacking a concurrent fan-out on top of the first.
    expect(mocks.refreshDnsSnapshots).toHaveBeenCalledTimes(1);
  });
});
