import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import * as agentsService from "@/lib/services/agents";
import * as runsService from "@/lib/services/agent-runs";
import * as schedulesService from "@/lib/services/agent-schedules";

// Materialization. The two properties worth proving are that a single
// occurrence produces exactly one run no matter how many ticks race for it, and
// that a workspace with no model configured still advances instead of piling up
// failed runs forever.

let workspaceId: string;
let unconfiguredWorkspaceId: string;
let agentId: string;
let unconfiguredAgentId: string;

function runtimeAt(now: Date): runsService.AgentRunRuntime {
  return { now: () => now, leaseToken: () => randomUUID() };
}

async function makeWorkspace(slugPrefix: string): Promise<string> {
  const workspace = await db.workspace.create({
    data: {
      name: "Agent schedules test workspace",
      slug: `${slugPrefix}-${randomUUID()}`,
      updatedAt: new Date(),
    },
  });
  return workspace.id;
}

async function giveLlmCredential(id: string): Promise<void> {
  await db.providerCredential.create({
    data: {
      workspaceId: id,
      provider: "OPENAI_COMPATIBLE",
      label: "Mock model",
      encryptedData: "x",
      iv: "x",
      authTag: "x",
      maskedHint: "****",
    },
  });
}

beforeAll(async () => {
  workspaceId = await makeWorkspace("agent-schedules");
  unconfiguredWorkspaceId = await makeWorkspace("agent-schedules-nollm");
  await giveLlmCredential(workspaceId);
});

afterAll(async () => {
  for (const id of [workspaceId, unconfiguredWorkspaceId]) {
    if (id) await db.workspace.delete({ where: { id } }).catch(() => {});
  }
});

beforeEach(async () => {
  const workspaces = { in: [workspaceId, unconfiguredWorkspaceId] };
  await db.agentRun.deleteMany({ where: { workspaceId: workspaces } });
  await db.agentSchedule.deleteMany({ where: { workspaceId: workspaces } });
  await db.agent.deleteMany({ where: { workspaceId: workspaces } });

  agentId = (
    await agentsService.createAgent(workspaceId, {
      name: "Night watch",
      instructions: "Summarize what broke overnight.",
      scopes: ["logs:read"],
    })
  ).id;
  unconfiguredAgentId = (
    await agentsService.createAgent(unconfiguredWorkspaceId, {
      name: "Night watch",
      instructions: "Summarize what broke overnight.",
    })
  ).id;
});

async function makeDueSchedule(
  targetWorkspaceId: string,
  targetAgentId: string,
) {
  const schedule = await schedulesService.createSchedule(
    targetWorkspaceId,
    targetAgentId,
    {
      name: "Hourly",
      kind: "INTERVAL",
      intervalSeconds: 3_600,
      timeZone: "UTC",
      input: "check the logs",
    },
  );
  // Drag the occurrence into the past so this tick sees it as due.
  await db.agentSchedule.update({
    where: { id: schedule.id },
    data: { nextRunAt: new Date(Date.now() - 60_000) },
  });
  return schedule;
}

describe("createSchedule", () => {
  it("computes the first occurrence from the injected clock", async () => {
    const now = new Date("2026-03-01T10:00:00.000Z");
    const schedule = await schedulesService.createSchedule(
      workspaceId,
      agentId,
      {
        name: "Daily 09:00 UTC",
        kind: "DAILY",
        minuteOfDay: 9 * 60,
        timeZone: "UTC",
      },
      runtimeAt(now),
    );
    expect(schedule.nextRunAt.toISOString()).toBe("2026-03-02T09:00:00.000Z");
  });

  it("refuses a schedule for an agent in another workspace", async () => {
    await expect(
      schedulesService.createSchedule(workspaceId, unconfiguredAgentId, {
        name: "Nope",
        kind: "INTERVAL",
        intervalSeconds: 3_600,
        timeZone: "UTC",
      }),
    ).rejects.toBeInstanceOf(agentsService.AgentNotFoundError);
  });

  it("re-dates the occurrence when the recurrence changes, not when the name does", async () => {
    const schedule = await schedulesService.createSchedule(
      workspaceId,
      agentId,
      {
        name: "Hourly",
        kind: "INTERVAL",
        intervalSeconds: 3_600,
        timeZone: "UTC",
      },
      runtimeAt(new Date("2026-03-01T10:00:00.000Z")),
    );

    const renamed = await schedulesService.updateSchedule(
      workspaceId,
      schedule.id,
      { name: "Renamed" },
      runtimeAt(new Date("2026-03-01T12:00:00.000Z")),
    );
    expect(renamed.nextRunAt.getTime()).toBe(schedule.nextRunAt.getTime());

    const retimed = await schedulesService.updateSchedule(
      workspaceId,
      schedule.id,
      { intervalSeconds: 7_200 },
      runtimeAt(new Date("2026-03-01T12:00:00.000Z")),
    );
    expect(retimed.nextRunAt.toISOString()).toBe("2026-03-01T14:00:00.000Z");
  });
});

