import { randomUUID } from "node:crypto";
import { Prisma, type AgentScheduleKind } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { computeNextRunAt } from "@/lib/agents/schedule";
import { LLM_PROVIDER_TYPES } from "@/lib/providers/registry";
import { AgentNotFoundError } from "@/lib/services/agents";
import { createRun, type AgentRunRuntime } from "@/lib/services/agent-runs";
import {
  createScheduledExecutiveBriefGeneration,
  EXECUTIVE_BRIEF_DAILY_SCHEDULE_KEY,
  EXECUTIVE_BRIEF_WEEKLY_SCHEDULE_KEY,
} from "@/lib/services/executive-briefs";
import type {
  AgentScheduleCreateInput,
  AgentScheduleUpdateInput,
} from "@/lib/validation/agents";

// Sole Prisma caller for AgentSchedule. A schedule owns nothing but its own
// recurrence: firing one materializes an ordinary AgentRun, which the same
// queue the manual button uses then executes.

const DEFAULT_RUNTIME: AgentRunRuntime = {
  now: () => new Date(),
  leaseToken: randomUUID,
};

export class AgentScheduleNotFoundError extends Error {
  readonly code = "RESOURCE_NOT_FOUND";

  constructor() {
    super("Resource not found.");
    this.name = "AgentScheduleNotFoundError";
  }
}

export interface AgentScheduleSummary {
  id: string;
  agentId: string;
  name: string;
  kind: AgentScheduleKind;
  intervalSeconds: number | null;
  minuteOfDay: number | null;
  daysOfWeek: number[];
  timeZone: string;
  input: string | null;
  isActive: boolean;
  nextRunAt: Date;
  lastRunAt: Date | null;
}

const SELECT = {
  id: true,
  agentId: true,
  name: true,
  kind: true,
  intervalSeconds: true,
  minuteOfDay: true,
  daysOfWeek: true,
  timeZone: true,
  input: true,
  isActive: true,
  nextRunAt: true,
  lastRunAt: true,
} satisfies Prisma.AgentScheduleSelect;

export async function listSchedules(
  workspaceId: string,
  agentId: string,
): Promise<AgentScheduleSummary[]> {
  return db.agentSchedule.findMany({
    where: { workspaceId, agentId },
    select: SELECT,
    orderBy: [{ nextRunAt: "asc" }, { id: "asc" }],
  });
}

export async function createSchedule(
  workspaceId: string,
  agentId: string,
  input: AgentScheduleCreateInput,
  runtime: Pick<AgentRunRuntime, "now"> = DEFAULT_RUNTIME,
): Promise<AgentScheduleSummary> {
  const agent = await db.agent.findFirst({
    where: { id: agentId, workspaceId },
    select: { id: true },
  });
  if (!agent) throw new AgentNotFoundError();

  // Stamped from the injected clock, never from a database default: the claim
  // side of the queue filters on Node's clock (fc111d5).
  const nextRunAt = computeNextRunAt(input, runtime.now());

  return db.agentSchedule.create({
    data: {
      workspaceId,
      agentId,
      agentWorkspaceId: workspaceId,
      name: input.name,
      kind: input.kind,
      intervalSeconds: input.intervalSeconds ?? null,
      minuteOfDay: input.minuteOfDay ?? null,
      daysOfWeek: input.daysOfWeek ?? [],
      timeZone: input.timeZone,
      input: input.input ?? null,
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      nextRunAt,
    },
    select: SELECT,
  });
}

export async function updateSchedule(
  workspaceId: string,
  id: string,
  input: AgentScheduleUpdateInput,
  runtime: Pick<AgentRunRuntime, "now"> = DEFAULT_RUNTIME,
): Promise<AgentScheduleSummary> {
  const current = await db.agentSchedule.findFirst({
    where: { id, workspaceId },
    select: SELECT,
  });
  if (!current) throw new AgentScheduleNotFoundError();

  const merged = {
    kind: input.kind ?? current.kind,
    intervalSeconds: input.intervalSeconds ?? current.intervalSeconds,
    minuteOfDay: input.minuteOfDay ?? current.minuteOfDay,
    daysOfWeek: input.daysOfWeek ?? current.daysOfWeek,
    timeZone: input.timeZone ?? current.timeZone,
  };
  // Any change to the recurrence re-dates the next occurrence; a change to the
  // name or the task text leaves it where it was.
  const recurrenceChanged =
    input.kind !== undefined ||
    input.intervalSeconds !== undefined ||
    input.minuteOfDay !== undefined ||
    input.daysOfWeek !== undefined ||
    input.timeZone !== undefined;

  return db.agentSchedule.update({
    where: { id_workspaceId: { id, workspaceId } },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.kind !== undefined ? { kind: input.kind } : {}),
      ...(input.intervalSeconds !== undefined
        ? { intervalSeconds: input.intervalSeconds }
        : {}),
      ...(input.minuteOfDay !== undefined
        ? { minuteOfDay: input.minuteOfDay }
        : {}),
      ...(input.daysOfWeek !== undefined
        ? { daysOfWeek: input.daysOfWeek }
        : {}),
      ...(input.timeZone !== undefined ? { timeZone: input.timeZone } : {}),
      ...(input.input !== undefined ? { input: input.input } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      ...(recurrenceChanged
        ? { nextRunAt: computeNextRunAt(merged, runtime.now()) }
        : {}),
    },
    select: SELECT,
  });
}

