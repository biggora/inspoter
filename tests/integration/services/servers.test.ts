import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import * as serversService from "@/lib/services/servers";
import * as credentialsService from "@/lib/services/credentials";
import { MockServerProvider } from "@/lib/providers/servers/mock";
import type { Server, ServerProvider } from "@/lib/providers/servers/types";
import type { ProviderResult } from "@/lib/providers/result";

// Servers service (architecture.md §4.4, AC-SRV-*) — Slice 2 composes
// provider inventory with LocalServer reconciliation and VPS Metrics Agent
// state, so (unlike Slice 0/1) these are DB-integration tests: a real
// ProviderCredential row backs the mocked provider's id since LocalServer's
// providerCredentialId FK requires one, and reconciliation writes real
// LocalServer/ServerMetricSnapshot rows. Metrics state is a 3-state
// snapshot-only signal (not_configured/live/stale) — universal WebhookToken
// auth (see serverMetrics.test.ts) replaced the old bound-agent-token
// waiting/revoked states.
process.env.CREDENTIAL_ENCRYPTION_KEY ??=
  "7d65bff94a983c4052b8fce4bbc9ed8a50c4c014fca6c22121a2662d9e9a2bea";

const mockState = vi.hoisted(() => ({
  providers: [] as unknown[],
}));

vi.mock("@/lib/providers/servers", () => ({
  getServerProvidersForWorkspace: async () => mockState.providers,
}));

class FailingServerProvider implements ServerProvider {
  readonly providerType = "hetzner";
  readonly label = "Failing Provider";
  readonly mode = "mock" as const;

  // The id has to be a real ProviderCredential row: the listing is cached in
  // ProviderSnapshot, whose composite FK points at one.
  constructor(readonly id: string) {}

  async listServers(): Promise<ProviderResult<never[]>> {
    return { ok: false, kind: "error", message: "boom" };
  }
  async getServer(): Promise<ProviderResult<never>> {
    return { ok: false, kind: "error", message: "boom" };
  }
  async power(): Promise<ProviderResult<void>> {
    return { ok: false, kind: "error", message: "boom" };
  }
}

// Two credentials can legitimately see the same machine (different tokens,
// same VM), which is what makes the listing collapse rows by address.
class MirrorServerProvider implements ServerProvider {
  readonly providerType = "hetzner";
  readonly label = "Mirror Provider";
  readonly mode = "mock" as const;

  constructor(
    readonly id: string,
    private readonly server: Server,
  ) {}

  async listServers(): Promise<ProviderResult<Server[]>> {
    return { ok: true, data: [this.server] };
  }
  async getServer(): Promise<ProviderResult<Server>> {
    return { ok: true, data: this.server };
  }
  async power(): Promise<ProviderResult<void>> {
    return { ok: true, data: undefined };
  }
}

function expectProviderDto(
  dto: serversService.ComposedServerDto | null,
): asserts dto is serversService.ProviderServerDto {
  if (!dto || dto.origin !== "provider") {
    throw new Error("expected a provider-origin composed server DTO");
  }
}

const WORKSPACE_NAME_PREFIX = `servers-${randomUUID()}`;
let workspaceId: string;
let mockCredentialId: string;
let mockProvider: MockServerProvider;

beforeAll(async () => {
  const workspace = await db.workspace.create({
    data: {
      name: "Test Workspace",
      slug: `test-${WORKSPACE_NAME_PREFIX}`,
      updatedAt: new Date(),
    },
  });
  workspaceId = workspace.id;

  const credential = await credentialsService.createCredential(
    workspaceId,
    "HETZNER_CLOUD",
    `${WORKSPACE_NAME_PREFIX}-hetzner`,
    { type: "HETZNER_CLOUD", apiToken: "mock-token" },
  );
  mockCredentialId = credential.id;
  mockProvider = new MockServerProvider(
    mockCredentialId,
    "hetzner",
    "Hetzner Cloud Mock",
  );
  mockState.providers = [mockProvider];
});

afterAll(async () => {
  if (workspaceId) {
    await db.workspace.delete({ where: { id: workspaceId } }).catch(() => {});
  }
});

