import { Prisma, type ExecutiveBriefPeriod } from "@/generated/prisma/client";
import { z } from "zod";
import { computeNextRunAt } from "@/lib/agents/schedule";
import { db } from "@/lib/db";
import {
  buildExecutiveSnapshot,
  canonicalizeExecutiveSnapshot,
} from "@/lib/management/snapshot";
import { LLM_PROVIDER_TYPES } from "@/lib/providers/registry";
import {
  actionPayload,
  appendDecisionEventTx,
  hashManagementAction,
} from "@/lib/services/management";
import type { PublishExecutiveBriefInput } from "@/lib/validation/management";

export const EXECUTIVE_BRIEF_AGENT_KEY = "management.executive-brief-agent";
export const EXECUTIVE_BRIEF_SKILL_KEY = "management.executive-brief-skill";
export const EXECUTIVE_BRIEF_DAILY_SCHEDULE_KEY =
  "management.executive-brief-daily";
export const EXECUTIVE_BRIEF_WEEKLY_SCHEDULE_KEY =
  "management.executive-brief-weekly";

const BRIEF_INSTRUCTIONS = [
  "Create executive briefs only through the management brief tools.",
  "Read the exact generation snapshot first. Cite only evidence references",
  "contained in that snapshot. Publish a concise brief and optional proposed",
  "decisions; never approve, defer, reject, retry, or execute a decision.",
].join(" ");

export class ExecutiveBriefError extends Error {
  constructor(
    readonly code:
      | "EXECUTIVE_BRIEF_GENERATION_ACTIVE"
      | "EXECUTIVE_BRIEF_GENERATION_NOT_FOUND"
      | "EXECUTIVE_BRIEF_GENERATION_NOT_READY"
      | "EXECUTIVE_BRIEF_EVIDENCE_INVALID"
      | "EXECUTIVE_BRIEF_RUN_LEASE_LOST"
      | "MANAGEMENT_AI_NOT_CONFIGURED"
      | "MANAGEMENT_AI_SETUP_INVALID",
    readonly status: 404 | 409 | 422,
    message: string,
  ) {
    super(message);
  }
}

export type ExecutiveBriefPublishInput = PublishExecutiveBriefInput;

export interface ExecutiveBriefRunLease {
  runId: string;
  agentId: string;
  leaseToken: string;
}

const snapshotItemSchema = z.object({
  ref: z.string(),
  type: z.string(),
  id: z.string(),
  label: z.string(),
  href: z.string(),
  state: z.string().optional(),
  detail: z.string().optional(),
  observedAt: z.string().datetime(),
});

const storedSnapshotSchema = z.object({
  schemaVersion: z.literal(1),
  workspace: z.object({
    id: z.string(),
    name: z.string(),
    timeZone: z.string(),
  }),
  period: z.enum(["DAILY", "WEEKLY"]),
  asOf: z.string().datetime(),
  window: z.object({
    lookbackStart: z.string().datetime(),
    horizonEnd: z.string().datetime(),
  }),
  totals: z.record(z.string(), z.number()),
  sections: z.object({
    alerts: z.array(snapshotItemSchema),
    services: z.array(snapshotItemSchema),
    kanban: z.array(snapshotItemSchema),
    reminders: z.array(snapshotItemSchema),
    calendar: z.array(snapshotItemSchema),
    mail: z.array(snapshotItemSchema),
    messages: z.array(snapshotItemSchema),
    errors: z.array(snapshotItemSchema),
    decisions: z.array(snapshotItemSchema),
    activity: z.array(snapshotItemSchema),
  }),
  truncation: z.array(z.string()),
});

function asSnapshot(value: Prisma.JsonValue) {
  return storedSnapshotSchema.safeParse(value);
}

