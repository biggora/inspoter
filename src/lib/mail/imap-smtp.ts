import { ImapFlow } from "imapflow";
import type { FetchMessageObject, MessageAddressObject } from "imapflow";
import { simpleParser } from "mailparser";
import { env } from "@/lib/config/env";
import { createTransport, type Transporter } from "nodemailer";
import MailComposer from "nodemailer/lib/mail-composer";
import type { MailSpecialUse } from "@/generated/prisma/client";
import { collectAttachments } from "@/lib/mail/attachment-metadata";
import {
  MailTransportError,
  type MailConnectionConfig,
  type MailDriver,
  type MailVerifyFailure,
  type MailVerifyResult,
  type OutgoingMessage,
  type RemoteFolder,
  type RemoteMessage,
  type RemoteMessageFlags,
} from "@/lib/mail/types";

// Real IMAP/SMTP driver (plan §2). One lazy, reused ImapFlow connection per
// driver instance; close() logs out. TLS is never downgraded — SSL means
// implicit TLS, STARTTLS means cleartext connect + mandatory upgrade
// (imapflow upgrades automatically when secure:false; nodemailer via
// requireTLS). Certificate validation stays on (no rejectUnauthorized:false).

// Timeouts. imapflow's own defaults are 90s/16s/300s; the values below are
// tighter but still far above the observed norm (Gmail from the production
// VPS: TCP 11ms, TLS 20ms, greeting 25ms, LOGIN 525ms). socketTimeout is an
// *inactivity* timeout covering the whole session — including the gaps while
// the sync engine writes to the database between IMAP commands — so it must
// stay well above the per-command budget.
const IMAP_CONNECT_TIMEOUT_MS = 30_000;
const IMAP_GREETING_TIMEOUT_MS = 20_000;
const IMAP_SOCKET_TIMEOUT_MS = 120_000;
// SMTP gets its own triple rather than one shared value. connect stays below
// IMAP's 30s because verify() probes the two sequentially — every second here
// is a second the operator watches a spinner. greeting is generous because
// anti-spam tarpits delay the banner on purpose. socket is an *inactivity*
// timeout that also covers the DATA upload, so it has to fit an attachment up
// to MAIL_MAX_ATTACHMENT_BYTES (25 MiB) over a slow uplink — the old 15s could
// abort a large send mid-stream. All three stay tighter than nodemailer's own
// defaults (2min / 30s / 10min).
const SMTP_CONNECT_TIMEOUT_MS = 20_000;
const SMTP_GREETING_TIMEOUT_MS = 20_000;
const SMTP_SOCKET_TIMEOUT_MS = 60_000;
const SNIPPET_LENGTH = 120;
// IMAP server responses are short; cap them so a chatty server can't blow up
// the stored syncError.
const MAX_RESPONSE_TEXT_LENGTH = 200;

// imapflow special-use attributes → Prisma enum. "\All" (Gmail "All Mail")
// intentionally maps to OTHER — it is not the user's Archive folder.
const SPECIAL_USE_BY_ATTRIBUTE: Record<string, MailSpecialUse> = {
  "\\Inbox": "INBOX",
  "\\Sent": "SENT",
  "\\Drafts": "DRAFTS",
  "\\Trash": "TRASH",
  "\\Junk": "JUNK",
  "\\Archive": "ARCHIVE",
};

// Name-based fallback for servers without SPECIAL-USE. The Cyrillic patterns
// are not product copy and are exempt from the base-language rule: they match
// folder names a remote IMAP server chose, which Inspoter only reads.
function specialUseFromName(path: string, name: string): MailSpecialUse {
  if (path.toUpperCase() === "INBOX") return "INBOX";
  const lower = name.toLowerCase();
  if (/sent|отправлен/.test(lower)) return "SENT";
  if (/trash|deleted|корзин/.test(lower)) return "TRASH";
  if (/draft|черновик/.test(lower)) return "DRAFTS";
  if (/junk|spam|спам/.test(lower)) return "JUNK";
  if (/archive|архив/.test(lower)) return "ARCHIVE";
  return "OTHER";
}

// imapflow reports every NO/BAD as the same "Command failed", and puts the
// reason the server actually gave (e.g. "[AUTHENTICATIONFAILED] Invalid
// credentials") on error.responseText. Without it an operator sees nothing
// actionable in syncError. Server response text never echoes the password.
function errorMessage(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const responseText = (error as { responseText?: unknown }).responseText;
  if (typeof responseText !== "string" || !responseText) return error.message;
  return `${error.message}: ${responseText.slice(0, MAX_RESPONSE_TEXT_LENGTH)}`;
}

