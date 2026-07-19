import { db } from "@/lib/db";
import { env } from "@/lib/config/env";
import { getMailDriver } from "@/lib/mail";
import mailMessages from "@/messages/ru/mail.json";

// Attachment download with a lazy content cache (plan §4, Phase 7): metadata
// rows are created during sync; the bytes are fetched from IMAP on first
// download and cached in MailAttachment.content. Authorization goes through
// the parent MailItem (workspace-scoped) — the attachment model carries no
// workspaceId of its own.

// Covers both "no such attachment" and "belongs to another workspace" — the
// route maps both to 404 without distinguishing them.
export class MailAttachmentNotFoundError extends Error {
  constructor(id: string) {
    super(`Mail attachment not found: ${id}`);
    this.name = "MailAttachmentNotFoundError";
  }
}

export class AttachmentTooLargeError extends Error {
  constructor() {
    super(mailMessages.errorAttachmentTooLarge);
    this.name = "AttachmentTooLargeError";
  }
}

// No cached content and no way to fetch it: webhook items have no transport,
// and locally moved rows keep uid: null until the next sync re-associates
// them.
export class AttachmentUnavailableError extends Error {
  constructor() {
    super(mailMessages.errorAttachmentUnavailable);
    this.name = "AttachmentUnavailableError";
  }
}

export interface AttachmentContent {
  content: Buffer;
  contentType: string;
  filename: string;
}

export async function getAttachmentContent(
  mailItemId: string,
  attachmentId: string,
  workspaceId: string,
): Promise<AttachmentContent> {
  const attachment = await db.mailAttachment.findFirst({
    where: { id: attachmentId, mailItemId, mailItem: { workspaceId } },
    include: { mailItem: { include: { account: true, folder: true } } },
  });
  if (!attachment) throw new MailAttachmentNotFoundError(attachmentId);

  if (attachment.sizeBytes > env.MAIL_MAX_ATTACHMENT_BYTES) {
    throw new AttachmentTooLargeError();
  }

  if (attachment.content !== null) {
    return {
      content: Buffer.from(attachment.content),
      contentType: attachment.contentType,
      filename: attachment.filename,
    };
  }

  const item = attachment.mailItem;
  if (
    item.account.kind !== "IMAP" ||
    item.uid === null ||
    attachment.partId === null
  ) {
    throw new AttachmentUnavailableError();
  }

  const driver = await getMailDriver(item.account);
  let content: Buffer;
  try {
    ({ content } = await driver.downloadAttachment(
      item.folder.path,
      item.uid,
      attachment.partId,
    ));
  } finally {
    await driver.close().catch(() => {});
  }

  // The server may have understated sizeBytes — re-check the actual buffer
  // before caching so an oversized payload is never stored.
  if (content.byteLength > env.MAIL_MAX_ATTACHMENT_BYTES) {
    throw new AttachmentTooLargeError();
  }

  await db.mailAttachment.update({
    where: { id: attachment.id },
    // Copy into a plain Uint8Array — Prisma's Bytes input rejects the
    // Buffer's ArrayBufferLike typing.
    data: { content: new Uint8Array(content), fetchedAt: new Date() },
  });

  return {
    content,
    contentType: attachment.contentType,
    filename: attachment.filename,
  };
}
