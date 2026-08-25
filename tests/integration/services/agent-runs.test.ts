import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import * as agentsService from "@/lib/services/agents";
import * as skillsService from "@/lib/services/skills";
import * as schedulesService from "@/lib/services/agent-schedules";
import * as runsService from "@/lib/services/agent-runs";

// The claim queue. Everything here turns on the optimistic update counting
// exactly one changed row, and on every timestamp coming from an injected
// clock rather than the database default (fc111d5).

let workspaceId: string;
let otherWorkspaceId: string;
let agentId: string;

function runtimeAt(now: Date): runsService.AgentRunRuntime {
  return { now: () => now, leaseToken: () => randomUUID() };
}

async function makeWorkspace(slugPrefix: string): Promise<string> {
  const workspace = await db.workspace.create({
    data: {
      name: "Agent runs test workspace",
      slug: `${slugPrefix}-${randomUUID()}`,
      updatedAt: new Date(),
    },
  });
  return workspace.id;
}

beforeAll(async () => {
  workspaceId = await makeWorkspace("agent-runs");
  otherWorkspaceId = await makeWorkspace("agent-runs-other");
});

afterAll(async () => {
  for (const id of [workspaceId, otherWorkspaceId]) {
    if (id) await db.workspace.delete({ where: { id } }).catch(() => {});
  }
});

beforeEach(async () => {
  const workspaces = { in: [workspaceId, otherWorkspaceId] };
  await db.agentRun.deleteMany({ where: { workspaceId: workspaces } });
  await db.agent.deleteMany({ where: { workspaceId: workspaces } });

  const agent = await agentsService.createAgent(workspaceId, {
    name: "Night watch",
    instructions: "Summarize what broke overnight.",
    scopes: ["logs:read"],
  });
  agentId = agent.id;
});

describe("createRun", () => {
  it("snapshots the agent so a later edit does not change the run", async () => {
    const run = await runsService.createManualRun(workspaceId, agentId, "go");
    expect(run).not.toBeNull();

    await agentsService.updateAgent(workspaceId, agentId, {
      instructions: "Completely different instructions.",
      scopes: [],
    });

    const claimed = await runsService.claimDueAgentRuns(5);
    const state = await runsService.loadRunState(claimed[0]);
    expect(state.instructions).toBe("Summarize what broke overnight.");
    expect(state.scopes).toEqual(["logs:read"]);
    expect(state.input).toBe("go");
  });

  it("refuses to queue a paused agent", async () => {
    await agentsService.updateAgent(workspaceId, agentId, { isActive: false });
    await expect(
      runsService.createManualRun(workspaceId, agentId, null),
    ).rejects.toBeInstanceOf(runsService.AgentInactiveError);
  });

  it("returns null when the idempotency key is already taken", async () => {
    const key = `sched:${randomUUID()}:1`;
    const first = await runsService.createRun(workspaceId, {
      agentId,
      trigger: "SCHEDULE",
      idempotencyKey: key,
    });
    const second = await runsService.createRun(workspaceId, {
      agentId,
      trigger: "SCHEDULE",
      idempotencyKey: key,
    });
    expect(first).not.toBeNull();
    expect(second).toBeNull();
  });

  it("stamps nextAttemptAt from the injected clock, not the database", async () => {
    // The trap from fc111d5: a database-supplied timestamp against a
    // Node-supplied claim filter makes a fresh run briefly invisible.
    const future = new Date(Date.now() + 60 * 60 * 1000);
    const run = await runsService.createManualRun(
      workspaceId,
      agentId,
      null,
      runtimeAt(future),
    );
    const row = await db.agentRun.findFirstOrThrow({
      where: { id: run!.id },
      select: { nextAttemptAt: true },
    });
    expect(row.nextAttemptAt.getTime()).toBe(future.getTime());
    expect(await runsService.claimDueAgentRuns(5)).toEqual([]);
  });
});

