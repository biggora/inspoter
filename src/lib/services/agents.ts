import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import {
  normalizeLabelDisplayName,
  normalizeLabelName,
} from "@/lib/label-normalization";
import { parseScopes, type McpScope } from "@/lib/mcp/scopes";
import type {
  AgentCreateInput,
  AgentUpdateInput,
} from "@/lib/validation/agents";

// Sole Prisma caller for Agent and AgentSkill. The attachment table belongs to
// this aggregate rather than to skills.ts: it is the agent's ordered list, and
// the position it carries is the order the skill bodies enter the prompt.
//
// Scopes are stored as plain strings like WebhookToken.scopes, so a value
// written by a newer deployment is dropped on read by parseScopes() instead of
// being handed to the runtime as a permission nobody recognizes.

export const AGENT_LIMIT = 100;

export class AgentNotFoundError extends Error {
  readonly code = "RESOURCE_NOT_FOUND";

  constructor() {
    super("Resource not found.");
    this.name = "AgentNotFoundError";
  }
}

export class AgentNameConflictError extends Error {
  readonly code = "AGENT_NAME_CONFLICT";

  constructor() {
    super("An agent with this name already exists.");
    this.name = "AgentNameConflictError";
  }
}

export class AgentLimitReachedError extends Error {
  readonly code = "AGENT_LIMIT_REACHED";

  constructor() {
    super("Workspace agent limit reached.");
    this.name = "AgentLimitReachedError";
  }
}

// Raised when an attachment names a skill this workspace cannot see. It is a
// plain not-found rather than a "wrong workspace" so the caller learns nothing
// about rows outside its own tenant.
export class SkillNotInWorkspaceError extends Error {
  readonly code = "RESOURCE_NOT_FOUND";

  constructor() {
    super("Resource not found.");
    this.name = "SkillNotInWorkspaceError";
  }
}

export interface AgentAttachedSkill {
  id: string;
  name: string;
  description: string;
  isActive: boolean;
  position: number;
}

export interface AgentSummary {
  id: string;
  name: string;
  description: string | null;
  scopes: McpScope[];
  isActive: boolean;
  reportOnCompletion: boolean;
  skillCount: number;
  lastRunAt: Date | null;
  updatedAt: Date;
}

export interface AgentDetail extends AgentSummary {
  instructions: string;
  maxSteps: number;
  maxTokens: number;
  timeoutSeconds: number;
  skills: AgentAttachedSkill[];
  createdAt: Date;
}

const SUMMARY_SELECT = {
  id: true,
  name: true,
  description: true,
  scopes: true,
  isActive: true,
  reportOnCompletion: true,
  lastRunAt: true,
  updatedAt: true,
  _count: { select: { skills: true } },
} satisfies Prisma.AgentSelect;

const DETAIL_SELECT = {
  ...SUMMARY_SELECT,
  instructions: true,
  maxSteps: true,
  maxTokens: true,
  timeoutSeconds: true,
  createdAt: true,
  skills: {
    select: {
      position: true,
      skill: {
        select: { id: true, name: true, description: true, isActive: true },
      },
    },
    orderBy: [{ position: "asc" }, { skillId: "asc" }],
  },
} satisfies Prisma.AgentSelect;

const ORDER_BY = [
  { normalizedName: "asc" },
  { id: "asc" },
] satisfies Prisma.AgentOrderByWithRelationInput[];

type SummaryRow = Prisma.AgentGetPayload<{ select: typeof SUMMARY_SELECT }>;
type DetailRow = Prisma.AgentGetPayload<{ select: typeof DETAIL_SELECT }>;

function toSummary(row: SummaryRow): AgentSummary {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    scopes: parseScopes(row.scopes),
    isActive: row.isActive,
    reportOnCompletion: row.reportOnCompletion,
    skillCount: row._count.skills,
    lastRunAt: row.lastRunAt,
    updatedAt: row.updatedAt,
  };
}

function toDetail(row: DetailRow): AgentDetail {
  return {
    ...toSummary(row),
    instructions: row.instructions,
    maxSteps: row.maxSteps,
    maxTokens: row.maxTokens,
    timeoutSeconds: row.timeoutSeconds,
    createdAt: row.createdAt,
    skills: row.skills.map((link) => ({
      id: link.skill.id,
      name: link.skill.name,
      description: link.skill.description,
      isActive: link.skill.isActive,
      position: link.position,
    })),
  };
}

export async function listAgents(workspaceId: string): Promise<AgentSummary[]> {
  const rows = await db.agent.findMany({
    where: { workspaceId },
    select: SUMMARY_SELECT,
    orderBy: ORDER_BY,
  });
  return rows.map(toSummary);
}

