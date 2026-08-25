import { env } from "@/lib/config/env";
import { pruneOldRuns } from "@/lib/services/agent-runs";

// Retention sweep for the agent run history — a copy of
// src/lib/services/webhook-retention-scheduler.ts. A run keeps up to a couple
// of dozen step rows, so the table grows with every scheduled report; without
// this it would grow forever.

const globalForAgentRetention = globalThis as unknown as {
  __inspoterAgentRunRetentionStarted?: boolean;
};

let tickInFlight = false;

async function tick(): Promise<void> {
  if (tickInFlight) return;
  tickInFlight = true;
  try {
    const cutoff = new Date(
      Date.now() - env.AGENT_RUN_RETENTION_DAYS * 86_400_000,
    );
    // One batch per tick: the sweep is hourly, and a slow drain is preferable
    // to a single delete that locks the table on a large backlog.
    await pruneOldRuns(cutoff);
  } catch (error) {
    console.error("[agent-run-retention] tick failed:", error);
  } finally {
    tickInFlight = false;
  }
}

export function startAgentRunRetentionScheduler(): void {
  if (globalForAgentRetention.__inspoterAgentRunRetentionStarted) return;
  globalForAgentRetention.__inspoterAgentRunRetentionStarted = true;

  setInterval(() => {
    void tick();
  }, env.AGENT_RUN_RETENTION_TICK_MS);
}
