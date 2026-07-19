import { db } from "@/lib/db";
import { env } from "@/lib/config/env";
import type { Prisma } from "@/generated/prisma/client";
import { getMailDriver, type MailAddress, type MailDriver } from "@/lib/mail";
import { MailAccountNotFoundError } from "@/lib/services/mail-accounts";
import mailMessages from "@/messages/ru/mail.json";

// Mail item actions + send (plan §4/§5, Phase 6). Server-first ordering: the
// IMAP mutation runs before the local DB write, so a transport failure never
// leaves the DB ahead of the mailbox. WEBHOOK items (and IMAP rows without a
// uid — e.g. locally moved, not yet re-synced) are DB-only.

export class MailItemNotFoundError extends Error {
  constructor(id: string) {
    super(`Mail item not found: ${id}`);
    this.name = "MailItemNotFoundError";
  }
}

// Move target must be a folder of the same account (and workspace).
export class MailFolderMismatchError extends Error {
  constructor() {
    super(mailMessages.errorFolderMismatch);
    this.name = "MailFolderMismatchError";
  }
}

// Sending requires an IMAP/SMTP account — the webhook mailbox is inbound-only.
export class MailSendNotAllowedError extends Error {
  constructor() {
    super(mailMessages.errorSendNotAllowed);
    this.name = "MailSendNotAllowedError";
  }
}

export class MailSendRateLimitError extends Error {
  constructor() {
    super(mailMessages.errorSendRateLimit);
    this.name = "MailSendRateLimitError";
  }
}

// In-process fixed-window send limiter per workspace (adapted from
// src/lib/webhooks/ratelimit.ts; same single-instance assumption). Limits are
// read at call time so tests can tighten env.MAIL_SEND_RATE_LIMIT.
interface SendWindowState {
  count: number;
  windowStart: number;
}

const sendWindows = new Map<string, SendWindowState>();

function checkSendRateLimit(workspaceId: string): void {
  const now = Date.now();
  const state = sendWindows.get(workspaceId);
  if (!state || now - state.windowStart >= env.MAIL_SEND_RATE_WINDOW_MS) {
    sendWindows.set(workspaceId, { count: 1, windowStart: now });
    return;
  }
  if (state.count < env.MAIL_SEND_RATE_LIMIT) {
    state.count += 1;
    return;
  }
  throw new MailSendRateLimitError();
}

const ITEM_INCLUDE = {
  account: true,
  folder: true,
} satisfies Prisma.MailItemInclude;

type ActionItem = Prisma.MailItemGetPayload<{ include: typeof ITEM_INCLUDE }>;

async function loadItem(id: string, workspaceId: string): Promise<ActionItem> {
  const item = await db.mailItem.findFirst({
    where: { id, workspaceId },
    include: ITEM_INCLUDE,
  });
  if (!item) throw new MailItemNotFoundError(id);
  return item;
}

// Runs an IMAP mutation for the item when it has a live uid; WEBHOOK items
// and uid-less rows skip the transport entirely.
async function withItemDriver(
  item: ActionItem,
  fn: (driver: MailDriver, uid: bigint) => Promise<void>,
): Promise<void> {
  if (item.account.kind !== "IMAP" || item.uid === null) return;
  const driver = await getMailDriver(item.account);
  try {
    await fn(driver, item.uid);
  } finally {
    await driver.close().catch(() => {});
  }
}

export async function setRead(
  id: string,
  workspaceId: string,
  isRead: boolean,
): Promise<void> {
  const item = await loadItem(id, workspaceId);
  await withItemDriver(item, (driver, uid) =>
    driver.setSeen(item.folder.path, uid, isRead),
  );
  await db.mailItem.updateMany({
    where: { id, workspaceId },
    data: { isRead },
  });
}

export type DeleteItemResult = { status: "trashed" | "deleted" };

