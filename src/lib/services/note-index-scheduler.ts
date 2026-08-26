import { env } from "@/lib/config/env";
import {
  claimNoteIndexJobs,
  processNoteIndexJob,
  reclaimStaleNoteIndexJobs,
} from "@/lib/services/note-index";

const globalForNoteIndexScheduler = globalThis as unknown as {
  __inspoterNoteIndexSchedulerStarted?: boolean;
};

let tickInFlight = false;

export async function runNoteIndexSchedulerTick(): Promise<void> {
  if (tickInFlight) return;
  tickInFlight = true;
  try {
    await reclaimStaleNoteIndexJobs();
    const jobs = await claimNoteIndexJobs();
    for (const job of jobs) await processNoteIndexJob(job);
  } catch (error) {
    console.error("[note-index-scheduler] tick failed:", error);
  } finally {
    tickInFlight = false;
  }
}

export function startNoteIndexScheduler(): void {
  if (globalForNoteIndexScheduler.__inspoterNoteIndexSchedulerStarted) return;
  globalForNoteIndexScheduler.__inspoterNoteIndexSchedulerStarted = true;
  setInterval(() => {
    void runNoteIndexSchedulerTick();
  }, env.NOTE_INDEX_SCHEDULER_TICK_MS);
}
