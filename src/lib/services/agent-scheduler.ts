import { env } from "@/lib/config/env";
import { executeAgentRun } from "@/lib/agents/runtime";
import {
  claimDueAgentRuns,
  reclaimStaleAgentRuns,
  AgentRunLeaseLostError,
  type ClaimedAgentRun,
} from "@/lib/services/agent-runs";
import { materializeDueSchedules } from "@/lib/services/agent-schedules";
import { logError } from "@/lib/services/logs";

// In-process scheduler that drains the agent run queue — a copy of the
// outgoing-webhook scheduler pattern (src/lib/services/webhook-scheduler.ts):
// the app is a single long-lived Node process, so a plain setInterval is
// viable and no queue broker is introduced.

const globalForAgentScheduler = globalThis as unknown as {
  __inspoterAgentSchedulerStarted?: boolean;
};

// Two, not ten: a run holds its lease across N model round-trips and can take
// minutes, unlike the single POST a webhook delivery makes.
const CHUNK_SIZE = 2;

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

async function runOne(claim: ClaimedAgentRun): Promise<void> {
  try {
    await executeAgentRun(claim);
  } catch (error) {
    // executeAgentRun records ordinary failures on the run itself; reaching
    // here means the lease was lost or something genuinely unexpected happened.
    // Either way it must not kill the interval.
    if (error instanceof AgentRunLeaseLostError) return;
    console.error(`[agent-scheduler] run ${claim.id} failed:`, error);
    logError(
      claim.workspaceId,
      "scheduler:agent",
      `Agent run failed: ${error instanceof Error ? error.message : String(error)}`,
      JSON.stringify({ runId: claim.id }),
    );
  }
}

async function tick(): Promise<void> {
  if (tickInFlight) return;
  tickInFlight = true;
  try {
    // Order matters: a schedule that just came due should be executable in
    // this same tick rather than waiting for the next one.
    await materializeDueSchedules(env.AGENT_SCHEDULE_BATCH);
    await reclaimStaleAgentRuns();
    const claimed = await claimDueAgentRuns(env.AGENT_RUN_BATCH);
    await processInChunks(claimed, CHUNK_SIZE, runOne);
  } catch (error) {
    console.error("[agent-scheduler] tick failed:", error);
  } finally {
    tickInFlight = false;
  }
}

export function wakeAgentScheduler(): void {
  void tick();
}

export function startAgentScheduler(): void {
  if (globalForAgentScheduler.__inspoterAgentSchedulerStarted) return;
  globalForAgentScheduler.__inspoterAgentSchedulerStarted = true;

  setInterval(() => {
    void tick();
  }, env.AGENT_SCHEDULER_TICK_MS);
}
