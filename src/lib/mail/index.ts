import type { MailAccount } from "@/generated/prisma/client";
import { decrypt } from "@/lib/crypto/credentials";
import { ImapSmtpMailDriver } from "@/lib/mail/imap-smtp";
import { MockMailDriver } from "@/lib/mail/mock";
import {
  MailTransportError,
  WebhookAccountHasNoTransportError,
  type MailConnectionConfig,
  type MailDriver,
} from "@/lib/mail/types";

// Driver factory (plan §2, patterned after src/lib/providers/dns/index.ts):
// MOCK accounts get the deterministic in-memory driver, REAL accounts get
// IMAP/SMTP with the password decrypted from the account row. WEBHOOK
// accounts have no transport at all.

export async function getMailDriver(account: MailAccount): Promise<MailDriver> {
  if (account.kind === "WEBHOOK") {
    throw new WebhookAccountHasNoTransportError();
  }
  if (account.mode === "MOCK") {
    return new MockMailDriver(account.id);
  }
  if (
    !account.imapHost ||
    !account.imapPort ||
    !account.imapSecurity ||
    !account.smtpHost ||
    !account.smtpPort ||
    !account.smtpSecurity ||
    !account.username ||
    !account.encryptedData ||
    !account.iv ||
    !account.authTag
  ) {
    throw new MailTransportError(
      `Mail account ${account.id} is missing IMAP/SMTP connection settings`,
    );
  }
  const credential = decrypt({
    encryptedData: account.encryptedData,
    iv: account.iv,
    authTag: account.authTag,
  });
  if (credential.type !== "MAIL_PASSWORD") {
    throw new MailTransportError(
      `Mail account ${account.id} has an unexpected credential type: ${credential.type}`,
    );
  }
  return new ImapSmtpMailDriver({
    email: account.email,
    imapHost: account.imapHost,
    imapPort: account.imapPort,
    imapSecurity: account.imapSecurity,
    smtpHost: account.smtpHost,
    smtpPort: account.smtpPort,
    smtpSecurity: account.smtpSecurity,
    username: account.username,
    imapPassword: credential.imapPassword,
    smtpPassword: credential.smtpPassword,
  });
}

// Transient driver from raw dialog input for POST /api/mail/accounts/test —
// no DB row and no persisted credential involved.
export function getMailDriverFromConfig(
  config: MailConnectionConfig,
  opts?: { mock?: boolean },
): MailDriver {
  if (opts?.mock) {
    return new MockMailDriver(`test:${config.email}`);
  }
  return new ImapSmtpMailDriver(config);
}

export {
  MailTransportError,
  WebhookAccountHasNoTransportError,
} from "@/lib/mail/types";
export type {
  MailAddress,
  MailConnectionConfig,
  MailDriver,
  OutgoingMessage,
  OutgoingAttachment,
  RemoteAttachment,
  RemoteFolder,
  RemoteMessage,
  RemoteMessageFlags,
} from "@/lib/mail/types";
