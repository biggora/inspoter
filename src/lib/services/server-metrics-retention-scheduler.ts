import { env } from "@/lib/config/env";
import { db } from "@/lib/db";

// In-process scheduler that prunes old ServerMetricSample rows so the metric
// history doesn't grow unbounded, following the same pattern as
// webhook-retention-scheduler.ts: the app is a single long-lived Node process,
// so a plain setInterval is viable.
//
// Unlike the log sweep this one deletes in batches. One agent writes ~1440
// rows a day, so a fleet that has been running since before the retention
// window shrank can hold millions of expired rows — a single unbounded
// deleteMany would hold locks for the whole sweep.

// Exactly one instance per process: guarded by a globalThis flag, mirroring
// the PrismaClient singleton pattern in src/lib/db.ts, so Next.js's dev-mode
// hot-reload doesn't spawn a second interval.
const globalForServerMetricsRetentionScheduler = globalThis as unknown as {
  __inspoterServerMetricsRetentionSchedulerStarted?: boolean;
};

// Reentrancy guard: if a tick is still running when the next interval fires
// (e.g. a large backlog on first deploy), skip that tick instead of letting
// ticks pile up concurrently.
let tickInFlight = false;

// Bounds one tick regardless of backlog size: at the default batch that is
// 100k rows an hour, which outpaces any realistic ingest rate while leaving
// the table available between batches.
const MAX_BATCHES_PER_TICK = 20;

export async function pruneOldSamples(
  cutoff: Date,
  batchSize: number,
): Promise<number> {
  let deleted = 0;

  for (let batch = 0; batch < MAX_BATCHES_PER_TICK; batch++) {
    // Prisma's deleteMany has no LIMIT, so the batch is expressed as a
    // subquery over the (capturedAt) index.
    const count = await db.$executeRaw`
      DELETE FROM "ServerMetricSample"
      WHERE "id" IN (
        SELECT "id" FROM "ServerMetricSample"
        WHERE "capturedAt" < ${cutoff}
        LIMIT ${batchSize}
      )
    `;
    deleted += count;
    if (count < batchSize) break;
  }

  return deleted;
}

async function tick(): Promise<void> {
  if (tickInFlight) return;
  tickInFlight = true;
  try {
    const cutoff = new Date(
      Date.now() - env.SERVER_METRICS_RETENTION_DAYS * 24 * 60 * 60 * 1000,
    );
    const deleted = await pruneOldSamples(
      cutoff,
      env.SERVER_METRICS_RETENTION_BATCH,
    );
    if (deleted > 0) {
      console.log(
        `[server-metrics-retention-scheduler] pruned ${deleted} samples`,
      );
    }
  } catch (error) {
    console.error("[server-metrics-retention-scheduler] tick failed:", error);
  } finally {
    tickInFlight = false;
  }
}

export function startServerMetricsRetentionScheduler(): void {
  if (
    globalForServerMetricsRetentionScheduler.__inspoterServerMetricsRetentionSchedulerStarted
  )
    return;
  globalForServerMetricsRetentionScheduler.__inspoterServerMetricsRetentionSchedulerStarted = true;

  setInterval(() => {
    void tick();
  }, env.SERVER_METRICS_RETENTION_TICK_MS);
}
