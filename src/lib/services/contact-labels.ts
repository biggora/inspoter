import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { parseLabelColor, type LabelColor } from "@/lib/label-color";
import {
  normalizeLabelDisplayName,
  normalizeLabelName,
} from "@/lib/label-normalization";
import { requireWorkspaceMember } from "@/lib/services/workspace-auth";

// Contact labels are Google Contacts' "labels" — the same flat, colored,
// many-to-many grouping mail already has. The shape deliberately mirrors
// src/lib/services/mail-labels.ts so the two label managers behave alike, but
// they stay separate tables: a mail label and a contact label mean different
// things and sharing them would force one vocabulary on both sections.

/**
 * Write gate for both callers. A session caller passes the operator id and
 * must be a member of the workspace; an API-token caller passes null, because
 * the token itself is the workspace-scoped authority (resolved in
 * src/lib/api/token-auth.ts) and there is no operator behind it.
 */
async function requireWriteAccess(
  workspaceId: string,
  operatorId: string | null,
): Promise<void> {
  if (operatorId !== null)
    await requireWorkspaceMember(workspaceId, operatorId);
}

export const CONTACT_LABEL_LIMIT = 100;

export class ContactLabelNameConflictError extends Error {
  readonly code = "LABEL_NAME_CONFLICT";

  constructor() {
    super("A label with this name already exists.");
    this.name = "ContactLabelNameConflictError";
  }
}

export class ContactLabelLimitReachedError extends Error {
  readonly code = "LABEL_LIMIT_REACHED";

  constructor() {
    super("Workspace contact label limit reached.");
    this.name = "ContactLabelLimitReachedError";
  }
}

export class ContactLabelNotFoundError extends Error {
  readonly code = "RESOURCE_NOT_FOUND";

  constructor() {
    super("Resource not found.");
    this.name = "ContactLabelNotFoundError";
  }
}

const LABEL_SELECT = {
  id: true,
  name: true,
  color: true,
  position: true,
} satisfies Prisma.ContactLabelSelect;

export interface ContactLabelSummary {
  id: string;
  name: string;
  color: string;
  position: number;
  contactCount: number;
}

export async function listLabels(
  workspaceId: string,
): Promise<ContactLabelSummary[]> {
  const [labels, counts] = await Promise.all([
    db.contactLabel.findMany({
      where: { workspaceId },
      select: LABEL_SELECT,
      orderBy: [{ position: "asc" }, { id: "asc" }],
    }),
    db.contactLabelAssignment.groupBy({
      by: ["labelId"],
      where: { workspaceId },
      _count: { _all: true },
    }),
  ]);
  const countsByLabelId = new Map(
    counts.map((count) => [count.labelId, count._count._all]),
  );
  return labels.map((label) => ({
    ...label,
    contactCount: countsByLabelId.get(label.id) ?? 0,
  }));
}

export interface CreateContactLabelInput {
  name: string;
  color: LabelColor;
}

export async function createLabel(
  workspaceId: string,
  operatorId: string | null,
  input: CreateContactLabelInput,
) {
  await requireWriteAccess(workspaceId, operatorId);
  const name = normalizeLabelDisplayName(input.name);
  const normalizedName = normalizeLabelName(input.name);
  const color = parseLabelColor(input.color);

  try {
    return await db.$transaction(async (tx) => {
      const count = await tx.contactLabel.count({ where: { workspaceId } });
      if (count >= CONTACT_LABEL_LIMIT) {
        throw new ContactLabelLimitReachedError();
      }
      const last = await tx.contactLabel.aggregate({
        where: { workspaceId },
        _max: { position: true },
      });
      return tx.contactLabel.create({
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
    throw translatePrismaError(error);
  }
}

export interface UpdateContactLabelInput {
  name?: string;
  color?: LabelColor;
}

export async function updateLabel(
  workspaceId: string,
  operatorId: string | null,
  id: string,
  input: UpdateContactLabelInput,
) {
  // Workspace scope resolves before membership so a foreign id always gets the
  // same non-disclosing 404 — same contract as mail labels.
  await requireLabelInWorkspace(workspaceId, id);
  await requireWriteAccess(workspaceId, operatorId);

  try {
    return await db.contactLabel.update({
      where: { id_workspaceId: { id, workspaceId } },
      data: {
        ...(input.name === undefined
          ? {}
          : {
              name: normalizeLabelDisplayName(input.name),
              normalizedName: normalizeLabelName(input.name),
            }),
        ...(input.color === undefined
          ? {}
          : { color: parseLabelColor(input.color) }),
      },
      select: LABEL_SELECT,
    });
  } catch (error) {
    throw translatePrismaError(error);
  }
}

export async function deleteLabel(
  workspaceId: string,
  operatorId: string | null,
  id: string,
): Promise<void> {
  await requireLabelInWorkspace(workspaceId, id);
  await requireWriteAccess(workspaceId, operatorId);

  try {
    // Assignments cascade; the contacts themselves are untouched, which is
    // what "remove this label" has to mean.
    await db.contactLabel.delete({
      where: { id_workspaceId: { id, workspaceId } },
    });
  } catch (error) {
    throw translatePrismaError(error);
  }
}

async function requireLabelInWorkspace(
  workspaceId: string,
  id: string,
): Promise<void> {
  const label = await db.contactLabel.findFirst({
    where: { id, workspaceId },
    select: { id: true },
  });
  if (!label) throw new ContactLabelNotFoundError();
}

/**
 * Resolves label names to ids, creating the ones that do not exist yet. This
 * is what makes an import that carries `CATEGORIES:Work,Family` land on the
 * workspace's own labels instead of inventing a parallel vocabulary.
 */
export async function resolveLabelIds(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  names: readonly string[],
): Promise<string[]> {
  const wanted = new Map<string, string>();
  for (const name of names) {
    const normalized = normalizeLabelName(name);
    if (normalized.length > 0 && !wanted.has(normalized)) {
      wanted.set(normalized, normalizeLabelDisplayName(name));
    }
  }
  if (wanted.size === 0) return [];

  const existing = await tx.contactLabel.findMany({
    where: { workspaceId, normalizedName: { in: [...wanted.keys()] } },
    select: { id: true, normalizedName: true },
  });
  const idsByNormalized = new Map(
    existing.map((label) => [label.normalizedName, label.id]),
  );

  const missing = [...wanted].filter(
    ([normalized]) => !idsByNormalized.has(normalized),
  );
  if (missing.length > 0) {
    const total = await tx.contactLabel.count({ where: { workspaceId } });
    if (total + missing.length > CONTACT_LABEL_LIMIT) {
      throw new ContactLabelLimitReachedError();
    }
    const last = await tx.contactLabel.aggregate({
      where: { workspaceId },
      _max: { position: true },
    });
    let position = (last._max.position ?? -1) + 1;
    for (const [normalizedName, name] of missing) {
      const created = await tx.contactLabel.create({
        data: {
          workspaceId,
          name,
          normalizedName,
          // Imported labels have no color of their own; the neutral preset
          // keeps the list readable until an operator picks one.
          color: "SLATE",
          position: position++,
        },
        select: { id: true },
      });
      idsByNormalized.set(normalizedName, created.id);
    }
  }

  return [...wanted.keys()].map((normalized) =>
    idsByNormalized.get(normalized)!,
  );
}

function translatePrismaError(error: unknown): unknown {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") return new ContactLabelNameConflictError();
    if (error.code === "P2025") return new ContactLabelNotFoundError();
  }
  return error;
}
