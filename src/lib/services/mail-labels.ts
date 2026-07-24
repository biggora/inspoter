import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import {
  parseMailLabelColor,
  type MailLabelColor,
} from "@/lib/mail-label-color";
import {
  normalizeMailLabelDisplayName,
  normalizeMailLabelName,
} from "@/lib/mail-label-normalization";
import { acquireMailAdvisoryLock } from "@/lib/services/mail-locks";
import { requireWorkspaceMember } from "@/lib/services/workspace-auth";

export const MAIL_LABEL_LIMIT = 100;

export class MailLabelNameConflictError extends Error {
  readonly code = "LABEL_NAME_CONFLICT";

  constructor() {
    super("A label with this name already exists.");
    this.name = "MailLabelNameConflictError";
  }
}

export class MailLabelLimitReachedError extends Error {
  readonly code = "LABEL_LIMIT_REACHED";

  constructor() {
    super("Workspace label limit reached.");
    this.name = "MailLabelLimitReachedError";
  }
}

export class MailLabelResourceNotFoundError extends Error {
  readonly code = "RESOURCE_NOT_FOUND";

  constructor() {
    super("Resource not found.");
    this.name = "MailLabelResourceNotFoundError";
  }
}

export class MailLabelInUseError extends Error {
  readonly code = "LABEL_IN_USE";

  constructor() {
    super("The label is referenced by a filter rule.");
    this.name = "MailLabelInUseError";
  }
}

export interface CreateMailLabelInput {
  name: string;
  color: MailLabelColor;
}

export interface UpdateMailLabelInput {
  name?: string;
  color?: MailLabelColor;
  position?: number;
}

const LABEL_SELECT = {
  id: true,
  name: true,
  color: true,
  position: true,
} satisfies Prisma.MailLabelSelect;

export interface ListMailLabelsScope {
  accountId: string;
  folderId: string;
}

export async function listLabels(
  workspaceId: string,
  scope?: ListMailLabelsScope,
) {
  const [labels, counts] = await Promise.all([
    db.mailLabel.findMany({
      where: { workspaceId },
      select: LABEL_SELECT,
      orderBy: [{ position: "asc" }, { id: "asc" }],
    }),
    db.mailItemLabel.groupBy({
      by: ["labelId"],
      where: {
        workspaceId,
        ...(scope
          ? {
              mailItem: {
                is: {
                  workspaceId,
                  accountId: scope.accountId,
                  folderId: scope.folderId,
                },
              },
            }
          : {}),
      },
      _count: { _all: true },
    }),
  ]);
  const countsByLabelId = new Map(
    counts.map((count) => [count.labelId, count._count._all]),
  );
  return labels.map((label) => ({
    ...label,
    messageCount: countsByLabelId.get(label.id) ?? 0,
  }));
}

async function requireLabelInWorkspace(
  workspaceId: string,
  id: string,
): Promise<void> {
  const label = await db.mailLabel.findFirst({
    where: { id, workspaceId },
    select: { id: true },
  });
  if (!label) throw new MailLabelResourceNotFoundError();
}

export async function createLabel(
  workspaceId: string,
  operatorId: string,
  input: CreateMailLabelInput,
) {
  await requireWorkspaceMember(workspaceId, operatorId);
  const name = normalizeMailLabelDisplayName(input.name);
  const normalizedName = normalizeMailLabelName(input.name);
  const color = parseMailLabelColor(input.color);

  try {
    return await db.$transaction(async (tx) => {
      await acquireMailAdvisoryLock(tx, "workspace-labels", workspaceId);
      const count = await tx.mailLabel.count({ where: { workspaceId } });
      if (count >= MAIL_LABEL_LIMIT) {
        throw new MailLabelLimitReachedError();
      }
      const last = await tx.mailLabel.aggregate({
        where: { workspaceId },
        _max: { position: true },
      });
      return tx.mailLabel.create({
        data: {
          workspaceId,
          name,
          normalizedName,
          color,
          position: (last._max.position ?? -1) + 1,
        },
        select: LABEL_SELECT,
      });
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new MailLabelNameConflictError();
    }
    throw error;
  }
}

export async function updateLabel(
  workspaceId: string,
  operatorId: string,
  id: string,
  input: UpdateMailLabelInput,
) {
  // Resolve workspace scope before the membership check so foreign ids always
  // use the same non-disclosing 404 contract.
  await requireLabelInWorkspace(workspaceId, id);
  await requireWorkspaceMember(workspaceId, operatorId);

  const name =
    input.name === undefined
      ? undefined
      : normalizeMailLabelDisplayName(input.name);
  const normalizedName =
    input.name === undefined ? undefined : normalizeMailLabelName(input.name);
  const color =
    input.color === undefined ? undefined : parseMailLabelColor(input.color);

  try {
    return await db.$transaction(async (tx) => {
      await acquireMailAdvisoryLock(tx, "workspace-labels", workspaceId);
      const current = await tx.mailLabel.findFirst({
        where: { id, workspaceId },
        select: { id: true },
      });
      if (!current) throw new MailLabelResourceNotFoundError();

      let position: number | undefined;
      if (input.position !== undefined) {
        const labels = await tx.mailLabel.findMany({
          where: { workspaceId },
          select: { id: true },
          orderBy: [{ position: "asc" }, { id: "asc" }],
        });
        const orderedIds = labels
          .filter((label) => label.id !== id)
          .map((label) => label.id);
        position = Math.min(input.position, orderedIds.length);
        orderedIds.splice(position, 0, id);
        await Promise.all(
          orderedIds.map((labelId, index) =>
            tx.mailLabel.update({
              where: {
                id_workspaceId: { id: labelId, workspaceId },
              },
              data: { position: index },
            }),
          ),
        );
      }

      return tx.mailLabel.update({
        where: { id_workspaceId: { id, workspaceId } },
        data: {
          ...(name !== undefined ? { name, normalizedName } : {}),
          ...(color !== undefined ? { color } : {}),
          ...(position !== undefined ? { position } : {}),
        },
        select: LABEL_SELECT,
      });
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2002") throw new MailLabelNameConflictError();
      if (error.code === "P2025") throw new MailLabelResourceNotFoundError();
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
    await db.$transaction(async (tx) => {
      await acquireMailAdvisoryLock(tx, "workspace-labels", workspaceId);
      const label = await tx.mailLabel.findFirst({
        where: { id, workspaceId },
        select: { id: true },
      });
      if (!label) throw new MailLabelResourceNotFoundError();

      const ruleReference = await tx.mailFilterRule.findFirst({
        where: { workspaceId, labelId: id },
        select: { id: true },
      });
      if (ruleReference) throw new MailLabelInUseError();

      const activeRun = await tx.mailFilterRun.findFirst({
        where: {
          workspaceId,
          snapshotLabelId: id,
          status: { in: ["PENDING", "RUNNING"] },
        },
        select: { id: true },
      });
      if (activeRun) throw new MailLabelInUseError();

      await tx.mailLabel.delete({
        where: { id_workspaceId: { id, workspaceId } },
      });
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2003"
    ) {
      // A rule may be inserted after the explicit check. The restrictive FK
      // remains the authoritative race-safe guard.
      throw new MailLabelInUseError();
    }
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      throw new MailLabelResourceNotFoundError();
    }
    throw error;
  }
}