describe("claimDueAgentRuns", () => {
  it("hands one run to exactly one of two concurrent claimers", async () => {
    await runsService.createManualRun(workspaceId, agentId, null);

    const [a, b] = await Promise.all([
      runsService.claimDueAgentRuns(5),
      runsService.claimDueAgentRuns(5),
    ]);
    expect(a.length + b.length).toBe(1);
  });

  it("stops claiming once a workspace is at its concurrency cap", async () => {
    // The default cap is 2, so the third run stays queued.
    for (let i = 0; i < 3; i++) {
      await runsService.createManualRun(workspaceId, agentId, null);
    }
    const claimed = await runsService.claimDueAgentRuns(10);
    expect(claimed).toHaveLength(2);

    const pending = await db.agentRun.count({
      where: { workspaceId, status: "PENDING" },
    });
    expect(pending).toBe(1);
  });
});

describe("lease handling", () => {
  it("renews a live lease and refuses one that was taken over", async () => {
    await runsService.createManualRun(workspaceId, agentId, null);
    const [claim] = await runsService.claimDueAgentRuns(1);

    expect(await runsService.renewAgentRunLease(claim)).toBe(true);
    expect(
      await runsService.renewAgentRunLease({
        ...claim,
        leaseToken: "someone-else",
      }),
    ).toBe(false);
  });

  it("returns an expired run to the queue so another tick picks it up", async () => {
    await runsService.createManualRun(workspaceId, agentId, null);
    const [claim] = await runsService.claimDueAgentRuns(1);

    const later = new Date(Date.now() + 10 * 60 * 1000);
    expect(await runsService.reclaimStaleAgentRuns(runtimeAt(later))).toBe(1);

    const row = await db.agentRun.findFirstOrThrow({
      where: { id: claim.id },
      select: { status: true, attempts: true, leaseToken: true },
    });
    expect(row).toMatchObject({
      status: "PENDING",
      attempts: 1,
      leaseToken: null,
    });
  });

  it("fails an expired run once its attempts are spent", async () => {
    await runsService.createManualRun(workspaceId, agentId, null);
    const later = new Date(Date.now() + 10 * 60 * 1000);

    // maxAttempts defaults to 2, so the second expiry is terminal. Each step
    // runs on a later clock than the one before: reclaim stamps nextAttemptAt
    // with its own `now`, and the next claim has to be at or after that.
    const evenLater = new Date(later.getTime() + 10 * 60 * 1000);
    await runsService.claimDueAgentRuns(1);
    await runsService.reclaimStaleAgentRuns(runtimeAt(later));
    await runsService.claimDueAgentRuns(1, runtimeAt(later));
    await runsService.reclaimStaleAgentRuns(runtimeAt(evenLater));

    const row = await db.agentRun.findFirstOrThrow({
      where: { workspaceId },
      select: { status: true, lastError: true },
    });
    expect(row.status).toBe("FAILED");
    expect(row.lastError).toContain("lease expired");
  });
});