describe("listServers()", () => {
  it("AC-SRV-002: reconciles provider inventory into present provider-origin DTOs", async () => {
    const result = await serversService.listServers(workspaceId);
    expect(result.providerErrors).toEqual([]);
    expect(result.servers).toHaveLength(6);

    const byRemoteId = new Map(
      result.servers
        .filter((s) => s.origin === "provider")
        .map((s) => [s.remoteServerId, s]),
    );

    expect(byRemoteId.get("srv-01")).toMatchObject({
      providerCredentialId: mockCredentialId,
      providerId: mockCredentialId,
      providerAvailability: "present",
      powerActionsAvailable: true,
      name: "web-prod-01",
      status: "running",
    });
    expect(byRemoteId.get("srv-01")?.metrics).toMatchObject({
      state: "not_configured",
      receivedAt: null,
    });
    expect(byRemoteId.get("srv-04")).toMatchObject({
      name: "db-replica",
      status: "stopped",
    });
  });

  it("reuses the same localServerId for a server already reconciled", async () => {
    const first = await serversService.listServers(workspaceId);
    const second = await serversService.listServers(workspaceId);

    const firstId = first.servers.find(
      (s) => s.origin === "provider" && s.remoteServerId === "srv-02",
    )?.localServerId;
    const secondId = second.servers.find(
      (s) => s.origin === "provider" && s.remoteServerId === "srv-02",
    )?.localServerId;

    expect(firstId).toBeTruthy();
    expect(secondId).toBe(firstId);
  });

  it("isolates a failing provider's error without dropping the working provider", async () => {
    const failingCredential = await credentialsService.createCredential(
      workspaceId,
      "HETZNER_CLOUD",
      `${WORKSPACE_NAME_PREFIX}-hetzner-failing`,
      { type: "HETZNER_CLOUD", apiToken: "mock-token-failing" },
    );
    const failing = new FailingServerProvider(failingCredential.id);
    mockState.providers = [mockProvider, failing];
    try {
      const result = await serversService.listServers(workspaceId);
      expect(result.providerErrors).toEqual([
        { providerId: failing.id, label: failing.label, error: "boom" },
      ]);
      expect(
        result.servers.some(
          (s) =>
            s.origin === "provider" && s.providerAvailability === "present",
        ),
      ).toBe(true);
    } finally {
      mockState.providers = [mockProvider];
      await db.providerCredential
        .delete({ where: { id: failingCredential.id } })
        .catch(() => {});
    }
  });

  it("marks a LocalServer the provider no longer reports as missing, without deleting it", async () => {
    await serversService.refreshServerSnapshots(workspaceId);

    const orphan = await db.localServer.create({
      data: {
        workspaceId,
        origin: "PROVIDER",
        displayName: "ghost-server",
        providerCredentialId: mockCredentialId,
        providerCredentialWorkspaceId: workspaceId,
        providerRemoteId: "srv-ghost",
        providerLastSeenAt: new Date(),
      },
    });

    // Reconciliation runs on the refresh path, not the read path — the cached
    // listing is what a page visit sees, and replaying it would only rewrite
    // the same rows.
    await serversService.refreshServerSnapshots(workspaceId);

    const result = await serversService.listServers(workspaceId);
    const composed = result.servers.find((s) => s.localServerId === orphan.id);
    expect(composed).toMatchObject({
      origin: "provider",
      providerAvailability: "missing",
      powerActionsAvailable: false,
    });

    const refreshed = await db.localServer.findUniqueOrThrow({
      where: { id: orphan.id },
    });
    expect(refreshed.providerMissingAt).not.toBeNull();
  });

  it("shows one entry per machine when two credentials expose the same server", async () => {
    const mirrorCredential = await credentialsService.createCredential(
      workspaceId,
      "HETZNER_CLOUD",
      `${WORKSPACE_NAME_PREFIX}-hetzner-mirror`,
      { type: "HETZNER_CLOUD", apiToken: "mock-token-mirror" },
    );
    // Same address as srv-01, different remote id: identity is the machine,
    // not the provider's numbering.
    const mirror = new MirrorServerProvider(mirrorCredential.id, {
      id: "mirror-01",
      name: "web-prod-01",
      type: "cx41 · 4vCPU / 16GB",
      status: "running",
      cpu: "4 vCPU (AMD EPYC)",
      ram: "16 GB",
      disk: "160 GB NVMe",
      ip: "49.12.34.56",
      location: "Nuremberg, DE",
      os: "Ubuntu 24.04 LTS",
    });
    mockState.providers = [mockProvider, mirror];

    try {
      const result = await serversService.listServers(workspaceId);
      const sharedAddress = result.servers.filter(
        (s) => s.origin === "provider" && s.ip === "49.12.34.56",
      );
      expect(sharedAddress).toHaveLength(1);
      // Collapsing is a listing concern: both bindings stay in the database.
      const rows = await db.localServer.findMany({
        where: {
          workspaceId,
          providerRemoteId: { in: ["srv-01", "mirror-01"] },
        },
      });
      expect(rows).toHaveLength(2);

      // The row an agent reports through must survive the collapse, whichever
      // credential reconciled it first.
      const mirrorRow = rows.find((r) => r.providerRemoteId === "mirror-01")!;
      await db.serverMetricSnapshot.create({
        data: {
          localServerId: mirrorRow.id,
          workspaceId,
          schemaVersion: 1,
          agentVersion: "1.0.0",
          hostname: "web-prod-01",
          capturedAt: new Date(),
          receivedAt: new Date(),
          cpuUsagePercent: 21.1,
          load1: 0.1,
          load5: 0.2,
          load15: 0.3,
          memoryTotalBytes: 1000n,
          memoryAvailableBytes: 500n,
          swapTotalBytes: 0n,
          swapFreeBytes: 0n,
          filesystemTotalBytes: 2000n,
          filesystemAvailableBytes: 1000n,
          uptimeSeconds: 3600n,
        },
      });

      const withMetrics = await serversService.listServers(workspaceId);
      const kept = withMetrics.servers.filter(
        (s) => s.origin === "provider" && s.ip === "49.12.34.56",
      );
      expect(kept).toHaveLength(1);
      expect(kept[0].localServerId).toBe(mirrorRow.id);
      expect(kept[0].metrics.state).toBe("live");
    } finally {
      mockState.providers = [mockProvider];
      // Drop the snapshot first: deleteCredential detaches a row that still has
      // one into an agent-only server instead of removing it.
      await db.serverMetricSnapshot.deleteMany({
        where: { localServer: { providerCredentialId: mirrorCredential.id } },
      });
      await credentialsService.deleteCredential(
        mirrorCredential.id,
        workspaceId,
      );
    }
  });
});