// nodemailer errors have a different shape than imapflow's: no responseText,
// but a machine-readable code (ETIMEDOUT, ECONNREFUSED, ESOCKET, EDNS, EAUTH,
// EENVELOPE) and, for a server-side rejection, the reply line on `response`.
// Without the code an operator sees a bare "Connection timeout" with no way to
// tell a blocked port from a wrong password. Reads only those fields — the
// transporter options, the only place the password lives, are never touched.
function smtpErrorDetail(error: unknown): {
  code: string | null;
  message: string;
} {
  const base = errorMessage(error);
  const raw = error as { code?: unknown; response?: unknown };
  const code = errorCode(error);
  const response =
    typeof raw?.response === "string" && raw.response ? raw.response : null;
  const parts = [base];
  if (code) parts.push(`(${code})`);
  if (response && !base.includes(response)) {
    parts.push(`— ${response.slice(0, MAX_RESPONSE_TEXT_LENGTH)}`);
  }
  return { code, message: parts.join(" ") };
}

// imapflow reports its own codes ("ETIMEOUT" — one D — for a socket timeout) on
// the same property, so verify()'s IMAP branch reuses this guard.
function errorCode(error: unknown): string | null {
  const raw = (error as { code?: unknown })?.code;
  return typeof raw === "string" && raw ? raw : null;
}

function makeSnippet(text: string): string {
  return text.replace(/\s+/g, " ").trim().slice(0, SNIPPET_LENGTH);
}

function toMailAddress(entry: MessageAddressObject | undefined) {
  if (!entry?.address) return null;
  return entry.name
    ? { name: entry.name, address: entry.address }
    : { address: entry.address };
}

function toMailAddresses(entries: MessageAddressObject[] | undefined) {
  return (entries ?? [])
    .map(toMailAddress)
    .filter((a): a is NonNullable<typeof a> => a !== null);
}

export class ImapSmtpMailDriver implements MailDriver {
  private readonly config: MailConnectionConfig;
  private client: ImapFlow | null = null;
  private transporter: Transporter | null = null;

  constructor(config: MailConnectionConfig) {
    this.config = config;
  }

  private createImapClient(): ImapFlow {
    const client = new ImapFlow({
      host: this.config.imapHost,
      port: this.config.imapPort,
      secure: this.config.imapSecurity === "SSL",
      auth: { user: this.config.username, pass: this.config.imapPassword },
      connectionTimeout: IMAP_CONNECT_TIMEOUT_MS,
      greetingTimeout: IMAP_GREETING_TIMEOUT_MS,
      socketTimeout: IMAP_SOCKET_TIMEOUT_MS,
      logger: false,
    });
    client.on("error", (error) => this.handleConnectionError(client, error));
    return client;
  }

  // ImapFlow is an EventEmitter, and a socket failure after connect (ETIMEOUT
  // on a slow or idle connection, ECONNRESET) arrives as an 'error' event —
  // not as a rejection of the awaited operation, which withImap already
  // handles. Without a listener Node turns that event into a process-level
  // uncaughtException, so one unreachable mailbox takes the whole server down
  // instead of just failing its own sync. imapflow only destroys the socket on
  // the next tick (closeAfter → setImmediate), so `usable` is still true here:
  // drop the cached connection explicitly and let the next call reconnect.
  private handleConnectionError(client: ImapFlow, error: unknown): void {
    if (this.client === client) this.client = null;
    const message = errorMessage(error);
    console.error(
      `[mail] IMAP connection error for ${this.config.email} (${this.config.imapHost}): ${message}`,
    );
    this.config.onTransportError?.(
      "mail:imap",
      `IMAP connection error for ${this.config.email} (${this.config.imapHost}): ${message}`,
      JSON.stringify({
        email: this.config.email,
        imapHost: this.config.imapHost,
        imapPort: this.config.imapPort,
      }),
    );
  }

  // Deliberate asymmetry with IMAP: handleConnectionError above exists because
  // an ImapFlow socket failure arrives on an event channel that would otherwise
  // swallow it. SMTP has no such channel — the caller already sees these errors
  // — so this method is purely about operator visibility, filing the failure on
  // the Logs page next to the mail:imap entries. Both call sites (verify() and
  // send()) are user-initiated and infrequent, so this cannot flood the table.
  private reportSmtpFailure(
    op: string,
    detail: { code: string | null; message: string },
  ): MailVerifyFailure {
    const { email, smtpHost, smtpPort, smtpSecurity } = this.config;
    const message = `SMTP ${op} failed for ${email} (${smtpHost}:${smtpPort}): ${detail.message}`;
    console.error(`[mail] ${message}`);
    this.config.onTransportError?.(
      "mail:smtp",
      message,
      JSON.stringify({
        email,
        smtpHost,
        smtpPort,
        smtpSecurity,
        code: detail.code,
        op,
      }),
    );
    return {
      protocol: "SMTP",
      host: smtpHost,
      port: smtpPort,
      code: detail.code,
      message: detail.message,
    };
  }