describe("materializeDueSchedules", () => {
  it("creates one run and moves the occurrence forward", async () => {
    const schedule = await makeDueSchedule(workspaceId, agentId);

    expect(await schedulesService.materializeDueSchedules(10)).toBe(1);

    const runs = await db.agentRun.findMany({ where: { workspaceId } });
    expect(runs).toHaveLength(1);
    expect(runs[0].trigger).toBe("SCHEDULE");
    expect(runs[0].input).toBe("check the logs");
    expect(runs[0].sourceScheduleId).toBe(schedule.id);

    const after = await db.agentSchedule.findFirstOrThrow({
      where: { id: schedule.id },
    });
    expect(after.nextRunAt.getTime()).toBeGreaterThan(Date.now());
    expect(after.lastRunAt).not.toBeNull();

    // Nothing is due any more, so a second sweep is a no-op.
    expect(await schedulesService.materializeDueSchedules(10)).toBe(0);
  });

  it("creates exactly one run when two sweeps race on the same occurrence", async () => {
    await makeDueSchedule(workspaceId, agentId);

    const [a, b] = await Promise.all([
      schedulesService.materializeDueSchedules(10),
      schedulesService.materializeDueSchedules(10),
    ]);

    expect(a + b).toBe(1);
    expect(await db.agentRun.count({ where: { workspaceId } })).toBe(1);
  });

  it("skips an inactive schedule", async () => {
    const schedule = await makeDueSchedule(workspaceId, agentId);
    await schedulesService.updateSchedule(workspaceId, schedule.id, {
      isActive: false,
    });
    // The update left nextRunAt where it was, so only isActive can be the
    // reason nothing fires.
    await db.agentSchedule.update({
      where: { id: schedule.id },
      data: { nextRunAt: new Date(Date.now() - 60_000) },
    });

    expect(await schedulesService.materializeDueSchedules(10)).toBe(0);
    expect(await db.agentRun.count({ where: { workspaceId } })).toBe(0);
  });

  it("advances a workspace with no model configured without queueing a run", async () => {
    const schedule = await makeDueSchedule(
      unconfiguredWorkspaceId,
      unconfiguredAgentId,
    );

    expect(await schedulesService.materializeDueSchedules(10)).toBe(0);
    expect(
      await db.agentRun.count({
        where: { workspaceId: unconfiguredWorkspaceId },
      }),
    ).toBe(0);

    const after = await db.agentSchedule.findFirstOrThrow({
      where: { id: schedule.id },
    });
    expect(after.nextRunAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("keeps sweeping when one agent is paused", async () => {
    await agentsService.updateAgent(workspaceId, agentId, { isActive: false });
    const schedule = await makeDueSchedule(workspaceId, agentId);

    expect(await schedulesService.materializeDueSchedules(10)).toBe(0);

    const after = await db.agentSchedule.findFirstOrThrow({
      where: { id: schedule.id },
    });
    expect(after.nextRunAt.getTime()).toBeGreaterThan(Date.now());
  });
});

describe("deleteSchedule", () => {
  it("removes the schedule and leaves its runs behind", async () => {
    const schedule = await makeDueSchedule(workspaceId, agentId);
    await schedulesService.materializeDueSchedules(10);

    await schedulesService.deleteSchedule(workspaceId, schedule.id);

    const runs = await db.agentRun.findMany({ where: { workspaceId } });
    expect(runs).toHaveLength(1);
    expect(runs[0].scheduleId).toBeNull();
    expect(runs[0].sourceScheduleId).toBe(schedule.id);
  });

  it("does not disclose a schedule from another workspace", async () => {
    const schedule = await makeDueSchedule(
      unconfiguredWorkspaceId,
      unconfiguredAgentId,
    );
    await expect(
      schedulesService.deleteSchedule(workspaceId, schedule.id),
    ).rejects.toBeInstanceOf(schedulesService.AgentScheduleNotFoundError);
  });
});
