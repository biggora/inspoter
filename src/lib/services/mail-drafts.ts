import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { env } from "@/lib/config/env";
import { sanitizeOutgoingMailHtml } from "@/lib/mail-message-content";
import { MailAccountNotFoundError } from "@/lib/services/mail-accounts";
import {
  runMailAccountTransaction,
  type MailAccountTransactionRunner,
} from "@/lib/services/mail-locks";
import mailMessages from "@/messages/ru/mail.json";

const MAX_DRAFT_ATTACHMENTS = 10;
const MAX_DRAFT_TOTAL_ATTACHMENT_BYTES = 52_428_800;

const DRAFT_INCLUDE = {
  attachments: {
    select: {
      id: true,
      filename: true,
      contentType: true,
      sizeBytes: true,
    },
    orderBy: { createdAt: "asc" },
  },
} satisfies Prisma.MailItemInclude;

type DraftRow = Prisma.MailItemGetPayload<{ include: typeof DRAFT_INCLUDE }>;

export class MailDraftNotFoundError extends Error {
  constructor(id: string) {
    super(`Mail draft not found: ${id}`);
    this.name = "MailDraftNotFoundError";
  }
}

export class MailDraftFolderUnavailableError extends Error {
  constructor() {
    super(mailMessages.errorDraftFolderUnavailable);
    this.name = "MailDraftFolderUnavailableError";
  }
}

export class MailDraftContextNotFoundError extends Error {
  constructor(id: string) {
    super(`Mail draft context not found: ${id}`);
    this.name = "MailDraftContextNotFoundError";
  }
}

export class MailDraftAttachmentLimitError extends Error {
  constructor() {
    super(mailMessages.errorDraftAttachmentLimit);
    this.name = "MailDraftAttachmentLimitError";
  }
}

export class MailDraftAttachmentTooLargeError extends Error {
  constructor() {
    super(mailMessages.errorDraftAttachmentTooLarge);
    this.name = "MailDraftAttachmentTooLargeError";
  }
}

export interface MailDraftAttachmentDto {
  id: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
}

export interface MailDraftDto {
  id: string;
  accountId: string;
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  bodyText: string;
  bodyHtml: string;
  inReplyToId: string | null;
  forwardOfId: string | null;
  updatedAt: Date;
  attachments: MailDraftAttachmentDto[];
}

export interface SaveMailDraftData {
  draftId?: string;
  accountId: string;
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  bodyText: string;
  bodyHtml: string;
  inReplyToId?: string;
  forwardOfId?: string;
}

export interface UploadMailDraftAttachmentData {
  filename: string;
  contentType: string;
  content: Buffer;
}

function jsonAddresses(addresses: readonly string[]): Prisma.InputJsonValue {
  return addresses.map((address) => ({ name: null, address }));
}

function parseAddresses(value: Prisma.JsonValue | null): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      return [];
    }
    const address = (entry as Record<string, unknown>).address;
    return typeof address === "string" ? [address] : [];
  });
}

function toDraftDto(row: DraftRow): MailDraftDto {
  return {
    id: row.id,
    accountId: row.accountId,
    to: parseAddresses(row.toRecipients),
    cc: parseAddresses(row.ccRecipients),
    bcc: parseAddresses(row.bccRecipients),
    subject: row.subject,
    bodyText: row.bodyText,
    bodyHtml: row.bodyHtml ?? "<p></p>",
    inReplyToId: row.draftReplyToId,
    forwardOfId: row.draftForwardOfId,
    updatedAt: row.receivedAt,
    attachments: row.attachments,
  };
}

function makeSnippet(body: string): string {
  return body.replace(/\s+/g, " ").trim().slice(0, 120);
}

async function requireDraftFolder(accountId: string, workspaceId: string) {
  const [account, folder] = await Promise.all([
    db.mailAccount.findFirst({
      where: { id: accountId, workspaceId, kind: "IMAP" },
      select: { id: true, name: true, email: true },
    }),
    db.mailFolder.findFirst({
      where: { accountId, workspaceId, specialUse: "DRAFTS" },
      select: { id: true },
    }),
  ]);
  if (!account) throw new MailAccountNotFoundError(accountId);
  if (!folder) throw new MailDraftFolderUnavailableError();
  return { account, folder };
}

async function assertContextExists(
  workspaceId: string,
  inReplyToId?: string,
  forwardOfId?: string,
) {
  const contextId = inReplyToId ?? forwardOfId;
  if (!contextId) return;
  const context = await db.mailItem.findFirst({
    where: { id: contextId, workspaceId },
    select: { id: true },
  });
  if (!context) throw new MailDraftContextNotFoundError(contextId);
}

