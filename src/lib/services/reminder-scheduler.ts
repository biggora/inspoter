import { env } from "@/lib/config/env";
import { processDueReminders } from "@/lib/services/calendar";

const globalForReminderScheduler = globalThis as unknown as {
  __inspoterReminderSchedulerStarted?: boolean;
};

export async function runReminderSchedulerTick(): Promise<void> {
  try {
    await processDueReminders(new Date(), env.REMINDER_SCHEDULER_BATCH);
  } catch (error) {
    console.error("[reminder-scheduler] tick failed:", error);
  }
}

export function startReminderScheduler(): void {
  if (globalForReminderScheduler.__inspoterReminderSchedulerStarted) return;
  globalForReminderScheduler.__inspoterReminderSchedulerStarted = true;
  void runReminderSchedulerTick();
  setInterval(() => {
    void runReminderSchedulerTick();
  }, env.REMINDER_SCHEDULER_TICK_MS);
}
