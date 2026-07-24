import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import * as webhookTokensService from "@/lib/services/webhookTokens";
import * as serverMetricsService from "@/lib/services/serverMetrics";
import { validateMetricsPayload } from "@/lib/validation/server-metrics";
import type { ParsedMetricsPayload } from "@/lib/validation/server-metrics";

// Metrics ingestion service (universal WebhookToken auth + claim-based
// server resolution, replacing the retired bound ServerAgentToken design).
// DB-integration tests mirroring servers.test.ts's setup style. No
// ProviderCredential rows are created for workspaceId here, so
// getServerProvidersForWorkspace() naturally returns [] and the
// matchOrEnroll() provider-discovery branch always resolves to
// "agent_only" -- exercising a live provider match would require network
// access and is out of scope.
process.env.CREDENTIAL_ENCRYPTION_KEY ??=
  "7d65bff94a983c4052b8fce4bbc9ed8a50c4c014fca6c22121a2662d9e9a2bea";

const NAME_PREFIX = `sm-${randomUUID()}`;
let workspaceId: string;

function buildRawPayload(overrides: {
  hostname?: string;
  ips?: string[];
  capturedAt?: string;
  cpuUsagePercent?: number;
}): unknown {
  return {
    schemaVersion: 1,
    agentVersion: "1.0.0",
    capturedAt: overrides.capturedAt ?? new Date().toISOString(),
    hostname: overrides.hostname ?? "test-host",
    ips: overrides.ips ?? ["8.8.8.8"],
    cpu: {
      usagePercent: overrides.cpuUsagePercent ?? 12.5,
      load1: 0.1,
      load5: 0.2,
      load15: 0.3,
    },
    memory: {
      totalBytes: 1000,
      availableBytes: 500,
      swapTotalBytes: 0,
      swapFreeBytes: 0,
    },
    filesystem: { mount: "/", totalBytes: 2000, availableBytes: 1000 },
    uptimeSeconds: 3600,
  };
}

function parsePayload(overrides: Parameters<typeof buildRawPayload>[0] = {}): ParsedMetricsPayload {
  const result = validateMetricsPayload(buildRawPayload(overrides));
  if (!result.success) {
    throw new Error(`invalid test payload: ${result.error.message}`);
  }
  return result.data;
}

beforeAll(async () => {
  const workspace = await db.workspace.create({
    data: {
      name: "Test Workspace",
      slug: `test-${NAME_PREFIX}`,
      updatedAt: new Date(),
    },
  });
  workspaceId = workspace.id;
});

afterAll(async () => {
  if (workspaceId) {
    await db.workspace.delete({ where: { id: workspaceId } }).catch(() => {});
  }
});

describe("authenticateMetricsToken()", () => {
  it("accepts a valid universal (channelId: null) workspace token", async () => {
    const created = await webhookTokensService.create(
      workspaceId,
      `${NAME_PREFIX}-auth-ok`,
    );

    const context = await serverMetricsService.authenticateMetricsToken(
      created.token,
    );
    expect(context).toEqual({ tokenId: created.id, workspaceId });
  });

  it("rejects a revoked token", async () => {
    const created = await webhookTokensService.create(
      workspaceId,
      `${NAME_PREFIX}-auth-revoked`,
    );
    await webhookTokensService.revoke(created.id, workspaceId);

    const context = await serverMetricsService.authenticateMetricsToken(
      created.token,
    );
    expect(context).toBeNull();
  });

  it("rejects a channel-bound token", async () => {
    const category = await db.messageCategory.create({
      data: { workspaceId, name: `${NAME_PREFIX}-category` },
    });
    const channel = await db.channel.create({
      data: {
        workspaceId,
        messageCategoryId: category.id,
        messageCategoryWorkspaceId: workspaceId,
        name: `${NAME_PREFIX}-channel`,
      },
    });
    const created = await webhookTokensService.createForChannel(
      channel.id,
      workspaceId,
      `${NAME_PREFIX}-auth-channel`,
    );
    const secret = created.url.split("/").at(-1)!;

    const context = await serverMetricsService.authenticateMetricsToken(secret);
    expect(context).toBeNull();
  });

  it("rejects an unknown secret", async () => {
    const context =
      await serverMetricsService.authenticateMetricsToken(
        `unknown-secret-${randomUUID()}`,
      );
    expect(context).toBeNull();
  });
});