describe("listLocalServerMetrics()", () => {
  it("shows one entry per machine when two credentials expose the same server", async () => {
    const mirrorCredential = await credentialsService.createCredential(
      workspaceId,
      "HETZNER_CLOUD",
      `${WORKSPACE_NAME_PREFIX}-hetzner-metrics-mirror`,
      { type: "HETZNER_CLOUD", apiToken: "mock-token-metrics-mirror" },
    );
    // Same address as srv-01, different remote id — mirrors the listServers()
    // scenario above, but exercised through the dashboard widget's read path.
    const mirror = new MirrorServerProvider(mirrorCredential.id, {
      id: "mirror-metrics-01",
      name: "web-prod-01",
      type: "cx41 · 4vCPU / 16GB",
      status: "running",
      cpu: "4 vCPU (AMD EPYC)",
      ram: "16 GB",
      disk: "160 GB NVMe",
      ip: "49.12.34.56",
      location: "Nuremberg, DE",
      os: "Ubuntu 24.04 LTS",
    });
    mockState.providers = [mockProvider, mirror];

    try {
      // Reconciles both credentials' LocalServer rows and populates the
      // ProviderSnapshot cache that the dedup reads from.
      await serversService.listServers(workspaceId);

      const rows = await db.localServer.findMany({
        where: {
          workspaceId,
          providerRemoteId: { in: ["srv-01", "mirror-metrics-01"] },
        },
      });
      expect(rows).toHaveLength(2);

      const metrics =
        await serversService.listLocalServerMetrics(workspaceId);
      const matches = metrics.filter((m) =>
        rows.some((r) => r.id === m.localServerId),
      );
      expect(matches).toHaveLength(1);
    } finally {
      mockState.providers = [mockProvider];
      await credentialsService.deleteCredential(
        mirrorCredential.id,
        workspaceId,
      );
    }
  });
});

describe("getComposedServer()", () => {
  it("returns null when no LocalServer row matches the provider/remote id", async () => {
    const result = await serversService.getComposedServer(
      workspaceId,
      mockCredentialId,
      "does-not-exist",
    );
    expect(result).toBeNull();
  });

  it("AC-SRV-001: returns a composed DTO merged with live provider data", async () => {
    await serversService.listServers(workspaceId);
    const result = await serversService.getComposedServer(
      workspaceId,
      mockCredentialId,
      "srv-03",
    );
    expectProviderDto(result);
    expect(result).toMatchObject({
      remoteServerId: "srv-03",
      name: "db-primary",
      status: "running",
      providerAvailability: "present",
      powerActionsAvailable: true,
    });
  });
});

