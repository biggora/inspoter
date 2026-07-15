import { env } from "@/lib/config/env";
import type { Service } from "@/generated/prisma/client";
import { runCheck } from "./monitor-checks";
import { listDueForCheck, applyCheckResult } from "./services";

// In-process scheduler for Services checks (plan.md "Планировщик
// проверок"). The app is deployed as a single long-lived Node process
// (`next start` in Docker, no serverless/cron/queue infra), which makes a
// plain setInterval viable — see plan.md's Context section.

// Exactly one instance per process: guarded by a globalThis flag, mirroring
// the PrismaClient singleton pattern in src/lib/db.ts, so Next.js's
// dev-mode hot-reload doesn't spawn a second interval.
const globalForScheduler = globalThis as unknown as {
  __inspoterServiceSchedulerStarted?: boolean;
};

// Bounded concurrency: due services are checked in small batches rather
// than all at once, without pulling in a new dependency.
const CHUNK_SIZE = 10;

// Reentrancy guard: if a tick is still running when the next interval
// fires (e.g. many due services with long timeouts), skip that tick
// instead of letting ticks pile up concurrently.
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

async function checkOneService(service: Service): Promise<void> {
  try {
    const outcome = await runCheck(service);
    await applyCheckResult(service, outcome);
  } catch (error) {
    // A single bad check must never kill the interval or block the others
    // in its chunk.
    console.error(
      `[service-scheduler] check failed for service ${service.id}:`,
      error,
    );
  }
}

async function tick(): Promise<void> {
  if (tickInFlight) return;
  tickInFlight = true;
  try {
    const due = await listDueForCheck(new Date());
    await processInChunks(due, CHUNK_SIZE, checkOneService);
  } catch (error) {
    console.error("[service-scheduler] tick failed:", error);
  } finally {
    tickInFlight = false;
  }
}

export function startServiceScheduler(): void {
  if (globalForScheduler.__inspoterServiceSchedulerStarted) return;
  globalForScheduler.__inspoterServiceSchedulerStarted = true;

  setInterval(() => {
    void tick();
  }, env.SERVICE_SCHEDULER_TICK_MS);
}