function setupScheduleInput(period: ExecutiveBriefPeriod, timeZone: string) {
  return period === "DAILY"
    ? {
        name: "Executive brief (daily)",
        kind: "DAILY" as const,
        intervalSeconds: null,
        minuteOfDay: 8 * 60,
        daysOfWeek: [],
        timeZone,
        input: "Create and publish the daily executive brief.",
      }
    : {
        name: "Executive brief (weekly)",
        kind: "WEEKLY" as const,
        intervalSeconds: null,
        minuteOfDay: 8 * 60 + 15,
        daysOfWeek: [1],
        timeZone,
        input: "Create and publish the weekly executive brief.",
      };
}

export async function ensureExecutiveBriefSetup(workspaceId: string) {
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`executive-brief-setup:${workspaceId}`}))`;
    const workspace = await tx.workspace.findUniqueOrThrow({
      where: { id: workspaceId },
      select: { timeZone: true },
    });
    let skill = await tx.skill.findUnique({
      where: {
        workspaceId_systemKey: {
          workspaceId,
          systemKey: EXECUTIVE_BRIEF_SKILL_KEY,
        },
      },
      select: {
        id: true,
        name: true,
        description: true,
        instructions: true,
        toolNames: true,
      },
    });
    if (!skill) {
      skill = await tx.skill.create({
        data: {
          workspaceId,
          systemKey: EXECUTIVE_BRIEF_SKILL_KEY,
          name: "Executive brief workflow",
          normalizedName: "executive brief workflow",
          description: "Produces evidence-bound executive briefs.",
          instructions: BRIEF_INSTRUCTIONS,
          toolNames: ["management_snapshot_get", "management_brief_publish"],
        },
        select: {
          id: true,
          name: true,
          description: true,
          instructions: true,
          toolNames: true,
        },
      });
    }
    let agent = await tx.agent.findUnique({
      where: {
        workspaceId_systemKey: {
          workspaceId,
          systemKey: EXECUTIVE_BRIEF_AGENT_KEY,
        },
      },
      select: {
        id: true,
        name: true,
        instructions: true,
        scopes: true,
        maxSteps: true,
        maxTokens: true,
        timeoutSeconds: true,
      },
    });
    if (!agent) {
      agent = await tx.agent.create({
        data: {
          workspaceId,
          systemKey: EXECUTIVE_BRIEF_AGENT_KEY,
          name: "Executive brief agent",
          normalizedName: "executive brief agent",
          description: "Creates daily and weekly executive briefs.",
          instructions: BRIEF_INSTRUCTIONS,
          scopes: ["management:read", "management:write"],
          maxSteps: 8,
          maxTokens: 20_000,
          timeoutSeconds: 300,
        },
        select: {
          id: true,
          name: true,
          instructions: true,
          scopes: true,
          maxSteps: true,
          maxTokens: true,
          timeoutSeconds: true,
        },
      });
    }
    const attached = await tx.agentSkill.findUnique({
      where: { agentId_skillId: { agentId: agent.id, skillId: skill.id } },
      select: { agentId: true },
    });
    if (!attached) {
      await tx.agentSkill.create({
        data: {
          workspaceId,
          agentId: agent.id,
          agentWorkspaceId: workspaceId,
          skillId: skill.id,
          skillWorkspaceId: workspaceId,
          position: 0,
        },
      });
    }
    const now = new Date();
    for (const period of ["DAILY", "WEEKLY"] as const) {
      const schedule = setupScheduleInput(period, workspace.timeZone);
      const systemKey =
        period === "DAILY"
          ? EXECUTIVE_BRIEF_DAILY_SCHEDULE_KEY
          : EXECUTIVE_BRIEF_WEEKLY_SCHEDULE_KEY;
      const existingSchedule = await tx.agentSchedule.findUnique({
        where: { workspaceId_systemKey: { workspaceId, systemKey } },
        select: { id: true },
      });
      if (!existingSchedule) {
        await tx.agentSchedule.create({
          data: {
            workspaceId,
            agentId: agent.id,
            agentWorkspaceId: workspaceId,
            systemKey,
            ...schedule,
            nextRunAt: computeNextRunAt(schedule, now),
          },
        });
      }
    }
    return { agent, skill };
  });
}

export async function getExecutiveBriefSetupStatus(workspaceId: string) {
  const [agent, skill, daily, weekly, providerCount] = await Promise.all([
    db.agent.findUnique({
      where: {
        workspaceId_systemKey: {
          workspaceId,
          systemKey: EXECUTIVE_BRIEF_AGENT_KEY,
        },
      },
      select: { id: true, name: true, isActive: true, scopes: true },
    }),
    db.skill.findUnique({
      where: {
        workspaceId_systemKey: {
          workspaceId,
          systemKey: EXECUTIVE_BRIEF_SKILL_KEY,
        },
      },
      select: {
        id: true,
        name: true,
        isActive: true,
        toolNames: true,
      },
    }),
    db.agentSchedule.findUnique({
      where: {
        workspaceId_systemKey: {
          workspaceId,
          systemKey: EXECUTIVE_BRIEF_DAILY_SCHEDULE_KEY,
        },
      },
      select: {
        id: true,
        agentId: true,
        name: true,
        minuteOfDay: true,
        timeZone: true,
        isActive: true,
        nextRunAt: true,
      },
    }),
    db.agentSchedule.findUnique({
      where: {
        workspaceId_systemKey: {
          workspaceId,
          systemKey: EXECUTIVE_BRIEF_WEEKLY_SCHEDULE_KEY,
        },
      },
      select: {
        id: true,
        agentId: true,
        name: true,
        minuteOfDay: true,
        timeZone: true,
        isActive: true,
        nextRunAt: true,
      },
    }),
    db.providerCredential.count({
      where: { workspaceId, provider: { in: LLM_PROVIDER_TYPES } },
    }),
  ]);
  const attachment =
    agent && skill
      ? await db.agentSkill.findUnique({
          where: {
            agentId_skillId: { agentId: agent.id, skillId: skill.id },
          },
          select: { agentId: true },
        })
      : null;
  const parts = { agent, skill, attachment, daily, weekly };
  const missing = Object.entries(parts)
    .filter(([, value]) => value === null)
    .map(([key]) => key);
  const edited = [
    agent &&
    (!agent.isActive ||
      !agent.scopes.includes("management:read") ||
      !agent.scopes.includes("management:write"))
      ? "agent"
      : null,
    skill &&
    (!skill.isActive ||
      !skill.toolNames.includes("management_snapshot_get") ||
      !skill.toolNames.includes("management_brief_publish"))
      ? "skill"
      : null,
    daily && (!daily.isActive || daily.agentId !== agent?.id) ? "daily" : null,
    weekly && (!weekly.isActive || weekly.agentId !== agent?.id)
      ? "weekly"
      : null,
  ].filter((value): value is string => value !== null);
  return {
    status: missing.length ? "MISSING" : edited.length ? "EDITED" : "READY",
    missing,
    edited,
    providerConfigured: providerCount > 0,
    agentId: agent?.id ?? null,
    skillId: skill?.id ?? null,
    parts: {
      agent: agent
        ? { id: agent.id, name: agent.name, isActive: agent.isActive }
        : null,
      skill: skill
        ? {
            id: skill.id,
            name: skill.name,
            isActive: skill.isActive,
            toolNames: skill.toolNames,
          }
        : null,
      daily: daily
        ? {
            id: daily.id,
            name: daily.name,
            minuteOfDay: daily.minuteOfDay,
            timeZone: daily.timeZone,
            isActive: daily.isActive,
            nextRunAt: daily.nextRunAt,
          }
        : null,
      weekly: weekly
        ? {
            id: weekly.id,
            name: weekly.name,
            minuteOfDay: weekly.minuteOfDay,
            timeZone: weekly.timeZone,
            isActive: weekly.isActive,
            nextRunAt: weekly.nextRunAt,
          }
        : null,
    },
  };
}

export async function generateExecutiveBriefNow(
  workspaceId: string,
  period: ExecutiveBriefPeriod,
) {
  const hasProvider =
    (await db.providerCredential.count({
      where: { workspaceId, provider: { in: LLM_PROVIDER_TYPES } },
    })) > 0;
  if (!hasProvider) {
    throw new ExecutiveBriefError(
      "MANAGEMENT_AI_NOT_CONFIGURED",
      409,
      "No AI provider is configured for this workspace.",
    );
  }
  const { agent, skill } = await ensureExecutiveBriefSetup(workspaceId);
  const setup = await getExecutiveBriefSetupStatus(workspaceId);
  if (setup.status !== "READY") {
    throw new ExecutiveBriefError(
      "MANAGEMENT_AI_SETUP_INVALID",
      409,
      "The executive brief setup must be repaired in the existing Agent, Skill, or Schedule configuration.",
    );
  }
  const created = await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`executive-brief:${workspaceId}:${period}`}))`;
    const active = await tx.executiveBriefGeneration.findFirst({
      where: {
        workspaceId,
        period,
        status: { in: ["PENDING", "SNAPSHOT_READY"] },
      },
      select: { id: true },
    });
    if (active) return { generation: active, active: true };
    const now = new Date();
    const run = await tx.agentRun.create({
      data: {
        workspaceId,
        agentId: agent.id,
        agentWorkspaceId: workspaceId,
        sourceAgentId: agent.id,
        snapshotAgentName: agent.name,
        snapshotInstructions: agent.instructions,
        snapshotScopes: agent.scopes,
        snapshotSkills: [
          {
            name: skill.name,
            description: skill.description,
            instructions: skill.instructions,
            toolNames: skill.toolNames,
          },
        ],
        snapshotMaxSteps: agent.maxSteps,
        snapshotMaxTokens: agent.maxTokens,
        snapshotTimeoutSeconds: agent.timeoutSeconds,
        input: `Create and publish the ${period.toLowerCase()} executive brief.`,
        trigger: "MANUAL",
        idempotencyKey: `brief:${workspaceId}:${period}:${now.getTime()}`,
        nextAttemptAt: now,
      },
      select: { id: true },
    });
    const generation = await tx.executiveBriefGeneration.create({
      data: {
        workspaceId,
        period,
        status: "PENDING",
        sourceAgentRunId: run.id,
        sourceAgentRunWorkspaceId: workspaceId,
        sourceRunId: run.id,
        sourceAgentId: agent.id,
        sourceAgentName: agent.name,
      },
      select: { id: true, sourceRunId: true, status: true, period: true },
    });
    return { generation, active: false };
  });
  if (!created.active) {
    const { wakeAgentScheduler } =
      await import("@/lib/services/agent-scheduler");
    wakeAgentScheduler();
  }
  return created;
}

