import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { parseLabelColor, type LabelColor } from "@/lib/label-color";
import {
  normalizeLabelDisplayName,
  normalizeLabelName,
} from "@/lib/label-normalization";
import { requireWorkspaceMember } from "@/lib/services/workspace-auth";

// Sole Prisma caller for KanbanLabel. A direct sibling of
// src/lib/services/service-labels.ts — same normalization, same conflict
// contract, same ordering by normalizedName (no position column, no reorder
// UI). Assignments themselves are written by kanban.ts inside the card
// transaction, so a card write and its labels commit together.

export const KANBAN_LABEL_LIMIT = 100;

export class KanbanLabelNameConflictError extends Error {
  readonly code = "LABEL_NAME_CONFLICT";

  constructor() {
    super("A label with this name already exists.");
    this.name = "KanbanLabelNameConflictError";
  }
}

export class KanbanLabelLimitReachedError extends Error {
  readonly code = "LABEL_LIMIT_REACHED";

  constructor() {
    super("Workspace kanban label limit reached.");
    this.name = "KanbanLabelLimitReachedError";
  }
}

export class KanbanLabelNotFoundError extends Error {
  readonly code = "RESOURCE_NOT_FOUND";

  constructor() {
    super("Resource not found.");
    this.name = "KanbanLabelNotFoundError";
  }
}

export interface KanbanLabelSummary {
  id: string;
  name: string;
  color: LabelColor;
}

export interface KanbanLabelListItem extends KanbanLabelSummary {
  cardCount: number;
}

export interface CreateKanbanLabelInput {
  name: string;
  color: LabelColor;
}

export interface UpdateKanbanLabelInput {
  name?: string;
  color?: LabelColor;
}

const LABEL_SELECT = {
  id: true,
  name: true,
  color: true,
} satisfies Prisma.KanbanLabelSelect;

const LABEL_ORDER_BY = [
  { normalizedName: "asc" },
  { id: "asc" },
] satisfies Prisma.KanbanLabelOrderByWithRelationInput[];

// Colors are stored as plain text; every write goes through the validated
// schema, so parsing on read only re-narrows the type.
export function toSummary(label: {
  id: string;
  name: string;
  color: string;
}): KanbanLabelSummary {
  return { ...label, color: parseLabelColor(label.color) };
}

export async function listLabels(
  workspaceId: string,
): Promise<KanbanLabelListItem[]> {
  const [labels, counts] = await Promise.all([
    db.kanbanLabel.findMany({
      where: { workspaceId },
      select: LABEL_SELECT,
      orderBy: LABEL_ORDER_BY,
    }),
    db.kanbanCardLabel.groupBy({
      by: ["labelId"],
      where: { workspaceId },
      _count: { _all: true },
    }),
  ]);
  const countsByLabelId = new Map(
    counts.map((count) => [count.labelId, count._count._all]),
  );
  return labels.map((label) => ({
    ...toSummary(label),
    cardCount: countsByLabelId.get(label.id) ?? 0,
  }));
}

async function requireLabelInWorkspace(
  workspaceId: string,
  id: string,
): Promise<void> {
  const label = await db.kanbanLabel.findFirst({
    where: { id, workspaceId },
    select: { id: true },
  });
  if (!label) throw new KanbanLabelNotFoundError();
}

export async function createLabel(
  workspaceId: string,
  operatorId: string,
  input: CreateKanbanLabelInput,
): Promise<KanbanLabelSummary> {
  await requireWorkspaceMember(workspaceId, operatorId);
  const name = normalizeLabelDisplayName(input.name);
  const normalizedName = normalizeLabelName(input.name);
  const color = parseLabelColor(input.color);

  try {
    return await db.$transaction(async (tx) => {
      // Best-effort cap, same trade-off as service-labels.ts: concurrent
      // creates may overshoot by a row or two, and the unique index below
      // stays the authoritative correctness guard.
      const count = await tx.kanbanLabel.count({ where: { workspaceId } });
      if (count >= KANBAN_LABEL_LIMIT) {
        throw new KanbanLabelLimitReachedError();
      }
      const created = await tx.kanbanLabel.create({
        data: { workspaceId, name, normalizedName, color },
        select: LABEL_SELECT,
      });
      return toSummary(created);
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new KanbanLabelNameConflictError();
    }
    throw error;
  }
}

export async function updateLabel(
  workspaceId: string,
  operatorId: string,
  id: string,
  input: UpdateKanbanLabelInput,
): Promise<KanbanLabelSummary> {
  // Workspace scope first, so a foreign id always gets the same
  // non-disclosing 404 regardless of the caller's role.
  await requireLabelInWorkspace(workspaceId, id);
  await requireWorkspaceMember(workspaceId, operatorId);

  const name =
    input.name === undefined
      ? undefined
      : normalizeLabelDisplayName(input.name);
  const normalizedName =
    input.name === undefined ? undefined : normalizeLabelName(input.name);
  const color =
    input.color === undefined ? undefined : parseLabelColor(input.color);

  try {
    const updated = await db.kanbanLabel.update({
      where: { id_workspaceId: { id, workspaceId } },
      data: {
        ...(name !== undefined ? { name, normalizedName } : {}),
        ...(color !== undefined ? { color } : {}),
      },
      select: LABEL_SELECT,
    });
    return toSummary(updated);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2002") throw new KanbanLabelNameConflictError();
      if (error.code === "P2025") throw new KanbanLabelNotFoundError();
    }
    throw error;
  }
}

export async function deleteLabel(
  workspaceId: string,
  operatorId: string,
  id: string,
): Promise<void> {
  await requireLabelInWorkspace(workspaceId, id);
  await requireWorkspaceMember(workspaceId, operatorId);

  try {
    await db.kanbanLabel.delete({
      where: { id_workspaceId: { id, workspaceId } },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      throw new KanbanLabelNotFoundError();
    }
    throw error;
  }
}