describe("steps and completion", () => {
  it("appends steps and advances the run's counters together", async () => {
    await runsService.createManualRun(workspaceId, agentId, null);
    const [claim] = await runsService.claimDueAgentRuns(1);

    await runsService.appendStep(claim, {
      index: 0,
      kind: "MODEL_CALL",
      modelText: "thinking",
      promptTokens: 10,
      completionTokens: 5,
      durationMs: 12,
    });
    await runsService.appendStep(claim, {
      index: 1,
      kind: "TOOL_CALL",
      toolName: "logs_search",
      resultText: "[]",
      durationMs: 4,
    });
    await runsService.completeRun(claim, {
      summary: "All quiet.",
      stopReason: "stop",
    });

    const detail = await runsService.getRunDetail(workspaceId, claim.id);
    expect(detail.status).toBe("SUCCEEDED");
    expect(detail.stepCount).toBe(2);
    expect(detail.toolCallCount).toBe(1);
    expect(detail.totalTokens).toBe(15);
    expect(detail.summary).toBe("All quiet.");
    expect(detail.steps.map((step) => step.kind)).toEqual([
      "MODEL_CALL",
      "TOOL_CALL",
    ]);

    const agent = await agentsService.getAgent(workspaceId, agentId);
    expect(agent.lastRunAt).not.toBeNull();
  });

  it("refuses a step from a worker that lost the lease", async () => {
    await runsService.createManualRun(workspaceId, agentId, null);
    const [claim] = await runsService.claimDueAgentRuns(1);

    await expect(
      runsService.appendStep(
        { ...claim, leaseToken: "someone-else" },
        { index: 0, kind: "MODEL_CALL", durationMs: 1 },
      ),
    ).rejects.toBeInstanceOf(runsService.AgentRunLeaseLostError);
  });

  it("keeps a credential a tool echoed back out of the step row", async () => {
    await runsService.createManualRun(workspaceId, agentId, null);
    const [claim] = await runsService.claimDueAgentRuns(1);

    await runsService.appendStep(claim, {
      index: 0,
      kind: "TOOL_CALL",
      toolName: "logs_search",
      resultText: "leaked sk-abcdefgh12345678 and Bearer abcdefgh12345678",
      durationMs: 1,
    });

    const detail = await runsService.getRunDetail(workspaceId, claim.id);
    expect(detail.steps[0].resultText).not.toContain("abcdefgh12345678");
    expect(detail.steps[0].resultText).toContain("sk_***");
    expect(detail.steps[0].resultText).toContain("Bearer ***");
  });

  it("retries a retryable failure and gives up when attempts run out", async () => {
    await runsService.createManualRun(workspaceId, agentId, null);
    const [first] = await runsService.claimDueAgentRuns(1);
    await runsService.failRun(first, {
      message: "rate limited",
      retryable: true,
    });

    let row = await db.agentRun.findFirstOrThrow({
      where: { id: first.id },
      select: { status: true, attempts: true, nextAttemptAt: true },
    });
    expect(row).toMatchObject({ status: "PENDING", attempts: 1 });
    expect(row.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());

    // Its retry is scheduled in the future, so nothing is due right now.
    expect(await runsService.claimDueAgentRuns(1)).toEqual([]);

    const later = new Date(Date.now() + 10 * 60 * 1000);
    const [second] = await runsService.claimDueAgentRuns(1, runtimeAt(later));
    await runsService.failRun(second, {
      message: "rate limited again",
      retryable: true,
    });

    row = await db.agentRun.findFirstOrThrow({
      where: { id: first.id },
      select: { status: true, attempts: true, nextAttemptAt: true },
    });
    expect(row).toMatchObject({ status: "FAILED", attempts: 2 });
  });
});

describe("cancelRun", () => {
  it("cancels a queued run outright", async () => {
    const run = await runsService.createManualRun(workspaceId, agentId, null);
    await runsService.cancelRun(workspaceId, run!.id);

    const detail = await runsService.getRunDetail(workspaceId, run!.id);
    expect(detail.status).toBe("CANCELLED");
    expect(await runsService.claimDueAgentRuns(5)).toEqual([]);
  });

  it("only flags a running one, leaving the runtime to stop it", async () => {
    await runsService.createManualRun(workspaceId, agentId, null);
    const [claim] = await runsService.claimDueAgentRuns(1);

    await runsService.cancelRun(workspaceId, claim.id);

    expect(await runsService.isCancelRequested(claim)).toBe(true);
    const detail = await runsService.getRunDetail(workspaceId, claim.id);
    expect(detail.status).toBe("RUNNING");

    await runsService.markCancelled(claim);
    expect((await runsService.getRunDetail(workspaceId, claim.id)).status).toBe(
      "CANCELLED",
    );
  });

  it("refuses to cancel a finished run", async () => {
    await runsService.createManualRun(workspaceId, agentId, null);
    const [claim] = await runsService.claimDueAgentRuns(1);
    await runsService.completeRun(claim, {
      summary: "done",
      stopReason: "stop",
    });

    await expect(
      runsService.cancelRun(workspaceId, claim.id),
    ).rejects.toBeInstanceOf(runsService.AgentRunNotCancellableError);
  });

  it("does not disclose a run from another workspace", async () => {
    const run = await runsService.createManualRun(workspaceId, agentId, null);
    await expect(
      runsService.getRunDetail(otherWorkspaceId, run!.id),
    ).rejects.toBeInstanceOf(runsService.AgentRunNotFoundError);
    await expect(
      runsService.cancelRun(otherWorkspaceId, run!.id),
    ).rejects.toBeInstanceOf(runsService.AgentRunNotFoundError);
  });
});