export async function deleteSchedule(
  workspaceId: string,
  id: string,
): Promise<void> {
  try {
    await db.agentSchedule.delete({
      where: { id_workspaceId: { id, workspaceId } },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      throw new AgentScheduleNotFoundError();
    }
    throw error;
  }
}

/**
 * Turns every due schedule into at most one PENDING run and moves its
 * `nextRunAt` forward.
 *
 * Both halves are races-safe without a lock. The run's idempotency key is
 * derived from the occurrence being fired, so two ticks that read the same
 * `nextRunAt` build the same key and only one INSERT survives; the advance is
 * guarded on the value that was read, so only the writer whose update changed a
 * row moves the schedule on.
 *
 * A workspace with no LLM credential still advances but creates nothing —
 * otherwise an unconfigured workspace would accrue a failed run every tick,
 * forever.
 */
export async function materializeDueSchedules(
  limit: number,
  runtime: AgentRunRuntime = DEFAULT_RUNTIME,
): Promise<number> {
  const now = runtime.now();
  const due = await db.agentSchedule.findMany({
    where: { isActive: true, nextRunAt: { lte: now } },
    select: {
      id: true,
      workspaceId: true,
      agentId: true,
      kind: true,
      intervalSeconds: true,
      minuteOfDay: true,
      daysOfWeek: true,
      timeZone: true,
      input: true,
      systemKey: true,
      nextRunAt: true,
    },
    orderBy: [{ nextRunAt: "asc" }, { id: "asc" }],
    take: limit,
  });

  // One credential lookup per workspace per tick, not per schedule.
  const configured = new Map<string, boolean>();
  let created = 0;

  for (const schedule of due) {
    const occurrence = schedule.nextRunAt;

    // Advance first, guarded on the value we read: losing this race means
    // another tick already owns the occurrence.
    const advanced = await db.agentSchedule.updateMany({
      where: { id: schedule.id, nextRunAt: occurrence },
      data: {
        nextRunAt: computeNextRunAt(schedule, now),
        lastRunAt: now,
      },
    });
    if (advanced.count !== 1) continue;

    let hasProvider = configured.get(schedule.workspaceId);
    if (hasProvider === undefined) {
      hasProvider =
        (await db.providerCredential.count({
          where: {
            workspaceId: schedule.workspaceId,
            provider: { in: LLM_PROVIDER_TYPES },
          },
        })) > 0;
      configured.set(schedule.workspaceId, hasProvider);
    }
    if (!hasProvider) continue;

    try {
      if (
        schedule.systemKey === EXECUTIVE_BRIEF_DAILY_SCHEDULE_KEY ||
        schedule.systemKey === EXECUTIVE_BRIEF_WEEKLY_SCHEDULE_KEY
      ) {
        const createdGeneration = await createScheduledExecutiveBriefGeneration(
          schedule.workspaceId,
          schedule.agentId,
          schedule.id,
          schedule.systemKey === EXECUTIVE_BRIEF_DAILY_SCHEDULE_KEY
            ? "DAILY"
            : "WEEKLY",
          occurrence,
        );
        if (createdGeneration) created += 1;
        continue;
      }
      const run = await createRun(
        schedule.workspaceId,
        {
          agentId: schedule.agentId,
          trigger: "SCHEDULE",
          scheduleId: schedule.id,
          idempotencyKey: `sched:${schedule.id}:${occurrence.getTime()}`,
          input: schedule.input,
        },
        runtime,
      );
      if (run) created += 1;
    } catch {
      // A paused or deleted agent must not stop the sweep; the schedule has
      // already moved on and the operator can see the agent is paused.
    }
  }

  return created;
}