describe("metrics state composition", () => {
  it("reports not_configured when no snapshot exists", async () => {
    const result = await serversService.getComposedServer(
      workspaceId,
      mockCredentialId,
      "srv-05",
    );
    expect(result?.metrics.state).toBe("not_configured");
  });

  it("reports live for a fresh snapshot and stale past the 180s threshold", async () => {
    const composed = await serversService.getComposedServer(
      workspaceId,
      mockCredentialId,
      "srv-05",
    );
    expectProviderDto(composed);
    const localServerId = composed.localServerId;

    await db.serverMetricSnapshot.create({
      data: {
        localServerId,
        workspaceId,
        schemaVersion: 1,
        agentVersion: "1.0.0",
        hostname: "srv-05",
        capturedAt: new Date(),
        receivedAt: new Date(),
        cpuUsagePercent: 12.5,
        load1: 0.1,
        load5: 0.2,
        load15: 0.3,
        memoryTotalBytes: 1000n,
        memoryAvailableBytes: 500n,
        swapTotalBytes: 0n,
        swapFreeBytes: 0n,
        filesystemTotalBytes: 2000n,
        filesystemAvailableBytes: 1000n,
        uptimeSeconds: 3600n,
      },
    });

    const live = await serversService.getComposedServer(
      workspaceId,
      mockCredentialId,
      "srv-05",
    );
    expect(live?.metrics.state).toBe("live");
    expect(live?.metrics.memoryTotalBytes).toBe("1000");
    expect(live?.metrics.uptimeSeconds).toBe("3600");

    await db.serverMetricSnapshot.update({
      where: { localServerId },
      data: { receivedAt: new Date(Date.now() - 200_000) },
    });

    const stale = await serversService.getComposedServer(
      workspaceId,
      mockCredentialId,
      "srv-05",
    );
    expect(stale?.metrics.state).toBe("stale");
  });
});

describe("power()", () => {
  it("AC-SRV-004: start transitions a stopped server to running within the 30s poll window", async () => {
    const now = Date.now();
    vi.useFakeTimers();
    vi.setSystemTime(now);
    try {
      await serversService.listServers(workspaceId);

      const result = await serversService.power(
        workspaceId,
        mockCredentialId,
        "srv-04",
        "start",
      );
      expect(result).toEqual({ ok: true, data: undefined });

      const immediate = await serversService.getComposedServer(
        workspaceId,
        mockCredentialId,
        "srv-04",
      );
      expectProviderDto(immediate);
      expect(immediate.status).toBe("starting");

      vi.setSystemTime(now + 2000);
      const after = await serversService.getComposedServer(
        workspaceId,
        mockCredentialId,
        "srv-04",
      );
      expectProviderDto(after);
      expect(after.status).toBe("running");
    } finally {
      vi.useRealTimers();
    }
  });

  it("AC-SRV-005: stop transitions a running server to stopped within the 30s poll window", async () => {
    const now = Date.now();
    vi.useFakeTimers();
    vi.setSystemTime(now);
    try {
      await serversService.listServers(workspaceId);

      const result = await serversService.power(
        workspaceId,
        mockCredentialId,
        "srv-01",
        "stop",
      );
      expect(result).toEqual({ ok: true, data: undefined });

      const immediate = await serversService.getComposedServer(
        workspaceId,
        mockCredentialId,
        "srv-01",
      );
      expectProviderDto(immediate);
      expect(immediate.status).toBe("stopping");

      vi.setSystemTime(now + 2000);
      const after = await serversService.getComposedServer(
        workspaceId,
        mockCredentialId,
        "srv-01",
      );
      expectProviderDto(after);
      expect(after.status).toBe("stopped");
    } finally {
      vi.useRealTimers();
    }
  });

  it("AC-SRV-006: restart transitions a running server back to running within the 60s poll window", async () => {
    const now = Date.now();
    vi.useFakeTimers();
    vi.setSystemTime(now);
    try {
      await serversService.listServers(workspaceId);

      const result = await serversService.power(
        workspaceId,
        mockCredentialId,
        "srv-02",
        "restart",
      );
      expect(result).toEqual({ ok: true, data: undefined });

      const immediate = await serversService.getComposedServer(
        workspaceId,
        mockCredentialId,
        "srv-02",
      );
      expectProviderDto(immediate);
      expect(immediate.status).toBe("restarting");

      vi.setSystemTime(now + 4000);
      const after = await serversService.getComposedServer(
        workspaceId,
        mockCredentialId,
        "srv-02",
      );
      expectProviderDto(after);
      expect(after.status).toBe("running");
    } finally {
      vi.useRealTimers();
    }
  });

  it("returns 'Server not found' for an unknown id and performs no state transition", async () => {
    const result = await serversService.power(
      workspaceId,
      mockCredentialId,
      "does-not-exist",
      "start",
    );
    expect(result).toEqual({
      ok: false,
      kind: "error",
      message: "Server not found",
    });
  });

  it("returns an error for an unknown providerId", async () => {
    const result = await serversService.power(
      workspaceId,
      "unknown-provider",
      "srv-01",
      "start",
    );
    expect(result).toEqual({
      ok: false,
      kind: "error",
      message: "Unknown server provider: unknown-provider",
    });
  });
});