  private getTransporter(): Transporter {
    if (!this.transporter) {
      this.transporter = createTransport({
        host: this.config.smtpHost,
        port: this.config.smtpPort,
        secure: this.config.smtpSecurity === "SSL",
        requireTLS: this.config.smtpSecurity === "STARTTLS",
        auth: {
          user: this.config.username,
          pass: this.config.smtpPassword ?? this.config.imapPassword,
        },
        connectionTimeout: SMTP_CONNECT_TIMEOUT_MS,
        greetingTimeout: SMTP_GREETING_TIMEOUT_MS,
        socketTimeout: SMTP_SOCKET_TIMEOUT_MS,
      });
    }
    return this.transporter;
  }

  private async getClient(): Promise<ImapFlow> {
    if (this.client?.usable) return this.client;
    const client = this.createImapClient();
    try {
      await client.connect();
    } catch (error) {
      // imapflow rejects connect() from beginSession() *without* closing the
      // socket when the session handshake fails (LOGIN → NO, ID/NAMESPACE →
      // BAD). The instance was never stored in this.client, so close() cannot
      // reach it and the socket lingers until its inactivity timeout fires an
      // 'error' event — one bogus "Socket timeout" log entry per failed sync,
      // plus a server connection slot held for the whole timeout window.
      client.close();
      throw error;
    }
    this.client = client;
    return client;
  }

  // All IMAP operations funnel through here: lazy connect, uniform
  // MailTransportError wrapping, cached-connection reset on dead sockets.
  private async withImap<T>(
    op: string,
    fn: (client: ImapFlow) => Promise<T>,
  ): Promise<T> {
    try {
      const client = await this.getClient();
      return await fn(client);
    } catch (error) {
      if (!this.client?.usable) this.client = null;
      throw new MailTransportError(
        `IMAP ${op} failed: ${errorMessage(error)}`,
        {
          cause: error,
          op,
        },
      );
    }
  }

  async verify(): Promise<MailVerifyResult> {
    let imapOk = false;
    let smtpOk = false;
    let imapFailure: MailVerifyFailure | null = null;
    let smtpFailure: MailVerifyFailure | null = null;
    const errors: string[] = [];
    // Throwaway IMAP client — verify must not leave a cached connection behind.
    const client = this.createImapClient();
    try {
      await client.connect();
      await client.logout();
      imapOk = true;
    } catch (error) {
      const message = errorMessage(error);
      imapFailure = {
        protocol: "IMAP",
        host: this.config.imapHost,
        port: this.config.imapPort,
        code: errorCode(error),
        message,
      };
      errors.push(
        `IMAP ${this.config.imapHost}:${this.config.imapPort}: ${message}`,
      );
    } finally {
      // A failed connect() can leave the socket open (see getClient()), and a
      // failed logout() leaves it open by definition. close() on an already
      // closed client is a no-op.
      client.close();
    }
    try {
      await this.getTransporter().verify();
      smtpOk = true;
    } catch (error) {
      const detail = smtpErrorDetail(error);
      smtpFailure = this.reportSmtpFailure("verify", detail);
      errors.push(
        `SMTP ${this.config.smtpHost}:${this.config.smtpPort}: ${detail.message}`,
      );
    }
    return {
      imapOk,
      smtpOk,
      error: errors.length ? errors.join("; ") : null,
      imapFailure,
      smtpFailure,
    };
  }

  async listFolders(): Promise<RemoteFolder[]> {
    return this.withImap("listFolders", async (client) => {
      const entries = await client.list();
      const folders: RemoteFolder[] = [];
      for (const entry of entries) {
        if (entry.flags.has("\\Noselect")) continue;
        const specialUse =
          (entry.specialUse && SPECIAL_USE_BY_ATTRIBUTE[entry.specialUse]) ||
          specialUseFromName(entry.path, entry.name);
        const status = await client.status(entry.path, { uidValidity: true });
        folders.push({
          path: entry.path,
          name: entry.name,
          delimiter: entry.delimiter ?? null,
          specialUse,
          uidValidity: status.uidValidity ?? 0n,
        });
      }
      return folders;
    });
  }

