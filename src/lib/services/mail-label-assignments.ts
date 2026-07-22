import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";

export class MailLabelAssignmentResourceNotFoundError extends Error {
  readonly code = "RESOURCE_NOT_FOUND";

  constructor() {
    super("Resource not found.");
    this.name = "MailLabelAssignmentResourceNotFoundError";
  }
}

const LABEL_SELECT = {
  id: true,
  name: true,
  color: true,
} satisfies Prisma.MailLabelSelect;

async function loadResources(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  mailItemId: string,
  labelId: string,
) {
  const [mailItem, label] = await Promise.all([
    tx.mailItem.findFirst({
      where: { id: mailItemId, workspaceId },
      select: { id: true },
    }),
    tx.mailLabel.findFirst({
      where: { id: labelId, workspaceId },
      select: LABEL_SELECT,
    }),
  ]);
  if (!mailItem || !label) {
    throw new MailLabelAssignmentResourceNotFoundError();
  }
  return label;
}

export async function assignLabel(
  workspaceId: string,
  mailItemId: string,
  labelId: string,
) {
  try {
    return await db.$transaction(async (tx) => {
      const label = await loadResources(tx, workspaceId, mailItemId, labelId);
      await tx.mailItemLabel.createMany({
        data: [
          {
            workspaceId,
            mailItemId,
            mailItemWorkspaceId: workspaceId,
            labelId,
            labelWorkspaceId: workspaceId,
          },
        ],
        skipDuplicates: true,
      });
      return label;
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === "P2003" || error.code === "P2025")
    ) {
      throw new MailLabelAssignmentResourceNotFoundError();
    }
    throw error;
  }
}

export async function removeLabel(
  workspaceId: string,
  mailItemId: string,
  labelId: string,
): Promise<void> {
  await db.$transaction(async (tx) => {
    await loadResources(tx, workspaceId, mailItemId, labelId);
    await tx.mailItemLabel.deleteMany({
      where: { workspaceId, mailItemId, labelId },
    });
  });
}
