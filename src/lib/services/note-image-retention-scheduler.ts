import { pruneOrphanNoteImages } from "@/lib/services/note-images";

// In-process scheduler that deletes note images no note ever referenced: an
// upload that was abandoned (editor closed, paste undone, note never saved).
// A copy of the webhook retention scheduler's pattern
// (src/lib/services/webhook-retention-scheduler.ts), with fixed constants
// rather than env vars.

// An image is linked to its note when the note is saved (attachNoteImages),
// so the cutoff is the longest an author may keep a draft open after
// uploading.
const ORPHAN_AFTER_MS = 24 * 60 * 60 * 1000;
const TICK_MS = 60 * 60 * 1000;
const BATCH_SIZE = 500;

// Exactly one instance per process: guarded by a globalThis flag, mirroring
// the PrismaClient singleton pattern in src/lib/db.ts, so Next.js's dev-mode
// hot-reload doesn't spawn a second interval.
const globalForNoteImageRetentionScheduler = globalThis as unknown as {
  __inspoterNoteImageRetentionSchedulerStarted?: boolean;
};

// Reentrancy guard: skip a tick that fires while the previous one is still
// running instead of letting ticks pile up.
let tickInFlight = false;

async function tick(): Promise<void> {
  if (tickInFlight) return;
  tickInFlight = true;
  try {
    const cutoff = new Date(Date.now() - ORPHAN_AFTER_MS);
    const deleted = await pruneOrphanNoteImages(cutoff, BATCH_SIZE);
    if (deleted > 0) {
      console.log(
        `[note-image-retention-scheduler] pruned ${deleted} orphan images`,
      );
    }
  } catch (error) {
    console.error("[note-image-retention-scheduler] tick failed:", error);
  } finally {
    tickInFlight = false;
  }
}

export function startNoteImageRetentionScheduler(): void {
  if (
    globalForNoteImageRetentionScheduler.__inspoterNoteImageRetentionSchedulerStarted
  )
    return;
  globalForNoteImageRetentionScheduler.__inspoterNoteImageRetentionSchedulerStarted = true;

  setInterval(() => {
    void tick();
  }, TICK_MS);
}