export async function getAgent(
  workspaceId: string,
  id: string,
): Promise<AgentDetail> {
  const row = await db.agent.findFirst({
    where: { id, workspaceId },
    select: DETAIL_SELECT,
  });
  if (!row) throw new AgentNotFoundError();
  return toDetail(row);
}

export async function createAgent(
  workspaceId: string,
  input: AgentCreateInput,
): Promise<AgentDetail> {
  try {
    const row = await db.$transaction(async (tx) => {
      // Best-effort cap; the unique index on (workspaceId, normalizedName)
      // remains the authoritative guard, same as kanban-labels.ts.
      const count = await tx.agent.count({ where: { workspaceId } });
      if (count >= AGENT_LIMIT) throw new AgentLimitReachedError();

      return await tx.agent.create({
        data: {
          workspaceId,
          name: normalizeLabelDisplayName(input.name),
          normalizedName: normalizeLabelName(input.name),
          description: input.description ?? null,
          instructions: input.instructions,
          scopes: input.scopes ?? [],
          ...(input.maxSteps !== undefined ? { maxSteps: input.maxSteps } : {}),
          ...(input.maxTokens !== undefined
            ? { maxTokens: input.maxTokens }
            : {}),
          ...(input.timeoutSeconds !== undefined
            ? { timeoutSeconds: input.timeoutSeconds }
            : {}),
          ...(input.reportOnCompletion !== undefined
            ? { reportOnCompletion: input.reportOnCompletion }
            : {}),
          ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        },
        select: DETAIL_SELECT,
      });
    });
    return toDetail(row);
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new AgentNameConflictError();
    }
    throw error;
  }
}

export async function updateAgent(
  workspaceId: string,
  id: string,
  input: AgentUpdateInput,
): Promise<AgentDetail> {
  try {
    const row = await db.agent.update({
      where: { id_workspaceId: { id, workspaceId } },
      data: {
        ...(input.name !== undefined
          ? {
              name: normalizeLabelDisplayName(input.name),
              normalizedName: normalizeLabelName(input.name),
            }
          : {}),
        ...(input.description !== undefined
          ? { description: input.description }
          : {}),
        ...(input.instructions !== undefined
          ? { instructions: input.instructions }
          : {}),
        ...(input.scopes !== undefined ? { scopes: input.scopes } : {}),
        ...(input.maxSteps !== undefined ? { maxSteps: input.maxSteps } : {}),
        ...(input.maxTokens !== undefined
          ? { maxTokens: input.maxTokens }
          : {}),
        ...(input.timeoutSeconds !== undefined
          ? { timeoutSeconds: input.timeoutSeconds }
          : {}),
        ...(input.reportOnCompletion !== undefined
          ? { reportOnCompletion: input.reportOnCompletion }
          : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
      select: DETAIL_SELECT,
    });
    return toDetail(row);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2002") throw new AgentNameConflictError();
      if (error.code === "P2025") throw new AgentNotFoundError();
    }
    throw error;
  }
}

// Deleting an agent leaves its runs behind with agentId set to null; the run
// snapshot keeps the history readable. That is the point of the SET NULL in
// the migration, not an oversight.
export async function deleteAgent(
  workspaceId: string,
  id: string,
): Promise<void> {
  try {
    await db.agent.delete({ where: { id_workspaceId: { id, workspaceId } } });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      throw new AgentNotFoundError();
    }
    throw error;
  }
}

/**
 * Replaces the agent's whole skill list. The array order IS the injection
 * order, so replacing the set and reordering it are the same operation — two
 * endpoints would let the two drift apart.
 *
 * A skill id from another workspace simply does not resolve, and the
 * mismatched count is reported as a plain 404 rather than telling the caller
 * which id was foreign.
 */
export async function setAgentSkills(
  workspaceId: string,
  agentId: string,
  skillIds: readonly string[],
): Promise<AgentDetail> {
  const row = await db.$transaction(async (tx) => {
    const agent = await tx.agent.findFirst({
      where: { id: agentId, workspaceId },
      select: { id: true },
    });
    if (!agent) throw new AgentNotFoundError();

    if (skillIds.length > 0) {
      const found = await tx.skill.count({
        where: { workspaceId, id: { in: [...skillIds] } },
      });
      if (found !== skillIds.length) throw new SkillNotInWorkspaceError();
    }

    await tx.agentSkill.deleteMany({ where: { workspaceId, agentId } });
    if (skillIds.length > 0) {
      await tx.agentSkill.createMany({
        data: skillIds.map((skillId, position) => ({
          workspaceId,
          agentId,
          agentWorkspaceId: workspaceId,
          skillId,
          skillWorkspaceId: workspaceId,
          position,
        })),
      });
    }

    return await tx.agent.findFirstOrThrow({
      where: { id: agentId, workspaceId },
      select: DETAIL_SELECT,
    });
  });
  return toDetail(row);
}