export async function createScheduledExecutiveBriefGeneration(
  workspaceId: string,
  agentId: string,
  scheduleId: string,
  period: ExecutiveBriefPeriod,
  occurrence: Date,
) {
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`executive-brief:${workspaceId}:${period}`}))`;
    const agent = await tx.agent.findFirst({
      where: {
        id: agentId,
        workspaceId,
        isActive: true,
        scopes: { hasEvery: ["management:read", "management:write"] },
      },
      select: {
        id: true,
        name: true,
        instructions: true,
        scopes: true,
        maxSteps: true,
        maxTokens: true,
        timeoutSeconds: true,
      },
    });
    if (!agent) return false;
    const skill = await tx.skill.findUnique({
      where: {
        workspaceId_systemKey: {
          workspaceId,
          systemKey: EXECUTIVE_BRIEF_SKILL_KEY,
        },
      },
      select: {
        id: true,
        name: true,
        description: true,
        instructions: true,
        toolNames: true,
        isActive: true,
      },
    });
    if (
      !skill?.isActive ||
      !skill.toolNames.includes("management_snapshot_get") ||
      !skill.toolNames.includes("management_brief_publish")
    ) {
      return false;
    }
    const attached = await tx.agentSkill.findUnique({
      where: { agentId_skillId: { agentId, skillId: skill.id } },
      select: { agentId: true },
    });
    if (!attached) return false;
    const active = await tx.executiveBriefGeneration.findFirst({
      where: {
        workspaceId,
        period,
        status: { in: ["PENDING", "SNAPSHOT_READY"] },
      },
      select: { id: true },
    });
    if (active) return false;
    const run = await tx.agentRun.create({
      data: {
        workspaceId,
        agentId: agent.id,
        agentWorkspaceId: workspaceId,
        sourceAgentId: agent.id,
        scheduleId,
        scheduleWorkspaceId: workspaceId,
        sourceScheduleId: scheduleId,
        snapshotAgentName: agent.name,
        snapshotInstructions: agent.instructions,
        snapshotScopes: agent.scopes,
        snapshotSkills: [
          {
            name: skill.name,
            description: skill.description,
            instructions: skill.instructions,
            toolNames: skill.toolNames,
          },
        ],
        snapshotMaxSteps: agent.maxSteps,
        snapshotMaxTokens: agent.maxTokens,
        snapshotTimeoutSeconds: agent.timeoutSeconds,
        input: `Create and publish the ${period.toLowerCase()} executive brief.`,
        trigger: "SCHEDULE",
        idempotencyKey: `brief:schedule:${scheduleId}:${occurrence.getTime()}`,
        nextAttemptAt: new Date(),
      },
      select: { id: true },
    });
    await tx.executiveBriefGeneration.create({
      data: {
        workspaceId,
        period,
        status: "PENDING",
        sourceAgentRunId: run.id,
        sourceAgentRunWorkspaceId: workspaceId,
        sourceRunId: run.id,
        sourceAgentId: agent.id,
        sourceAgentName: agent.name,
      },
    });
    return true;
  });
}

async function assertExecutiveBriefRunLease(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  lease: ExecutiveBriefRunLease,
) {
  const run = await tx.agentRun.findFirst({
    where: {
      id: lease.runId,
      workspaceId,
      sourceAgentId: lease.agentId,
      status: "RUNNING",
      leaseToken: lease.leaseToken,
      leaseExpiresAt: { gt: new Date() },
    },
    select: { id: true },
  });
  if (!run) {
    throw new ExecutiveBriefError(
      "EXECUTIVE_BRIEF_RUN_LEASE_LOST",
      409,
      "The executive brief run lease is no longer valid.",
    );
  }
}

export async function captureExecutiveBriefSnapshotForRun(
  workspaceId: string,
  lease: ExecutiveBriefRunLease,
  period: ExecutiveBriefPeriod,
) {
  const pending = await db.executiveBriefGeneration.findFirst({
    where: { workspaceId, sourceAgentRunId: lease.runId, period },
    select: { id: true, status: true },
  });
  if (!pending) {
    throw new ExecutiveBriefError(
      "EXECUTIVE_BRIEF_GENERATION_NOT_FOUND",
      404,
      "Executive brief generation not found.",
    );
  }
  if (pending.status === "SNAPSHOT_READY") {
    await db.$transaction((tx) =>
      assertExecutiveBriefRunLease(tx, workspaceId, lease),
    );
    return readExecutiveBriefGenerationForRun(workspaceId, lease.runId);
  }
  if (pending.status !== "PENDING") {
    throw new ExecutiveBriefError(
      "EXECUTIVE_BRIEF_GENERATION_NOT_READY",
      409,
      "This executive brief generation cannot capture a snapshot.",
    );
  }
  const built = await buildExecutiveSnapshot(workspaceId, period);
  const captured = await db.$transaction(async (tx) => {
    await assertExecutiveBriefRunLease(tx, workspaceId, lease);
    return tx.executiveBriefGeneration.updateMany({
      where: { id: pending.id, workspaceId, status: "PENDING" },
      data: {
        status: "SNAPSHOT_READY",
        snapshot: JSON.parse(built.canonical),
        snapshotHash: built.hash,
        snapshotByteLength: built.byteLength,
        snapshotCapturedAt: new Date(built.snapshot.asOf),
      },
    });
  });
  if (captured.count !== 1)
    return readExecutiveBriefGenerationForRun(workspaceId, lease.runId);
  return readExecutiveBriefGenerationForRun(workspaceId, lease.runId);
}

export async function readExecutiveBriefGenerationForRun(
  workspaceId: string,
  sourceRunId: string,
) {
  const generation = await db.executiveBriefGeneration.findFirst({
    where: {
      workspaceId,
      sourceAgentRunId: sourceRunId,
      status: { in: ["PENDING", "SNAPSHOT_READY"] },
    },
    select: { id: true, period: true, snapshot: true, snapshotHash: true },
  });
  if (!generation?.snapshot || !generation.snapshotHash) {
    throw new ExecutiveBriefError(
      "EXECUTIVE_BRIEF_GENERATION_NOT_READY",
      409,
      "This executive brief generation has no publishable snapshot.",
    );
  }
  const parsedSnapshot = asSnapshot(generation.snapshot);
  if (!parsedSnapshot.success) {
    throw new ExecutiveBriefError(
      "EXECUTIVE_BRIEF_GENERATION_NOT_READY",
      409,
      "This executive brief generation has an invalid snapshot.",
    );
  }
  return {
    generationId: generation.id,
    period: generation.period,
    snapshotSha256: generation.snapshotHash,
    snapshot: parsedSnapshot.data,
  };
}

export async function publishExecutiveBriefForRun(
  workspaceId: string,
  lease: ExecutiveBriefRunLease,
  input: ExecutiveBriefPublishInput,
) {
  return db.$transaction(async (tx) => {
    await assertExecutiveBriefRunLease(tx, workspaceId, lease);
    const generation = await tx.executiveBriefGeneration.findFirst({
      where: {
        id: input.generationId,
        workspaceId,
        sourceAgentRunId: lease.runId,
      },
      select: {
        id: true,
        status: true,
        period: true,
        snapshot: true,
        snapshotHash: true,
        sourceRunId: true,
        sourceAgentId: true,
        sourceAgentName: true,
      },
    });
    if (!generation) {
      throw new ExecutiveBriefError(
        "EXECUTIVE_BRIEF_GENERATION_NOT_FOUND",
        404,
        "Executive brief generation not found.",
      );
    }
    if (generation.status === "PUBLISHED") {
      const existing = await tx.executiveBrief.findFirst({
        where: { workspaceId, generationId: generation.id },
        select: { id: true },
      });
      if (existing) return { id: existing.id, generationId: generation.id };
    }
    if (
      generation.status !== "SNAPSHOT_READY" ||
      !generation.snapshot ||
      !generation.snapshotHash
    ) {
      throw new ExecutiveBriefError(
        "EXECUTIVE_BRIEF_GENERATION_NOT_READY",
        409,
        "This executive brief generation is not ready to publish.",
      );
    }
    const parsedSnapshot = asSnapshot(generation.snapshot);
    if (!parsedSnapshot.success) {
      throw new ExecutiveBriefError(
        "EXECUTIVE_BRIEF_GENERATION_NOT_READY",
        409,
        "This executive brief generation has an invalid snapshot.",
      );
    }
    const recomputed = canonicalizeExecutiveSnapshot(parsedSnapshot.data);
    if (
      generation.snapshotHash !== recomputed.hash ||
      input.snapshotSha256 !== generation.snapshotHash
    ) {
      throw new ExecutiveBriefError(
        "EXECUTIVE_BRIEF_EVIDENCE_INVALID",
        422,
        "The submitted snapshot hash does not match this generation.",
      );
    }
    const evidence = new Set(
      Object.values(parsedSnapshot.data.sections).flatMap((items) =>
        items.map((item) => item.ref),
      ),
    );
    const evidenceBoundItems = [
      ...input.highlights,
      ...input.risks,
      ...input.opportunities,
      ...(input.decisions ?? []),
    ];
    for (const evidenceBoundItem of evidenceBoundItems) {
      if (
        evidenceBoundItem.evidenceRefs.some(
          (reference) => !evidence.has(reference),
        )
      ) {
        throw new ExecutiveBriefError(
          "EXECUTIVE_BRIEF_EVIDENCE_INVALID",
          422,
          "The brief cites evidence outside this snapshot.",
        );
      }
    }
    const brief = await tx.executiveBrief.create({
      data: {
        workspaceId,
        generationId: generation.id,
        generationWorkspaceId: workspaceId,
        period: generation.period,
        windowStart: new Date(parsedSnapshot.data.window.lookbackStart),
        windowEnd: new Date(parsedSnapshot.data.window.horizonEnd),
        snapshotAsOf: new Date(parsedSnapshot.data.asOf),
        headline: input.headline,
        summary: input.summary,
        highlights: input.highlights,
        risks: input.risks,
        opportunities: input.opportunities,
        snapshotHash: generation.snapshotHash,
        sourceRunId: generation.sourceRunId,
        sourceAgentId: generation.sourceAgentId,
        sourceAgentName: generation.sourceAgentName,
      },
      select: { id: true },
    });
    for (const proposal of input.decisions ?? []) {
      const decision = await tx.decision.create({
        data: {
          workspaceId,
          briefId: brief.id,
          briefWorkspaceId: workspaceId,
          origin: "EXECUTIVE_BRIEF",
          title: proposal.title,
          context: proposal.context ?? null,
          recommendation: proposal.recommendation ?? null,
          evidenceRefs: proposal.evidenceRefs,
          priority: proposal.priority ?? "MEDIUM",
          dueAt: proposal.dueAt ? new Date(proposal.dueAt) : null,
          actionType: proposal.action?.type ?? null,
          actionPayload: proposal.action
            ? actionPayload(proposal.action)
            : Prisma.DbNull,
          actionRevision: proposal.action ? 1 : 0,
          createdByType: "AGENT",
          createdById: generation.sourceAgentId,
          createdByName: generation.sourceAgentName,
        },
        select: { id: true, workspaceId: true, actionRevision: true },
      });
      await appendDecisionEventTx(tx, decision, {
        type: "CREATED",
        actor: {
          kind: "AGENT",
          id: generation.sourceAgentId,
          name: generation.sourceAgentName,
        },
        toStatus: "OPEN",
        toExecutionStatus: "NONE",
        payloadHash: proposal.action
          ? hashManagementAction(proposal.action)
          : undefined,
      });
    }
    await tx.executiveBriefGeneration.update({
      where: { id_workspaceId: { id: generation.id, workspaceId } },
      data: { status: "PUBLISHED", publishedAt: new Date(), lastError: null },
    });
    return { id: brief.id, generationId: generation.id };
  });
}

export async function finalizeExecutiveBriefGenerationForRun(
  workspaceId: string,
  sourceRunId: string,
  outcome: "FAILED" | "CANCELLED" | "UNPUBLISHED",
) {
  await db.executiveBriefGeneration.updateMany({
    where: {
      workspaceId,
      sourceAgentRunId: sourceRunId,
      status: { in: ["PENDING", "SNAPSHOT_READY"] },
    },
    data: {
      status: outcome === "CANCELLED" ? "CANCELLED" : "FAILED",
      lastError:
        outcome === "UNPUBLISHED"
          ? "Agent completed without publishing an executive brief."
          : outcome === "CANCELLED"
            ? "Agent run was cancelled."
            : "Agent run failed before publishing an executive brief.",
    },
  });
}

export async function listExecutiveBriefs(workspaceId: string) {
  return db.executiveBrief.findMany({
    where: { workspaceId },
    orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
    take: 50,
  });
}

export async function getExecutiveBrief(workspaceId: string, id: string) {
  const brief = await db.executiveBrief.findFirst({
    where: { id, workspaceId },
  });
  if (!brief) {
    throw new ExecutiveBriefError(
      "EXECUTIVE_BRIEF_GENERATION_NOT_FOUND",
      404,
      "Executive brief not found.",
    );
  }
  return brief;
}