export async function saveMailDraft(
  workspaceId: string,
  input: SaveMailDraftData,
  runAccountTransaction: MailAccountTransactionRunner = runMailAccountTransaction,
): Promise<MailDraftDto> {
  const [{ account, folder }] = await Promise.all([
    requireDraftFolder(input.accountId, workspaceId),
    assertContextExists(workspaceId, input.inReplyToId, input.forwardOfId),
  ]);
  const now = new Date();
  const cleanHtml = sanitizeOutgoingMailHtml(input.bodyHtml);

  return runAccountTransaction(account.id, async (tx) => {
    let id = input.draftId;
    if (id) {
      const updated = await tx.mailItem.updateMany({
        where: {
          id,
          workspaceId,
          accountId: account.id,
          folderId: folder.id,
        },
        data: {
          toRecipients: jsonAddresses(input.to),
          ccRecipients: jsonAddresses(input.cc),
          bccRecipients: jsonAddresses(input.bcc),
          subject: input.subject,
          bodyText: input.bodyText,
          bodyHtml: cleanHtml,
          draftReplyToId: input.inReplyToId ?? null,
          draftForwardOfId: input.forwardOfId ?? null,
          snippet: makeSnippet(input.bodyText),
          receivedAt: now,
        },
      });
      if (updated.count === 0) throw new MailDraftNotFoundError(id);
    } else {
      const created = await tx.mailItem.create({
        data: {
          workspaceId,
          accountId: account.id,
          accountWorkspaceId: workspaceId,
          folderId: folder.id,
          folderWorkspaceId: workspaceId,
          fromAddress: account.email,
          fromName: account.name,
          toRecipients: jsonAddresses(input.to),
          ccRecipients: jsonAddresses(input.cc),
          bccRecipients: jsonAddresses(input.bcc),
          subject: input.subject,
          bodyText: input.bodyText,
          bodyHtml: cleanHtml,
          draftReplyToId: input.inReplyToId,
          draftForwardOfId: input.forwardOfId,
          snippet: makeSnippet(input.bodyText),
          isRead: true,
          receivedAt: now,
        },
        select: { id: true },
      });
      id = created.id;
    }

    const row = await tx.mailItem.findFirst({
      where: { id, workspaceId, folderId: folder.id },
      include: DRAFT_INCLUDE,
    });
    if (!row) throw new MailDraftNotFoundError(id);
    return toDraftDto(row);
  });
}

async function loadDraftForAttachment(
  tx: Prisma.TransactionClient,
  draftId: string,
  workspaceId: string,
) {
  const draft = await tx.mailItem.findFirst({
    where: {
      id: draftId,
      workspaceId,
      folder: { specialUse: "DRAFTS" },
    },
    select: {
      id: true,
      accountId: true,
      attachments: { select: { id: true, sizeBytes: true } },
    },
  });
  if (!draft) throw new MailDraftNotFoundError(draftId);
  return draft;
}

export async function uploadMailDraftAttachment(
  draftId: string,
  workspaceId: string,
  input: UploadMailDraftAttachmentData,
): Promise<MailDraftAttachmentDto> {
  if (
    input.content.byteLength > env.MAIL_MAX_ATTACHMENT_BYTES ||
    input.content.byteLength > MAX_DRAFT_TOTAL_ATTACHMENT_BYTES
  ) {
    throw new MailDraftAttachmentTooLargeError();
  }

  const initial = await db.mailItem.findFirst({
    where: {
      id: draftId,
      workspaceId,
      folder: { specialUse: "DRAFTS" },
    },
    select: { accountId: true },
  });
  if (!initial) throw new MailDraftNotFoundError(draftId);

  return runMailAccountTransaction(initial.accountId, async (tx) => {
    const draft = await loadDraftForAttachment(tx, draftId, workspaceId);
    const total = draft.attachments.reduce(
      (sum, attachment) => sum + attachment.sizeBytes,
      0,
    );
    if (draft.attachments.length >= MAX_DRAFT_ATTACHMENTS) {
      throw new MailDraftAttachmentLimitError();
    }
    if (total + input.content.byteLength > MAX_DRAFT_TOTAL_ATTACHMENT_BYTES) {
      throw new MailDraftAttachmentTooLargeError();
    }

    const attachment = await tx.mailAttachment.create({
      data: {
        mailItemId: draft.id,
        filename: input.filename.replaceAll("\0", "").slice(0, 255),
        contentType:
          input.contentType.replaceAll("\0", "").slice(0, 255) ||
          "application/octet-stream",
        sizeBytes: input.content.byteLength,
        content: new Uint8Array(input.content),
        fetchedAt: new Date(),
      },
      select: {
        id: true,
        filename: true,
        contentType: true,
        sizeBytes: true,
      },
    });
    await tx.mailItem.update({
      where: { id: draft.id },
      data: { hasAttachments: true },
    });
    return attachment;
  });
}

export async function deleteMailDraftAttachment(
  draftId: string,
  attachmentId: string,
  workspaceId: string,
): Promise<void> {
  const initial = await db.mailItem.findFirst({
    where: {
      id: draftId,
      workspaceId,
      folder: { specialUse: "DRAFTS" },
    },
    select: { accountId: true },
  });
  if (!initial) throw new MailDraftNotFoundError(draftId);

  await runMailAccountTransaction(initial.accountId, async (tx) => {
    const draft = await loadDraftForAttachment(tx, draftId, workspaceId);
    const removed = await tx.mailAttachment.deleteMany({
      where: { id: attachmentId, mailItemId: draft.id },
    });
    if (removed.count === 0) {
      throw new MailDraftNotFoundError(attachmentId);
    }
    const remaining = await tx.mailAttachment.count({
      where: { mailItemId: draft.id },
    });
    await tx.mailItem.update({
      where: { id: draft.id },
      data: { hasAttachments: remaining > 0 },
    });
  });
}
