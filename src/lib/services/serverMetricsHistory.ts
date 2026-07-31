import { db } from "@/lib/db";

// Historical metrics for one server, aggregated into fixed time buckets for
// the detail page's charts.
//
// The agent pushes once a minute, so the raw series is 1440 points a day —
// 43k for the deepest range. Bucketing happens in Postgres rather than in the
// browser: every range returns 120–180 points regardless of depth, which is
// what an SVG chart a few hundred pixels wide can actually show.

export interface HistoryRangeSpec {
  hours: number;
  bucketSeconds: number;
}

export const HISTORY_RANGES = {
  "24h": { hours: 24, bucketSeconds: 600 }, // 144 points, 10 min each
  "48h": { hours: 48, bucketSeconds: 1200 }, // 144 points, 20 min each
  "5d": { hours: 120, bucketSeconds: 3600 }, // 120 points, 1 h each
  "7d": { hours: 168, bucketSeconds: 3600 }, // 168 points, 1 h each
  "30d": { hours: 720, bucketSeconds: 14400 }, // 180 points, 4 h each
} as const satisfies Record<string, HistoryRangeSpec>;

export type HistoryRange = keyof typeof HISTORY_RANGES;

export const HISTORY_RANGE_KEYS = Object.keys(HISTORY_RANGES) as HistoryRange[];

export function isHistoryRange(value: unknown): value is HistoryRange {
  return (
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(HISTORY_RANGES, value)
  );
}

export interface HistoryPoint {
  /** Bucket start, ISO 8601. */
  t: string;
  cpuAvg: number;
  cpuMax: number;
  load1: number;
  load5: number;
  load15: number;
  memoryUsedBytes: number;
  memoryTotalBytes: number;
  memoryPercent: number;
  swapUsedBytes: number;
  swapTotalBytes: number;
  /** Null when the server has no swap configured — 0/0 is not "0% used". */
  swapPercent: number | null;
  diskUsedBytes: number;
  diskTotalBytes: number;
  diskPercent: number;
  uptimeSeconds: number;
}

export interface ServerMetricsHistory {
  range: HistoryRange;
  from: string;
  to: string;
  bucketSeconds: number;
  points: HistoryPoint[];
  /** Bucket starts (ISO) where uptime dropped — the server rebooted. */
  reboots: string[];
}

interface HistoryRow {
  bucket: Date;
  cpu_avg: number;
  cpu_max: number;
  load1: number;
  load5: number;
  load15: number;
  mem_used: number;
  mem_total: number;
  swap_used: number;
  swap_total: number;
  fs_used: number;
  fs_total: number;
  uptime_min: number;
}

function percent(used: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((used / total) * 1000) / 10;
}

/**
 * Turns aggregated rows into chart points and reboot markers.
 *
 * A reboot is a bucket whose lowest uptime is below the previous bucket's:
 * uptime only ever counts up, so any drop means the machine restarted in
 * between. Comparing bucket minima (rather than raw samples) keeps this a
 * property of the aggregated series, so it can't disagree with what the chart
 * draws.
 */
export function buildHistoryPoints(rows: HistoryRow[]): {
  points: HistoryPoint[];
  reboots: string[];
} {
  const points: HistoryPoint[] = [];
  const reboots: string[] = [];
  let previousUptime: number | null = null;

  for (const row of rows) {
    const t = row.bucket.toISOString();

    if (previousUptime !== null && row.uptime_min < previousUptime) {
      reboots.push(t);
    }
    previousUptime = row.uptime_min;

    points.push({
      t,
      cpuAvg: Math.round(row.cpu_avg * 10) / 10,
      cpuMax: Math.round(row.cpu_max * 10) / 10,
      load1: Math.round(row.load1 * 100) / 100,
      load5: Math.round(row.load5 * 100) / 100,
      load15: Math.round(row.load15 * 100) / 100,
      memoryUsedBytes: Math.round(row.mem_used),
      memoryTotalBytes: Math.round(row.mem_total),
      memoryPercent: percent(row.mem_used, row.mem_total),
      swapUsedBytes: Math.round(row.swap_used),
      swapTotalBytes: Math.round(row.swap_total),
      swapPercent:
        row.swap_total > 0 ? percent(row.swap_used, row.swap_total) : null,
      diskUsedBytes: Math.round(row.fs_used),
      diskTotalBytes: Math.round(row.fs_total),
      diskPercent: percent(row.fs_used, row.fs_total),
      uptimeSeconds: Math.round(row.uptime_min),
    });
  }

  return { points, reboots };
}

export async function getServerMetricsHistory(
  workspaceId: string,
  localServerId: string,
  range: HistoryRange,
): Promise<ServerMetricsHistory> {
  const { hours, bucketSeconds } = HISTORY_RANGES[range];
  const to = new Date();
  const from = new Date(to.getTime() - hours * 60 * 60 * 1000);

  // Every aggregate is cast to float8: avg() over bigint columns returns
  // numeric, which Prisma hands back as a Decimal instance, and avg() over
  // double precision would still leave the bigint sums untyped for JSON.
  //
  // The workspaceId predicate is workspace isolation, not an optimisation —
  // a foreign localServerId must return nothing rather than another
  // workspace's series.
  //
  // The window is closed at both ends so the axis spans exactly the range the
  // response declares. Ingest already rejects future capture times
  // (CLOCK_SKEW_FUTURE), but a row that predates that check would otherwise
  // stretch every chart past "now".
  const rows = await db.$queryRaw<HistoryRow[]>`
    SELECT
      to_timestamp(floor(extract(epoch from "capturedAt") / ${bucketSeconds}) * ${bucketSeconds}) AS bucket,
      avg("cpuUsagePercent")::float8 AS cpu_avg,
      max("cpuUsagePercent")::float8 AS cpu_max,
      avg("load1")::float8 AS load1,
      avg("load5")::float8 AS load5,
      avg("load15")::float8 AS load15,
      avg("memoryTotalBytes" - "memoryAvailableBytes")::float8 AS mem_used,
      avg("memoryTotalBytes")::float8 AS mem_total,
      avg("swapTotalBytes" - "swapFreeBytes")::float8 AS swap_used,
      avg("swapTotalBytes")::float8 AS swap_total,
      avg("filesystemTotalBytes" - "filesystemAvailableBytes")::float8 AS fs_used,
      avg("filesystemTotalBytes")::float8 AS fs_total,
      min("uptimeSeconds")::float8 AS uptime_min
    FROM "ServerMetricSample"
    WHERE "workspaceId" = ${workspaceId}
      AND "localServerId" = ${localServerId}
      AND "capturedAt" >= ${from}
      AND "capturedAt" <= ${to}
    GROUP BY 1
    ORDER BY 1
  `;

  const { points, reboots } = buildHistoryPoints(rows);

  return {
    range,
    from: from.toISOString(),
    to: to.toISOString(),
    bucketSeconds,
    points,
    reboots,
  };
}
