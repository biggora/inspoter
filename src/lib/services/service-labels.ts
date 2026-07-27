import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { parseLabelColor, type LabelColor } from "@/lib/label-color";
import {
  normalizeLabelDisplayName,
  normalizeLabelName,
} from "@/lib/label-normalization";
import { requireWorkspaceMember } from "@/lib/services/workspace-auth";

// Sole Prisma caller for ServiceLabel/ServiceLabelAssignment, modeled on
// src/lib/services/mail-labels.ts. Labels are ordered by normalizedName —
// there is no position column and no reorder UI (see prisma/schema.prisma).

export const SERVICE_LABEL_LIMIT = 100;

export class ServiceLabelNameConflictError extends Error {
  readonly code = "LABEL_NAME_CONFLICT";

  constructor() {
    super("A label with this name already exists.");
    this.name = "ServiceLabelNameConflictError";
  }
}

export class ServiceLabelLimitReachedError extends Error {
  readonly code = "LABEL_LIMIT_REACHED";

  constructor() {
    super("Workspace service label limit reached.");
    this.name = "ServiceLabelLimitReachedError";
  }
}

export class ServiceLabelNotFoundError extends Error {
  readonly code = "RESOURCE_NOT_FOUND";

  constructor() {
    super("Resource not found.");
    this.name = "ServiceLabelNotFoundError";
  }
}

export interface CreateServiceLabelInput {
  name: string;
  color: LabelColor;
}

export interface UpdateServiceLabelInput {
  name?: string;
  color?: LabelColor;
}

export interface ServiceLabelSummary {
  id: string;
  name: string;
  color: LabelColor;
}

export interface ServiceLabelListItem extends ServiceLabelSummary {
  serviceCount: number;
}

const LABEL_SELECT = {
  id: true,
  name: true,
  color: true,
} satisfies Prisma.ServiceLabelSelect;

export const LABEL_ORDER_BY = [
  { normalizedName: "asc" },
  { id: "asc" },
] satisfies Prisma.ServiceLabelOrderByWithRelationInput[];

export async function listLabels(
  workspaceId: string,
): Promise<ServiceLabelListItem[]> {
  const [labels, counts] = await Promise.all([
    db.serviceLabel.findMany({
      where: { workspaceId },
      select: LABEL_SELECT,
      orderBy: LABEL_ORDER_BY,
    }),
    db.serviceLabelAssignment.groupBy({
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
    serviceCount: countsByLabelId.get(label.id) ?? 0,
  }));
}

// Colors are stored as plain text; every write goes through the validated
// schema, so parsing on read only re-narrows the type (same as mail.ts).
export function toSummary(label: {
  id: string;
  name: string;
  color: string;
}): ServiceLabelSummary {
  return { ...label, color: parseLabelColor(label.color) };
}

async function requireLabelInWorkspace(
  workspaceId: string,
  id: string,
): Promise<void> {
  const label = await db.serviceLabel.findFirst({
    where: { id, workspaceId },
    select: { id: true },
  });
  if (!label) throw new ServiceLabelNotFoundError();
}

export async function createLabel(
  workspaceId: string,
  operatorId: string,
  input: CreateServiceLabelInput,
): Promise<ServiceLabelSummary> {
  await requireWorkspaceMember(workspaceId, operatorId);
  const name = normalizeLabelDisplayName(input.name);
  const normalizedName = normalizeLabelName(input.name);
  const color = parseLabelColor(input.color);

  try {
    return await db.$transaction(async (tx) => {
      // Best-effort cap. Unlike the mail cluster this takes no advisory lock,
      // so concurrent creates can overshoot SERVICE_LABEL_LIMIT by a couple
      // of rows — acceptable for a soft UI limit, and the unique index below
      // remains the authoritative correctness guard.
      const count = await tx.serviceLabel.count({ where: { workspaceId } });
      if (count >= SERVICE_LABEL_LIMIT) {
        throw new ServiceLabelLimitReachedError();
      }
      const created = await tx.serviceLabel.create({
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
      throw new ServiceLabelNameConflictError();
    }
    throw error;
  }
}

export async function updateLabel(
  workspaceId: string,
  operatorId: string,
  id: string,
  input: UpdateServiceLabelInput,
): Promise<ServiceLabelSummary> {
  // Resolve workspace scope before the membership check so foreign ids always
  // use the same non-disclosing 404 contract (mirrors mail-labels.ts).
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
    const updated = await db.serviceLabel.update({
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
      if (error.code === "P2002") throw new ServiceLabelNameConflictError();
      if (error.code === "P2025") throw new ServiceLabelNotFoundError();
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
    await db.serviceLabel.delete({
      where: { id_workspaceId: { id, workspaceId } },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      throw new ServiceLabelNotFoundError();
    }
    throw error;
  }
}

// Replace-set used by services.create()/update(). Runs inside the caller's
// transaction so a service write and its label assignments commit together.
export async function setServiceLabels(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  serviceId: string,
  labelIds: string[],
): Promise<void> {
  const wanted = [...new Set(labelIds)];

  if (wanted.length > 0) {
    const found = await tx.serviceLabel.findMany({
      where: { workspaceId, id: { in: wanted } },
      select: { id: true },
    });
    if (found.length !== wanted.length) throw new ServiceLabelNotFoundError();
  }

  await tx.serviceLabelAssignment.deleteMany({
    where: {
      workspaceId,
      serviceId,
      ...(wanted.length > 0 ? { labelId: { notIn: wanted } } : {}),
    },
  });

  if (wanted.length === 0) return;

  await tx.serviceLabelAssignment.createMany({
    data: wanted.map((labelId) => ({
      workspaceId,
      serviceId,
      serviceWorkspaceId: workspaceId,
      labelId,
      labelWorkspaceId: workspaceId,
    })),
    skipDuplicates: true,
  });
}