describe("history", () => {
  it("keeps a run readable after its agent is deleted", async () => {
    const run = await runsService.createManualRun(workspaceId, agentId, null);
    await agentsService.deleteAgent(workspaceId, agentId);

    const detail = await runsService.getRunDetail(workspaceId, run!.id);
    expect(detail.agentId).toBeNull();
    expect(detail.sourceAgentId).toBe(agentId);
    expect(detail.agentName).toBe("Night watch");
  });

  it("prunes terminal runs older than the window and spares live ones", async () => {
    const finished = await runsService.createManualRun(
      workspaceId,
      agentId,
      null,
    );
    const [claim] = await runsService.claimDueAgentRuns(1);
    await runsService.completeRun(claim, {
      summary: "old",
      stopReason: "stop",
    });
    const pending = await runsService.createManualRun(
      workspaceId,
      agentId,
      null,
    );

    const cutoff = new Date(Date.now() + 60 * 1000);
    // pruneOldRuns takes no workspace: it sweeps the whole database, and the
    // integration database is shared between worktrees, so the count is a
    // floor. The identities below are the actual assertion.
    expect(await runsService.pruneOldRuns(cutoff)).toBeGreaterThanOrEqual(1);

    await expect(
      runsService.getRunDetail(workspaceId, finished!.id),
    ).rejects.toBeInstanceOf(runsService.AgentRunNotFoundError);
    await expect(
      runsService.getRunDetail(workspaceId, pending!.id),
    ).resolves.toMatchObject({ status: "PENDING" });
  });

  // pruneOldRuns is the only deletion the product performs without an operator
  // asking for it, and it runs on a timer inside every container. What the
  // operator authored — the agent, its skills, the join and the schedule — has
  // to outlive it, or a restarted image would quietly empty the section.
  it("leaves the agent, its skills and its schedules standing", async () => {
    const skill = await skillsService.createSkill(workspaceId, {
      name: `Retention probe ${randomUUID()}`,
      description: "Survives the pruner.",
      instructions: "Report only what the logs say.",
    });
    await agentsService.setAgentSkills(workspaceId, agentId, [skill.id]);
    const schedule = await schedulesService.createSchedule(
      workspaceId,
      agentId,
      {
        name: "Hourly",
        kind: "INTERVAL",
        intervalSeconds: 3_600,
        timeZone: "UTC",
      },
    );

    const finished = await runsService.createManualRun(
      workspaceId,
      agentId,
      null,
    );
    const [claim] = await runsService.claimDueAgentRuns(1);
    await runsService.completeRun(claim, {
      summary: "pruned",
      stopReason: "stop",
    });

    expect(
      await runsService.pruneOldRuns(new Date(Date.now() + 60 * 1000)),
    ).toBeGreaterThanOrEqual(1);
    await expect(
      runsService.getRunDetail(workspaceId, finished!.id),
    ).rejects.toBeInstanceOf(runsService.AgentRunNotFoundError);

    const agent = await agentsService.getAgent(workspaceId, agentId);
    expect(agent.skills.map((attached) => attached.id)).toEqual([skill.id]);
    await expect(
      skillsService.getSkill(workspaceId, skill.id),
    ).resolves.toMatchObject({ id: skill.id });
    await expect(
      db.agentSchedule.findUnique({ where: { id: schedule.id } }),
    ).resolves.toMatchObject({ id: schedule.id });
  });
});
