// Mail transport DTOs + MailDriver contract (plan §2 «Транспортный слой»,
// modelled after src/lib/providers/dns/types.ts). Remote* types are
// read-through driver types — persistence mapping happens in the sync engine.

import type { MailSpecialUse } from "@/generated/prisma/client";

export interface MailAddress {
  name?: string;
  address: string;
}

export interface RemoteFolder {
  path: string;
  name: string;
  delimiter: string | null;
  specialUse: MailSpecialUse;
  uidValidity: bigint;
}

export interface RemoteAttachment {
  partId: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  contentId: string | null;
  isInline: boolean;
}

export interface RemoteMessage {
  uid: bigint;
  messageId: string | null;
  from: MailAddress | null;
  to: MailAddress[];
  cc: MailAddress[];
  subject: string;
  date: Date | null;
  isRead: boolean;
  isAnswered: boolean;
  isFlagged: boolean;
  bodyText: string;
  bodyHtml: string | null;
  snippet: string;
  attachments: RemoteAttachment[];
}

export interface OutgoingMessage {
  from: MailAddress;
  to: MailAddress[];
  cc: MailAddress[];
  bcc: MailAddress[];
  subject: string;
  text: string;
  inReplyTo?: string;
  references?: string[];
}

export interface RemoteMessageFlags {
  isRead: boolean;
  isAnswered: boolean;
  isFlagged: boolean;
}

// Raw connection settings — built either from a MailAccount DB row (with the
// decrypted password) or straight from dialog input for /api/mail/accounts/test.
export interface MailConnectionConfig {
  email: string;
  imapHost: string;
  imapPort: number;
  imapSecurity: "SSL" | "STARTTLS";
  smtpHost: string;
  smtpPort: number;
  smtpSecurity: "SSL" | "STARTTLS";
  username: string;
  imapPassword: string;
  smtpPassword?: string;
}

export interface MailDriver {
  verify(): Promise<{ imapOk: boolean; smtpOk: boolean; error: string | null }>;
  listFolders(): Promise<RemoteFolder[]>;
  fetchMessages(
    folderPath: string,
    opts: { afterUid?: bigint; initialLimit?: number },
  ): Promise<RemoteMessage[]>;
  listUidsWithFlags(
    folderPath: string,
    uids: bigint[],
  ): Promise<Map<bigint, RemoteMessageFlags>>;
  setSeen(folderPath: string, uid: bigint, seen: boolean): Promise<void>;
  move(folderPath: string, uid: bigint, targetPath: string): Promise<void>;
  /** Permanent removal: store \Deleted + expunge (no trash detour). */
  deleteMessage(folderPath: string, uid: bigint): Promise<void>;
  downloadAttachment(
    folderPath: string,
    uid: bigint,
    partId: string,
  ): Promise<{ content: Buffer; contentType: string }>;
  send(message: OutgoingMessage): Promise<{ messageId: string; raw: Buffer }>;
  append(folderPath: string, raw: Buffer, flags: string[]): Promise<void>;
  close(): Promise<void>;
}

// Wraps IMAP/SMTP failures so API routes can map them to 502 uniformly.
export class MailTransportError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "MailTransportError";
  }
}

// The webhook system account has no IMAP/SMTP transport — callers must
// branch on account.kind before asking for a driver.
export class WebhookAccountHasNoTransportError extends Error {
  constructor() {
    super("Webhook mail accounts have no IMAP/SMTP transport");
    this.name = "WebhookAccountHasNoTransportError";
  }
}