// First delete moves the item into the account's TRASH folder (when one
// exists); deleting from TRASH — or without a trash folder — is permanent.
// The locally moved row keeps uid: null until the next sync re-associates it
// (unique [folderId, uid] ignores NULLs).
export async function deleteItem(
  id: string,
  workspaceId: string,
): Promise<DeleteItemResult> {
  const item = await loadItem(id, workspaceId);

  if (item.account.kind === "IMAP" && item.folder.specialUse !== "TRASH") {
    const trash = await db.mailFolder.findFirst({
      where: { workspaceId, accountId: item.accountId, specialUse: "TRASH" },
    });
    if (trash) {
      await withItemDriver(item, (driver, uid) =>
        driver.move(item.folder.path, uid, trash.path),
      );
      await db.mailItem.updateMany({
        where: { id, workspaceId },
        data: { folderId: trash.id, folderWorkspaceId: workspaceId, uid: null },
      });
      return { status: "trashed" };
    }
  }

  await withItemDriver(item, (driver, uid) =>
    driver.deleteMessage(item.folder.path, uid),
  );
  await db.mailItem.deleteMany({ where: { id, workspaceId } });
  return { status: "deleted" };
}

export async function moveItem(
  id: string,
  workspaceId: string,
  targetFolderId: string,
): Promise<void> {
  const item = await loadItem(id, workspaceId);
  const target = await db.mailFolder.findFirst({
    where: { id: targetFolderId, workspaceId },
  });
  if (!target || target.accountId !== item.accountId) {
    throw new MailFolderMismatchError();
  }
  if (target.id === item.folderId) return;

  await withItemDriver(item, (driver, uid) =>
    driver.move(item.folder.path, uid, target.path),
  );
  await db.mailItem.updateMany({
    where: { id, workspaceId },
    data: { folderId: target.id, folderWorkspaceId: workspaceId, uid: null },
  });
}

export interface SendMailData {
  accountId: string;
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  body: string;
  inReplyToId?: string;
}

function toAddresses(addresses: string[]): MailAddress[] {
  return addresses.map((address) => ({ address }));
}

function makeSnippet(body: string): string {
  return body.replace(/\s+/g, " ").trim().slice(0, 120);
}

// SMTP send + Sent-copy append + local Sent row (plan §4). Returns the id of
// the locally created Sent row, or null when the account has no SENT folder
// (the message is still sent). References carry only the original's
// messageId — original References chains are not stored in the model.
export async function sendMail(
  workspaceId: string,
  input: SendMailData,
): Promise<{ id: string | null }> {
  const account = await db.mailAccount.findFirst({
    where: { id: input.accountId, workspaceId },
  });
  if (!account) throw new MailAccountNotFoundError(input.accountId);
  if (account.kind !== "IMAP") throw new MailSendNotAllowedError();

  checkSendRateLimit(workspaceId);

  const original = input.inReplyToId
    ? await db.mailItem.findFirst({
        where: { id: input.inReplyToId, workspaceId },
      })
    : null;
  if (input.inReplyToId && !original) {
    throw new MailItemNotFoundError(input.inReplyToId);
  }

  const sentFolder = await db.mailFolder.findFirst({
    where: { workspaceId, accountId: account.id, specialUse: "SENT" },
  });

  const driver = await getMailDriver(account);
  let messageId: string;
  try {
    const sent = await driver.send({
      from: { name: account.name, address: account.email },
      to: toAddresses(input.to),
      cc: toAddresses(input.cc),
      bcc: toAddresses(input.bcc),
      subject: input.subject,
      text: input.body,
      ...(original?.messageId
        ? { inReplyTo: original.messageId, references: [original.messageId] }
        : {}),
    });
    messageId = sent.messageId;
    if (sentFolder) {
      await driver.append(sentFolder.path, sent.raw, ["\\Seen"]);
    }
  } finally {
    await driver.close().catch(() => {});
  }

  if (original) {
    // Local-only \Answered: the driver has no flag method beyond \Seen, so
    // the server copy is not flagged — the DB flag is enough for the UI.
    await db.mailItem.updateMany({
      where: { id: original.id, workspaceId },
      data: { isAnswered: true },
    });
  }

  if (!sentFolder) return { id: null };

  const jsonAddresses = (addresses: string[]): Prisma.InputJsonValue =>
    addresses.map((address) => ({ name: null, address }));
  const entry = await db.mailItem.create({
    data: {
      workspaceId,
      accountId: account.id,
      accountWorkspaceId: workspaceId,
      folderId: sentFolder.id,
      folderWorkspaceId: workspaceId,
      messageId,
      fromAddress: account.email,
      fromName: account.name,
      toRecipients: jsonAddresses(input.to),
      ccRecipients: jsonAddresses(input.cc),
      bccRecipients: jsonAddresses(input.bcc),
      subject: input.subject,
      bodyText: input.body,
      snippet: makeSnippet(input.body),
      isRead: true,
    },
  });
  return { id: entry.id };
}
