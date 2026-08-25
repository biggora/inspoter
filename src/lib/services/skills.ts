import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import {
  normalizeLabelDisplayName,
  normalizeLabelName,
} from "@/lib/label-normalization";
import type {
  SkillCreateInput,
  SkillUpdateInput,
} from "@/lib/validation/agents";

// Sole Prisma caller for Skill. A skill is a reusable prompt fragment plus an
// optional narrowing of the agent's toolset — never a widening: the agent's
// scopes are the only thing that grants a tool, so a skill that could add one
// would make the agent's Access tab a lie.
//
// The name deliberately does not follow the repo-root skills/inspoter/SKILL.md
// convention beyond its vocabulary: that file is an external Claude skill
// describing Inspoter's API, this is a database row with no filesystem
// counterpart.

export const SKILL_LIMIT = 200;

export class SkillNotFoundError extends Error {
  readonly code = "RESOURCE_NOT_FOUND";

  constructor() {
    super("Resource not found.");
    this.name = "SkillNotFoundError";
  }
}

export class SkillNameConflictError extends Error {
  readonly code = "SKILL_NAME_CONFLICT";

  constructor() {
    super("A skill with this name already exists.");
    this.name = "SkillNameConflictError";
  }
}

export class SkillLimitReachedError extends Error {
  readonly code = "SKILL_LIMIT_REACHED";

  constructor() {
    super("Workspace skill limit reached.");
    this.name = "SkillLimitReachedError";
  }
}

export class SkillToolUnknownError extends Error {
  readonly code = "SKILL_TOOL_UNKNOWN";
  readonly unknownTools: string[];

  constructor(unknownTools: string[]) {
    super(`Unknown tools: ${unknownTools.join(", ")}`);
    this.name = "SkillToolUnknownError";
    this.unknownTools = unknownTools;
  }
}

export interface SkillSummary {
  id: string;
  name: string;
  description: string;
  toolNames: string[];
  isActive: boolean;
  updatedAt: Date;
}

export interface SkillDetail extends SkillSummary {
  instructions: string;
  createdAt: Date;
}

const SUMMARY_SELECT = {
  id: true,
  name: true,
  description: true,
  toolNames: true,
  isActive: true,
  updatedAt: true,
} satisfies Prisma.SkillSelect;

const DETAIL_SELECT = {
  ...SUMMARY_SELECT,
  instructions: true,
  createdAt: true,
} satisfies Prisma.SkillSelect;

const ORDER_BY = [
  { normalizedName: "asc" },
  { id: "asc" },
] satisfies Prisma.SkillOrderByWithRelationInput[];

// A typo in a tool name would silently narrow the agent's toolset to nothing,
// which looks like a broken model rather than a broken skill. Rejecting the
// write is the only place the mistake is still cheap to explain.
//
// The catalogue is imported lazily on purpose: src/lib/mcp/server pulls all
// 109 tools and, through them, most of the service layer. This module is
// reachable from src/lib/api/errors.ts, which every API route imports, so a
// static import here would put that whole graph on the cold-start path of
// routes that have nothing to do with agents.
async function assertToolsExist(toolNames: readonly string[]): Promise<void> {
  if (toolNames.length === 0) return;
  const { findTool } = await import("@/lib/mcp/server");
  const unknown = toolNames.filter((name) => findTool(name) === undefined);
  if (unknown.length > 0) throw new SkillToolUnknownError(unknown);
}

export async function listSkills(workspaceId: string): Promise<SkillSummary[]> {
  return db.skill.findMany({
    where: { workspaceId },
    select: SUMMARY_SELECT,
    orderBy: ORDER_BY,
  });
}

export async function getSkill(
  workspaceId: string,
  id: string,
): Promise<SkillDetail> {
  const skill = await db.skill.findFirst({
    where: { id, workspaceId },
    select: DETAIL_SELECT,
  });
  if (!skill) throw new SkillNotFoundError();
  return skill;
}

export async function createSkill(
  workspaceId: string,
  input: SkillCreateInput,
): Promise<SkillDetail> {
  const toolNames = input.toolNames ?? [];
  await assertToolsExist(toolNames);

  try {
    return await db.$transaction(async (tx) => {
      // Best-effort cap, same trade-off as kanban-labels.ts: concurrent
      // creates may overshoot by a row, and the unique index stays the
      // authoritative correctness guard.
      const count = await tx.skill.count({ where: { workspaceId } });
      if (count >= SKILL_LIMIT) throw new SkillLimitReachedError();

      return await tx.skill.create({
        data: {
          workspaceId,
          name: normalizeLabelDisplayName(input.name),
          normalizedName: normalizeLabelName(input.name),
          description: input.description,
          instructions: input.instructions,
          toolNames,
          ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        },
        select: DETAIL_SELECT,
      });
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new SkillNameConflictError();
    }
    throw error;
  }
}

export async function updateSkill(
  workspaceId: string,
  id: string,
  input: SkillUpdateInput,
): Promise<SkillDetail> {
  if (input.toolNames !== undefined) await assertToolsExist(input.toolNames);

  try {
    return await db.skill.update({
      // Workspace-scoped composite key, so a foreign id is a plain 404 rather
      // than a disclosure that the row exists elsewhere.
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
        ...(input.toolNames !== undefined
          ? { toolNames: input.toolNames }
          : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
      select: DETAIL_SELECT,
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2002") throw new SkillNameConflictError();
      if (error.code === "P2025") throw new SkillNotFoundError();
    }
    throw error;
  }
}

// Detaching from every agent that uses the skill is the cascade's job
// (AgentSkill has ON DELETE CASCADE on both sides), so deleting a skill in use
// is allowed: it removes a prompt fragment, not the agent's permissions.
export async function deleteSkill(
  workspaceId: string,
  id: string,
): Promise<void> {
  try {
    await db.skill.delete({ where: { id_workspaceId: { id, workspaceId } } });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      throw new SkillNotFoundError();
    }
    throw error;
  }
}
