import { env } from "@/lib/config/env";
import { db } from "@/lib/db";

// In-process scheduler that prunes old LogEntry rows so the table doesn't grow
// unbounded, following the same pattern as webhook-retention-scheduler.ts: the
// app is a single long-lived Node process, so a plain setInterval is viable.
// Unlike the webhook retention scheduler there's no batch knob — log entries
// are lightweight and a single deleteMany per tick is fine.

// Exactly one instance per process: guarded by a globalThis flag, mirroring
// the PrismaClient singleton pattern in src/lib/db.ts, so Next.js's
// dev-mode hot-reload doesn't spawn a second interval.
const globalForLogRetentionScheduler = globalThis as unknown as {
  __inspoterLogRetentionSchedulerStarted?: boolean;
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
      Date.now() - env.LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000,
    );
    const { count } = await db.logEntry.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });
    if (count > 0) {
      console.log(`[log-retention-scheduler] pruned ${count} entries`);
    }
  } catch (error) {
    console.error("[log-retention-scheduler] tick failed:", error);
  } finally {
    tickInFlight = false;
  }
}

export function startLogRetentionScheduler(): void {
  if (globalForLogRetentionScheduler.__inspoterLogRetentionSchedulerStarted)
    return;
  globalForLogRetentionScheduler.__inspoterLogRetentionSchedulerStarted = true;

  setInterval(() => {
    void tick();
  }, env.LOG_RETENTION_TICK_MS);
}
