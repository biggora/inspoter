import { env } from "@/lib/config/env";
import { db } from "@/lib/db";
import { syncAccount } from "@/lib/services/mail-sync";

// In-process scheduler for mail account syncs (plan §3), a copy of the
// Services check scheduler pattern in src/lib/services/scheduler.ts: the app
// is a single long-lived Node process, so a plain setInterval is viable.

// Exactly one instance per process: guarded by a globalThis flag, mirroring
// the PrismaClient singleton pattern in src/lib/db.ts, so Next.js's
// dev-mode hot-reload doesn't spawn a second interval.
const globalForMailScheduler = globalThis as unknown as {
  __inspoterMailSchedulerStarted?: boolean;
};

// Bounded concurrency: due accounts are synced in small batches rather than
// all at once — IMAP syncs are heavier than HTTP checks, hence 3 (plan §3).
const CHUNK_SIZE = 3;

// Reentrancy guard: if a tick is still running when the next interval
// fires (e.g. many due accounts with slow servers), skip that tick
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

async function syncOneAccount(account: {
  id: string;
  workspaceId: string;
}): Promise<void> {
  try {
    await syncAccount(account.id, account.workspaceId);
  } catch (error) {
    // A single bad account must never kill the interval or block the others
    // in its chunk.
    console.error(
      `[mail-scheduler] sync failed for account ${account.id}:`,
      error,
    );
  }
}

async function tick(): Promise<void> {
  if (tickInFlight) return;
  tickInFlight = true;
  try {
    // Cross-tenant due sweep, backed by the [isActive, nextSyncAt] index.
    const due = await db.mailAccount.findMany({
      where: { kind: "IMAP", isActive: true, nextSyncAt: { lte: new Date() } },
      select: { id: true, workspaceId: true },
    });
    await processInChunks(due, CHUNK_SIZE, syncOneAccount);
  } catch (error) {
    console.error("[mail-scheduler] tick failed:", error);
  } finally {
    tickInFlight = false;
  }
}

export function startMailScheduler(): void {
  if (globalForMailScheduler.__inspoterMailSchedulerStarted) return;
  globalForMailScheduler.__inspoterMailSchedulerStarted = true;

  setInterval(() => {
    void tick();
  }, env.MAIL_SYNC_TICK_MS);
}
