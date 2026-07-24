import {
  Prisma,
  type MailSpecialUse,
  type MailItem,
} from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { matchingMailFilterLabelIds } from "@/lib/mail-filter-matcher";
import {
  runMailAccountTransaction,
  type MailAccountTransactionRunner,
} from "@/lib/services/mail-locks";

export interface PersistMailAttachmentInput {
  partId?: string | null;
  filename: string;
  contentType: string;
  sizeBytes: number;
  contentId?: string | null;
  isInline?: boolean;
}

export interface PersistIncomingMailInput {
  workspaceId: string;
  accountId: string;
  folderId: string;
  folderSpecialUse: MailSpecialUse;
  uid?: bigint | null;
  messageId?: string | null;
  fromAddress: string;
  fromName?: string | null;
  toRecipients?: Prisma.InputJsonValue;
  ccRecipients?: Prisma.InputJsonValue;
  bccRecipients?: Prisma.InputJsonValue;
  replyToAddress?: string | null;
  subject: string;
  bodyText: string;
  bodyHtml?: string | null;
  snippet?: string | null;
  isRead?: boolean;
  isAnswered?: boolean;
  isFlagged?: boolean;
  receivedAt?: Date;
  attachments?: readonly PersistMailAttachmentInput[];
}

export async function persistIncomingMail(
  input: PersistIncomingMailInput,
  runAccountTransaction: MailAccountTransactionRunner = runMailAccountTransaction,
): Promise<MailItem> {
  const eligible = input.folderSpecialUse === "INBOX";
  const persist = async (tx: Prisma.TransactionClient) => {
    const rules = eligible
      ? await tx.mailFilterRule.findMany({
          where: {
            workspaceId: input.workspaceId,
            accountId: input.accountId,
            isActive: true,
          },
          select: {
            fromAddress: true,
            subjectContains: true,
            labelId: true,
          },
          orderBy: [{ position: "asc" }, { id: "asc" }],
        })
      : [];

    const attachments = input.attachments ?? [];
    const item = await tx.mailItem.create({
      data: {
        workspaceId: input.workspaceId,
        accountId: input.accountId,
        accountWorkspaceId: input.workspaceId,
        folderId: input.folderId,
        folderWorkspaceId: input.workspaceId,
        uid: input.uid,
        messageId: input.messageId,
        fromAddress: input.fromAddress,
        fromName: input.fromName,
        toRecipients: input.toRecipients,
        ccRecipients: input.ccRecipients,
        bccRecipients: input.bccRecipients,
        replyToAddress: input.replyToAddress,
        subject: input.subject,
        bodyText: input.bodyText,
        bodyHtml: input.bodyHtml,
        snippet: input.snippet,
        isRead: input.isRead ?? false,
        isAnswered: input.isAnswered ?? false,
        isFlagged: input.isFlagged ?? false,
        hasAttachments: attachments.length > 0,
        receivedAt: input.receivedAt,
        ...(attachments.length > 0
          ? {
              attachments: {
                createMany: { data: attachments.map((item) => ({ ...item })) },
              },
            }
          : {}),
      },
    });

    const labelIds = matchingMailFilterLabelIds(rules, {
      fromAddress: input.fromAddress,
      subject: input.subject,
    });
    if (labelIds.length > 0) {
      await tx.mailItemLabel.createMany({
        data: labelIds.map((labelId) => ({
          workspaceId: input.workspaceId,
          mailItemId: item.id,
          mailItemWorkspaceId: input.workspaceId,
          labelId,
          labelWorkspaceId: input.workspaceId,
        })),
        skipDuplicates: true,
      });
    }

    return item;
  };

  return eligible
    ? runAccountTransaction(input.accountId, persist)
    : db.$transaction(persist);
}