  async fetchMessages(
    folderPath: string,
    opts: { afterUid?: bigint; initialLimit?: number; limit?: number },
  ): Promise<RemoteMessage[]> {
    return this.withImap("fetchMessages", async (client) => {
      const mailbox = await client.mailboxOpen(folderPath, { readOnly: true });
      const query = {
        uid: true,
        flags: true,
        envelope: true,
        bodyStructure: true,
        size: true,
      };
      const messages: RemoteMessage[] = [];
      if (mailbox.exists === 0) return [];
      const limit = opts.limit ?? opts.initialLimit ?? 100;
      let start: number;
      if (opts.afterUid === undefined) {
        start = Math.max(1, mailbox.exists - (opts.initialLimit ?? limit) + 1);
      } else {
        let low = 1;
        let high = mailbox.exists + 1;
        while (low < high) {
          const middle = Math.floor((low + high) / 2);
          if (middle > mailbox.exists) {
            high = middle;
            continue;
          }
          const probe = await client.fetchOne(String(middle), { uid: true });
          if (probe && BigInt(probe.uid) <= opts.afterUid) low = middle + 1;
          else high = middle;
        }
        start = low;
      }
      if (start > mailbox.exists) return [];
      const end = Math.min(mailbox.exists, start + limit - 1);
      // Drain the metadata FETCH completely before fetching any body.
      // toRemoteMessage() issues its own FETCH, and ImapFlow runs one command
      // at a time: while this generator is mid-iteration the outer FETCH is
      // still the active request and holds back its untagged responses until
      // the consumer resumes, so a command issued from inside the loop is
      // queued behind a command that is waiting on the loop — a deadlock that
      // ends as a 120s socket timeout. The batch is MAIL_SYNC_BATCH_SIZE
      // metadata rows, so buffering them costs nothing.
      const fetched: FetchMessageObject[] = [];
      for await (const msg of client.fetch(`${start}:${end}`, query)) {
        fetched.push(msg);
      }
      for (const msg of fetched) {
        messages.push(await this.toRemoteMessage(client, msg));
      }
      return messages;
    });
  }

  private async toRemoteMessage(
    client: ImapFlow,
    msg: FetchMessageObject,
  ): Promise<RemoteMessage> {
    const sourceSizeBytes = msg.size === undefined ? null : BigInt(msg.size);
    let bodyTruncated =
      msg.size !== undefined && msg.size > env.MAIL_MAX_MESSAGE_BYTES;
    let source: Buffer | undefined;
    if (!bodyTruncated) {
      const sourceMessage = await client.fetchOne(
        String(msg.uid),
        { source: { maxLength: env.MAIL_MAX_MESSAGE_BYTES + 1 } },
        { uid: true },
      );
      source = sourceMessage ? sourceMessage.source : undefined;
      if (source && source.byteLength > env.MAIL_MAX_MESSAGE_BYTES) {
        bodyTruncated = true;
        source = undefined;
      }
    }
    const parsed = source ? await simpleParser(source) : null;
    let bodyText = parsed?.text ?? "";
    let bodyHtml =
      parsed && typeof parsed.html === "string" ? parsed.html : null;
    if (
      Buffer.byteLength(bodyText, "utf8") +
        Buffer.byteLength(bodyHtml ?? "", "utf8") >
      env.MAIL_MAX_BODY_BYTES
    ) {
      bodyText = "";
      bodyHtml = null;
      bodyTruncated = true;
    }
    const flags = msg.flags ?? new Set<string>();
    const envelope = msg.envelope;
    return {
      uid: BigInt(msg.uid),
      messageId: envelope?.messageId ?? null,
      from: toMailAddress(envelope?.from?.[0]),
      to: toMailAddresses(envelope?.to),
      cc: toMailAddresses(envelope?.cc),
      subject: envelope?.subject ?? "",
      date: envelope?.date ?? null,
      isRead: flags.has("\\Seen"),
      isAnswered: flags.has("\\Answered"),
      isFlagged: flags.has("\\Flagged"),
      bodyText,
      bodyHtml,
      bodyTruncated,
      sourceSizeBytes,
      snippet: makeSnippet(bodyText),
      attachments: collectAttachments(msg.bodyStructure),
    };
  }

  async listUidsWithFlags(
    folderPath: string,
    uids: bigint[],
  ): Promise<Map<bigint, RemoteMessageFlags>> {
    if (uids.length === 0) return new Map();
    return this.withImap("listUidsWithFlags", async (client) => {
      await client.mailboxOpen(folderPath, { readOnly: true });
      const range = uids.map((uid) => uid.toString()).join(",");
      const result = new Map<bigint, RemoteMessageFlags>();
      for await (const msg of client.fetch(
        range,
        { uid: true, flags: true, bodyStructure: true },
        { uid: true },
      )) {
        const flags = msg.flags ?? new Set<string>();
        result.set(BigInt(msg.uid), {
          isRead: flags.has("\\Seen"),
          isAnswered: flags.has("\\Answered"),
          isFlagged: flags.has("\\Flagged"),
          attachments: collectAttachments(msg.bodyStructure),
        });
      }
      return result;
    });
  }

