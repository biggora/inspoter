// Mail transport DTOs + MailDriver contract (plan §2 "transport layer",
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
  bodyTruncated: boolean;
  sourceSizeBytes: bigint | null;
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
  html: string;
  attachments: OutgoingAttachment[];
  inReplyTo?: string;
  references?: string[];
}

export interface OutgoingAttachment {
  filename: string;
  contentType: string;
  content: Uint8Array;
}

export interface RemoteMessageFlags {
  isRead: boolean;
  isAnswered: boolean;
  isFlagged: boolean;
  attachments: RemoteAttachment[];
}

export interface MailMoveResult {
  moved: boolean;
  destinationUid: bigint | null;
}

// Log source for a transport failure — feeds the Logs page Source filter, which
// is built from whatever strings the returned rows carry (no enum to extend).
export type MailLogSource = "mail:imap" | "mail:smtp";

// Per-transport detail for one failed verify() probe. The settings dialog needs
// the machine-readable code to decide whether to offer the "port unreachable"
// hint; message is the same English text that goes into MailVerifyResult.error
// and into the Logs page, where a technical string is what an operator wants.
export interface MailVerifyFailure {
  protocol: "IMAP" | "SMTP";
  host: string;
  port: number;
  /**
   * nodemailer/imapflow error code (ETIMEDOUT, ECONNREFUSED, EAUTH, …); null
   * when the error carried none — never invent one.
   */
  code: string | null;
  message: string;
}

export interface MailVerifyResult {
  imapOk: boolean;
  smtpOk: boolean;
  /** Joined human-readable summary — same contract as before, now with host:port and code. */
  error: string | null;
  imapFailure: MailVerifyFailure | null;
  smtpFailure: MailVerifyFailure | null;
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
  /**
   * Called for transport failures worth surfacing on the Logs page. For IMAP
   * that is the ImapFlow 'error' event channel, which bypasses the awaited
   * call's catch block; SMTP has no such channel, so verify()/send() call this
   * from their own catch blocks purely for operator visibility. The source
   * argument says which transport failed. Injected by getMailDriver() so the
   * transport layer stays free of DB imports.
   */
  onTransportError?: (
    source: MailLogSource,
    message: string,
    details: string,
  ) => void;
}

export interface MailDriver {
  verify(): Promise<MailVerifyResult>;
  listFolders(): Promise<RemoteFolder[]>;
  fetchMessages(
    folderPath: string,
    opts: { afterUid?: bigint; initialLimit?: number; limit?: number },
  ): Promise<RemoteMessage[]>;
  listUidsWithFlags(
    folderPath: string,
    uids: bigint[],
  ): Promise<Map<bigint, RemoteMessageFlags>>;
  setSeen(folderPath: string, uid: bigint, seen: boolean): Promise<void>;
  move(
    folderPath: string,
    uid: bigint,
    targetPath: string,
  ): Promise<MailMoveResult>;
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
  /**
   * Driver operation that failed ("listFolders", "send", …). Set only when the
   * error came off the wire, so callers can tell a retryable transport blip
   * from a permanent setup failure (missing settings, undecryptable secret),
   * which carries no op.
   */
  readonly op?: string;

  constructor(message: string, options?: { cause?: unknown; op?: string }) {
    super(message, { cause: options?.cause });
    this.name = "MailTransportError";
    this.op = options?.op;
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
