import { publishIndicatorChange } from "@/lib/services/indicator-events";
import {
  Prisma,
  type MailSpecialUse,
  type MailItem,
} from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { matchesMailFilterRule } from "@/lib/mail-filter-matcher";
import { enqueueMailFilterActionJobs } from "@/lib/services/mail-filter-action-jobs";
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
  bodyTruncated?: boolean;
  sourceSizeBytes?: bigint | null;
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
            id: true,
            fromAddress: true,
            subjectContains: true,
            matchMode: true,
            conditions: {
              select: {
                field: true,
                operator: true,
                value: true,
                isNegated: true,
              },
              orderBy: [{ position: "asc" }, { id: "asc" }],
            },
            labelId: true,
            setRead: true,
            moveToFolderId: true,
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
        bodyTruncated: input.bodyTruncated ?? false,
        sourceSizeBytes: input.sourceSizeBytes,
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

    const candidate = {
      fromAddress: input.fromAddress,
      toRecipients: input.toRecipients,
      ccRecipients: input.ccRecipients,
      bccRecipients: input.bccRecipients,
      subject: input.subject,
      bodyText: input.bodyText,
      hasAttachments: attachments.length > 0,
    };
    const matchedRules = rules.filter((rule) =>
      matchesMailFilterRule(rule, candidate),
    );
    const labelIds = [...new Set(matchedRules.map((rule) => rule.labelId))];
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
    for (const rule of matchedRules) {
      await enqueueMailFilterActionJobs(tx, {
        workspaceId: input.workspaceId,
        accountId: input.accountId,
        mailItemId: item.id,
        sourceRuleId: rule.id,
        setRead: rule.setRead,
        moveToFolderId: rule.moveToFolderId,
        currentIsRead: item.isRead,
        currentFolderId: item.folderId,
      });
    }

    return item;
  };

  const item = eligible
    ? await runAccountTransaction(input.accountId, persist)
    : await db.$transaction(persist);

  // The single seam for incoming mail: both the webhook receipt path and the
  // mail sync scheduler go through here, so one publish covers both and the
  // topbar badge moves without the operator doing anything.
  publishIndicatorChange(input.workspaceId, "mail");
  return item;
}
