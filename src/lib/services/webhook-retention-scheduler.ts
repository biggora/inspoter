import { env } from "@/lib/config/env";
import { pruneOldDeliveries } from "@/lib/services/outgoingWebhooks";

// In-process scheduler that prunes old terminal WebhookDelivery rows so the
// table doesn't grow unbounded, a copy of the other schedulers' pattern
// (src/lib/services/scheduler.ts): the app is a single long-lived Node
// process, so a plain setInterval is viable. Unlike the other schedulers,
// there's no processInChunks here — this job does one bulk deleteMany per
// tick, not N independently-processed items to fan out over.

// Exactly one instance per process: guarded by a globalThis flag, mirroring
// the PrismaClient singleton pattern in src/lib/db.ts, so Next.js's
// dev-mode hot-reload doesn't spawn a second interval.
const globalForWebhookRetentionScheduler = globalThis as unknown as {
  __inspoterWebhookRetentionSchedulerStarted?: boolean;
};

// Reentrancy guard: if a tick is still running when the next interval fires
// (e.g. a large backlog on first deploy), skip that tick instead of letting
// ticks pile up concurrently.
let tickInFlight = false;

async function tick(): Promise<void> {
  if (tickInFlight) return;
  tickInFlight = true;
  try {
    const cutoff = new Date(
      Date.now() - env.WEBHOOK_DELIVERY_RETENTION_DAYS * 24 * 60 * 60 * 1000,
    );
    const deleted = await pruneOldDeliveries(
      cutoff,
      env.WEBHOOK_DELIVERY_RETENTION_BATCH,
    );
    if (deleted > 0) {
      console.log(`[webhook-retention-scheduler] pruned ${deleted} deliveries`);
    }
  } catch (error) {
    console.error("[webhook-retention-scheduler] tick failed:", error);
  } finally {
    tickInFlight = false;
  }
}

export function startWebhookRetentionScheduler(): void {
  if (
    globalForWebhookRetentionScheduler.__inspoterWebhookRetentionSchedulerStarted
  )
    return;
  globalForWebhookRetentionScheduler.__inspoterWebhookRetentionSchedulerStarted = true;

  setInterval(() => {
    void tick();
  }, env.WEBHOOK_DELIVERY_RETENTION_TICK_MS);
}
