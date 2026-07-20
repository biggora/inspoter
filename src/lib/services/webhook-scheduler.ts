import { env } from "@/lib/config/env";
import {
  reclaimStaleLeases,
  claimDueDeliveries,
  deliverClaimed,
  type ClaimedDelivery,
} from "@/lib/services/outgoingWebhooks";

// In-process scheduler that drains the outgoing-webhook delivery queue, a copy
// of the mail/service scheduler pattern (src/lib/services/scheduler.ts): the
// app is a single long-lived Node process, so a plain setInterval is viable.

// Exactly one instance per process: guarded by a globalThis flag, mirroring
// the PrismaClient singleton pattern in src/lib/db.ts, so Next.js's
// dev-mode hot-reload doesn't spawn a second interval.
const globalForWebhookScheduler = globalThis as unknown as {
  __inspoterWebhookSchedulerStarted?: boolean;
};

// Bounded concurrency: claimed deliveries are sent in small batches rather
// than all at once — outgoing POSTs are light, hence 10 (as service-scheduler).
const CHUNK_SIZE = 10;

// Reentrancy guard: if a tick is still running when the next interval fires
// (e.g. a large backlog with slow endpoints), skip that tick instead of
// letting ticks pile up concurrently.
let tickInFlight = false;

async function processInChunks<T>(
  items: T[],
  size: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  for (let i = 0; i < items.length; i += size) {
    const chunk = items.slice(i, i + size);
    await Promise.all(chunk.map((item) => fn(item)));
  }
}

async function sendOne(claimed: ClaimedDelivery): Promise<void> {
  try {
    await deliverClaimed(claimed);
  } catch (error) {
    // deliverClaimed already records outcomes and swallows send errors; this
    // guard only covers an unexpected throw so it never kills the interval.
    console.error(
      `[webhook-scheduler] delivery failed for ${claimed.delivery.id}:`,
      error,
    );
  }
}

async function tick(): Promise<void> {
  if (tickInFlight) return;
  tickInFlight = true;
  try {
    const now = new Date();
    await reclaimStaleLeases(now);
    const claimed = await claimDueDeliveries(
      now,
      env.WEBHOOK_DELIVERY_BATCH,
      env.WEBHOOK_DELIVERY_LEASE_MS,
    );
    await processInChunks(claimed, CHUNK_SIZE, sendOne);
  } catch (error) {
    console.error("[webhook-scheduler] tick failed:", error);
  } finally {
    tickInFlight = false;
  }
}

export function startWebhookScheduler(): void {
  if (globalForWebhookScheduler.__inspoterWebhookSchedulerStarted) return;
  globalForWebhookScheduler.__inspoterWebhookSchedulerStarted = true;

  setInterval(() => {
    void tick();
  }, env.WEBHOOK_SCHEDULER_TICK_MS);
}