describe("processMetricsIngestion()", () => {
  let ctx: serverMetricsService.MetricsTokenContext;

  beforeAll(async () => {
    const created = await webhookTokensService.create(
      workspaceId,
      `${NAME_PREFIX}-ingest`,
    );
    ctx = { tokenId: created.id, workspaceId };
  });

  it("resolves via the cheap claim-match path and upserts the snapshot on the claiming server", async () => {
    const claimIp = "8.8.8.8";
    const server = await db.localServer.create({
      data: {
        workspaceId,
        origin: "AGENT",
        displayName: "pre-claimed-server",
      },
    });
    await db.localServerAddress.create({
      data: {
        workspaceId,
        localServerId: server.id,
        address: claimIp,
        family: "IPV4",
        scope: "GLOBAL",
        source: "AGENT",
        matchKey: claimIp,
        isCurrent: true,
        isEnrollmentClaim: true,
      },
    });

    const payload = parsePayload({ hostname: "claim-host", ips: [claimIp] });
    const result = await serverMetricsService.processMetricsIngestion(
      ctx,
      payload,
    );

    expect(result).toEqual({
      status: 200,
      code: "SNAPSHOT_UPDATED",
      localServerId: server.id,
    });

    const snapshot = await db.serverMetricSnapshot.findUnique({
      where: { localServerId: server.id },
    });
    expect(snapshot).not.toBeNull();
    expect(snapshot?.hostname).toBe("claim-host");

    const refreshedServer = await db.localServer.findUniqueOrThrow({
      where: { id: server.id },
    });
    expect(refreshedServer.hostname).toBe("claim-host");
  });

  it("auto-enrolls a new AGENT-origin server when no claim matches and no provider credentials exist, then reuses it on the next ingest via the cheap path", async () => {
    const agentIp = "1.2.3.4";
    const firstPayload = parsePayload({
      hostname: "agent-only-host",
      ips: [agentIp],
      capturedAt: new Date(Date.now() - 60_000).toISOString(),
    });

    const created = await serverMetricsService.processMetricsIngestion(
      ctx,
      firstPayload,
    );
    expect(created).toMatchObject({ status: 201, code: "AGENT_ENROLLED" });

    const server = await db.localServer.findUniqueOrThrow({
      where: { id: created.localServerId },
    });
    expect(server.origin).toBe("AGENT");
    expect(server.hostname).toBe("agent-only-host");

    const address = await db.localServerAddress.findFirst({
      where: { workspaceId, localServerId: server.id, address: agentIp },
    });
    expect(address).toMatchObject({
      isEnrollmentClaim: true,
      matchKey: agentIp,
    });

    const secondPayload = parsePayload({
      hostname: "agent-only-host",
      ips: [agentIp],
      capturedAt: new Date().toISOString(),
      cpuUsagePercent: 42,
    });
    const second = await serverMetricsService.processMetricsIngestion(
      ctx,
      secondPayload,
    );
    expect(second).toEqual({
      status: 200,
      code: "SNAPSHOT_UPDATED",
      localServerId: server.id,
    });

    const totalServersForHost = await db.localServer.count({
      where: { workspaceId, origin: "AGENT", hostname: "agent-only-host" },
    });
    expect(totalServersForHost).toBe(1);

    const snapshot = await db.serverMetricSnapshot.findUniqueOrThrow({
      where: { localServerId: server.id },
    });
    expect(snapshot.cpuUsagePercent).toBe(42);
  });

  it("rejects with SERVER_MATCH_AMBIGUOUS when two servers each hold a claim for a different reported IP, writing nothing", async () => {
    const ipA = "5.6.7.8";
    const ipB = "9.9.9.9";

    const serverA = await db.localServer.create({
      data: { workspaceId, origin: "AGENT", displayName: "ambiguous-a" },
    });
    const serverB = await db.localServer.create({
      data: { workspaceId, origin: "AGENT", displayName: "ambiguous-b" },
    });
    await db.localServerAddress.create({
      data: {
        workspaceId,
        localServerId: serverA.id,
        address: ipA,
        family: "IPV4",
        scope: "GLOBAL",
        source: "AGENT",
        matchKey: ipA,
        isCurrent: true,
        isEnrollmentClaim: true,
      },
    });
    await db.localServerAddress.create({
      data: {
        workspaceId,
        localServerId: serverB.id,
        address: ipB,
        family: "IPV4",
        scope: "GLOBAL",
        source: "AGENT",
        matchKey: ipB,
        isCurrent: true,
        isEnrollmentClaim: true,
      },
    });

    const serverCountBefore = await db.localServer.count({
      where: { workspaceId },
    });

    const payload = parsePayload({
      hostname: "ambiguous-host",
      ips: [ipA, ipB],
    });

    await expect(
      serverMetricsService.processMetricsIngestion(ctx, payload),
    ).rejects.toMatchObject({
      name: "ServerMetricsError",
      code: "SERVER_MATCH_AMBIGUOUS",
    });

    const serverCountAfter = await db.localServer.count({
      where: { workspaceId },
    });
    expect(serverCountAfter).toBe(serverCountBefore);

    expect(
      await db.serverMetricSnapshot.findUnique({
        where: { localServerId: serverA.id },
      }),
    ).toBeNull();
    expect(
      await db.serverMetricSnapshot.findUnique({
        where: { localServerId: serverB.id },
      }),
    ).toBeNull();
  });

  it("ignores an ingest whose capturedAt is older than the existing snapshot, leaving the snapshot unchanged", async () => {
    const claimIp = "11.22.33.44";
    const server = await db.localServer.create({
      data: { workspaceId, origin: "AGENT", displayName: "ooo-server" },
    });
    await db.localServerAddress.create({
      data: {
        workspaceId,
        localServerId: server.id,
        address: claimIp,
        family: "IPV4",
        scope: "GLOBAL",
        source: "AGENT",
        matchKey: claimIp,
        isCurrent: true,
        isEnrollmentClaim: true,
      },
    });

    const firstPayload = parsePayload({
      hostname: "ooo-host",
      ips: [claimIp],
      capturedAt: new Date().toISOString(),
      cpuUsagePercent: 12.5,
    });
    const first = await serverMetricsService.processMetricsIngestion(
      ctx,
      firstPayload,
    );
    expect(first.code).toBe("SNAPSHOT_UPDATED");

    const olderPayload = parsePayload({
      hostname: "ooo-host",
      ips: [claimIp],
      capturedAt: new Date(Date.now() - 3_600_000).toISOString(),
      cpuUsagePercent: 99.9,
    });
    const second = await serverMetricsService.processMetricsIngestion(
      ctx,
      olderPayload,
    );
    expect(second).toEqual({
      status: 200,
      code: "SNAPSHOT_IGNORED_OUT_OF_ORDER",
      localServerId: server.id,
    });

    const snapshot = await db.serverMetricSnapshot.findUniqueOrThrow({
      where: { localServerId: server.id },
    });
    expect(snapshot.cpuUsagePercent).toBe(12.5);
  });

  it("reuses a prior AGENT-origin enrollment for the same hostname when the payload reports no global IPv4 (NAT-only)", async () => {
    const firstPayload = parsePayload({
      hostname: "nat-only-host",
      ips: ["10.0.0.5"],
      capturedAt: new Date(Date.now() - 60_000).toISOString(),
    });
    const first = await serverMetricsService.processMetricsIngestion(
      ctx,
      firstPayload,
    );
    expect(first).toMatchObject({ status: 201, code: "AGENT_ENROLLED" });

    const secondPayload = parsePayload({
      hostname: "nat-only-host",
      ips: ["10.0.0.6"],
      capturedAt: new Date().toISOString(),
    });
    const second = await serverMetricsService.processMetricsIngestion(
      ctx,
      secondPayload,
    );
    expect(second).toEqual({
      status: 200,
      code: "SNAPSHOT_UPDATED",
      localServerId: first.localServerId,
    });

    const totalServersForHost = await db.localServer.count({
      where: { workspaceId, origin: "AGENT", hostname: "nat-only-host" },
    });
    expect(totalServersForHost).toBe(1);
  });
});
