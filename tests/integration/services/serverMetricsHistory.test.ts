import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { getServerMetricsHistory } from "@/lib/services/serverMetricsHistory";

// The SQL half of the history service: bucket aggregation and workspace
// isolation. The pure transformation is covered by
// tests/unit/services/serverMetricsHistory.test.ts.

const NAME_PREFIX = `smh-${randomUUID()}`;
const GB = BigInt(1024) ** BigInt(3);

let workspaceId: string;
let otherWorkspaceId: string;
let serverId: string;
let otherServerId: string;

async function createWorkspace(suffix: string): Promise<string> {
  const workspace = await db.workspace.create({
    data: {
      name: `History ${suffix}`,
      slug: `${NAME_PREFIX}-${suffix}`,
      updatedAt: new Date(),
    },
  });
  return workspace.id;
}

async function createServer(
  workspace: string,
  displayName: string,
): Promise<string> {
  const server = await db.localServer.create({
    data: { workspaceId: workspace, origin: "AGENT", displayName },
  });
  return server.id;
}

async function addSample(
  workspace: string,
  localServerId: string,
  capturedAt: Date,
  values: {
    cpu: number;
    memoryAvailableBytes?: bigint;
    uptimeSeconds?: bigint;
  },
) {
  await db.serverMetricSample.create({
    data: {
      workspaceId: workspace,
      localServerId,
      capturedAt,
      cpuUsagePercent: values.cpu,
      load1: 0.5,
      load5: 0.4,
      load15: 0.3,
      memoryTotalBytes: BigInt(4) * GB,
      memoryAvailableBytes: values.memoryAvailableBytes ?? BigInt(2) * GB,
      swapTotalBytes: BigInt(0),
      swapFreeBytes: BigInt(0),
      filesystemTotalBytes: BigInt(80) * GB,
      filesystemAvailableBytes: BigInt(50) * GB,
      uptimeSeconds: values.uptimeSeconds ?? BigInt(360_000),
    },
  });
}

beforeAll(async () => {
  workspaceId = await createWorkspace("main");
  otherWorkspaceId = await createWorkspace("other");
  serverId = await createServer(workspaceId, "history-server");
  otherServerId = await createServer(otherWorkspaceId, "foreign-server");
});

afterAll(async () => {
  for (const id of [workspaceId, otherWorkspaceId]) {
    if (id) await db.workspace.delete({ where: { id } }).catch(() => {});
  }
});

describe("getServerMetricsHistory()", () => {
  it("returns an empty series for a server that never reported", async () => {
    const history = await getServerMetricsHistory(workspaceId, serverId, "24h");

    expect(history.points).toEqual([]);
    expect(history.reboots).toEqual([]);
    expect(history.range).toBe("24h");
    expect(history.bucketSeconds).toBe(600);
  });

  it("averages the samples that share a bucket and keeps the peak", async () => {
    // Three samples inside one 10-minute bucket, one in the next.
    const base = new Date();
    base.setUTCSeconds(0, 0);
    base.setUTCMinutes(0);
    const bucketStart = new Date(base.getTime() - 60 * 60 * 1000);

    await addSample(workspaceId, serverId, bucketStart, { cpu: 10 });
    await addSample(
      workspaceId,
      serverId,
      new Date(bucketStart.getTime() + 60_000),
      { cpu: 20 },
    );
    await addSample(
      workspaceId,
      serverId,
      new Date(bucketStart.getTime() + 120_000),
      { cpu: 60 },
    );
    await addSample(
      workspaceId,
      serverId,
      new Date(bucketStart.getTime() + 600_000),
      { cpu: 5 },
    );

    const history = await getServerMetricsHistory(workspaceId, serverId, "24h");

    expect(history.points).toHaveLength(2);
    expect(history.points[0].cpuAvg).toBe(30);
    expect(history.points[0].cpuMax).toBe(60);
    expect(history.points[0].memoryPercent).toBe(50);
    expect(history.points[0].diskPercent).toBe(37.5);
    expect(history.points[0].swapPercent).toBeNull();
    expect(history.points[1].cpuAvg).toBe(5);
  });

  it("drops samples older than the requested range", async () => {
    const ancient = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);
    await addSample(workspaceId, serverId, ancient, { cpu: 77 });

    const day = await getServerMetricsHistory(workspaceId, serverId, "24h");
    expect(day.points.some((point) => point.cpuAvg === 77)).toBe(false);

    const month = await getServerMetricsHistory(workspaceId, serverId, "30d");
    expect(month.points.some((point) => point.cpuAvg === 77)).toBe(false);
  });

  it("marks a reboot where uptime dropped between buckets", async () => {
    const rebootServer = await createServer(workspaceId, "reboot-server");
    const start = new Date(Date.now() - 4 * 60 * 60 * 1000);

    await addSample(workspaceId, rebootServer, start, {
      cpu: 5,
      uptimeSeconds: BigInt(100_000),
    });
    await addSample(
      workspaceId,
      rebootServer,
      new Date(start.getTime() + 60 * 60 * 1000),
      { cpu: 5, uptimeSeconds: BigInt(60) },
    );
    await addSample(
      workspaceId,
      rebootServer,
      new Date(start.getTime() + 2 * 60 * 60 * 1000),
      { cpu: 5, uptimeSeconds: BigInt(3_660) },
    );

    const history = await getServerMetricsHistory(
      workspaceId,
      rebootServer,
      "24h",
    );

    expect(history.reboots).toHaveLength(1);
    expect(history.points[1].t).toBe(history.reboots[0]);
  });

  it("never returns another workspace's series", async () => {
    await addSample(otherWorkspaceId, otherServerId, new Date(), { cpu: 90 });

    const leaked = await getServerMetricsHistory(
      workspaceId,
      otherServerId,
      "24h",
    );
    expect(leaked.points).toEqual([]);

    const owned = await getServerMetricsHistory(
      otherWorkspaceId,
      otherServerId,
      "24h",
    );
    expect(owned.points).toHaveLength(1);
  });
});