  async setSeen(folderPath: string, uid: bigint, seen: boolean): Promise<void> {
    await this.withImap("setSeen", async (client) => {
      await client.mailboxOpen(folderPath);
      if (seen) {
        await client.messageFlagsAdd(uid.toString(), ["\\Seen"], { uid: true });
      } else {
        await client.messageFlagsRemove(uid.toString(), ["\\Seen"], {
          uid: true,
        });
      }
    });
  }

  async move(
    folderPath: string,
    uid: bigint,
    targetPath: string,
  ): Promise<{ moved: boolean; destinationUid: bigint | null }> {
    return this.withImap("move", async (client) => {
      await client.mailboxOpen(folderPath);
      const result = await client.messageMove(uid.toString(), targetPath, {
        uid: true,
      });
      if (!result) return { moved: false, destinationUid: null };
      const destinationUid = result.uidMap?.get(Number(uid));
      return {
        moved: true,
        destinationUid:
          destinationUid === undefined ? null : BigInt(destinationUid),
      };
    });
  }

  async deleteMessage(folderPath: string, uid: bigint): Promise<void> {
    await this.withImap("deleteMessage", async (client) => {
      await client.mailboxOpen(folderPath);
      // messageDelete stores \Deleted and expunges in one call.
      await client.messageDelete(uid.toString(), { uid: true });
    });
  }

  async downloadAttachment(
    folderPath: string,
    uid: bigint,
    partId: string,
  ): Promise<{ content: Buffer; contentType: string }> {
    return this.withImap("downloadAttachment", async (client) => {
      await client.mailboxOpen(folderPath, { readOnly: true });
      const download = await client.download(uid.toString(), partId, {
        uid: true,
      });
      if (!download?.content) {
        throw new Error(`attachment part ${partId} not found for uid ${uid}`);
      }
      const chunks: Buffer[] = [];
      for await (const chunk of download.content) {
        chunks.push(chunk as Buffer);
      }
      return {
        content: Buffer.concat(chunks),
        contentType: download.meta.contentType || "application/octet-stream",
      };
    });
  }

  async send(
    message: OutgoingMessage,
  ): Promise<{ messageId: string; raw: Buffer }> {
    // Compose the RFC822 buffer first, then send that exact buffer — the
    // appended Sent copy is byte-identical to what recipients receive.
    const toComposer = (a: { name?: string; address: string }) => ({
      name: a.name ?? "",
      address: a.address,
    });
    const mime = new MailComposer({
      from: toComposer(message.from),
      to: message.to.map(toComposer),
      cc: message.cc.map(toComposer),
      bcc: message.bcc.map(toComposer),
      subject: message.subject,
      text: message.text,
      html: message.html,
      attachments: message.attachments.map((attachment) => ({
        filename: attachment.filename,
        contentType: attachment.contentType,
        content: Buffer.from(attachment.content),
      })),
      inReplyTo: message.inReplyTo,
      references: message.references,
    }).compile();
    const messageId = mime.messageId();
    let raw: Buffer;
    try {
      raw = await mime.build();
    } catch (error) {
      throw new MailTransportError(
        `SMTP compose failed: ${errorMessage(error)}`,
        { cause: error },
      );
    }
    const envelope = {
      from: message.from.address,
      to: [...message.to, ...message.cc, ...message.bcc].map((a) => a.address),
    };
    try {
      await this.getTransporter().sendMail({ envelope, raw });
    } catch (error) {
      const detail = smtpErrorDetail(error);
      this.reportSmtpFailure("send", detail);
      throw new MailTransportError(
        `SMTP send failed (${this.config.smtpHost}:${this.config.smtpPort}): ${detail.message}`,
        { cause: error, op: "send" },
      );
    }
    return { messageId, raw };
  }

  async append(
    folderPath: string,
    raw: Buffer,
    flags: string[],
  ): Promise<void> {
    await this.withImap("append", async (client) => {
      await client.append(folderPath, raw, flags);
    });
  }

  async close(): Promise<void> {
    if (this.client) {
      try {
        await this.client.logout();
      } catch {
        this.client.close();
      }
      this.client = null;
    }
    if (this.transporter) {
      this.transporter.close();
      this.transporter = null;
    }
  }
}
