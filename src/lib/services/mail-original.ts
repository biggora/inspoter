import { env } from "@/lib/config/env";
import { db } from "@/lib/db";
import { getMailDriver } from "@/lib/mail";
import mailMessages from "@/messages/en/mail.json";

export class MailOriginalNotFoundError extends Error {
  constructor(id: string) {
    super(`Mail item not found: ${id}`);
    this.name = "MailOriginalNotFoundError";
  }
}

export class MailOriginalUnavailableError extends Error {
  constructor() {
    super(mailMessages.errorOriginalUnavailable);
    this.name = "MailOriginalUnavailableError";
  }
}

export class MailOriginalTooLargeError extends Error {
  constructor() {
    super(mailMessages.errorOriginalTooLarge);
    this.name = "MailOriginalTooLargeError";
  }
}

export async function getOriginalMessage(
  mailItemId: string,
  workspaceId: string,
): Promise<Buffer> {
  const item = await db.mailItem.findFirst({
    where: { id: mailItemId, workspaceId },
    include: { account: true, folder: true },
  });
  if (!item) throw new MailOriginalNotFoundError(mailItemId);
  if (
    item.account.kind !== "IMAP" ||
    item.uid === null ||
    item.folder.uidValidity === null
  ) {
    throw new MailOriginalUnavailableError();
  }
  if (
    item.sourceSizeBytes !== null &&
    item.sourceSizeBytes > BigInt(env.MAIL_MAX_MESSAGE_BYTES)
  ) {
    throw new MailOriginalTooLargeError();
  }

  const driver = await getMailDriver(item.account);
  let source: Buffer;
  try {
    source = await driver.downloadOriginal(
      item.folder.path,
      item.uid,
      item.folder.uidValidity,
      env.MAIL_MAX_MESSAGE_BYTES,
    );
  } finally {
    await driver.close().catch(() => {});
  }
  if (source.byteLength > env.MAIL_MAX_MESSAGE_BYTES) {
    throw new MailOriginalTooLargeError();
  }
  return source;
}
