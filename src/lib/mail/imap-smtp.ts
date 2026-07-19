import { ImapFlow } from "imapflow";
import type {
  FetchMessageObject,
  MessageAddressObject,
  MessageStructureObject,
} from "imapflow";
import { simpleParser } from "mailparser";
import { createTransport, type Transporter } from "nodemailer";
import MailComposer from "nodemailer/lib/mail-composer";
import type { MailSpecialUse } from "@/generated/prisma/client";
import {
  MailTransportError,
  type MailConnectionConfig,
  type MailDriver,
  type OutgoingMessage,
  type RemoteAttachment,
  type RemoteFolder,
  type RemoteMessage,
  type RemoteMessageFlags,
} from "@/lib/mail/types";

// Real IMAP/SMTP driver (plan §2). One lazy, reused ImapFlow connection per
// driver instance; close() logs out. TLS is never downgraded — SSL means
// implicit TLS, STARTTLS means cleartext connect + mandatory upgrade
// (imapflow upgrades automatically when secure:false; nodemailer via
// requireTLS). Certificate validation stays on (no rejectUnauthorized:false).

const TIMEOUT_MS = 15_000;
const SNIPPET_LENGTH = 120;

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

// Name-based fallback for servers without SPECIAL-USE (RU + EN conventions).
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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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

// Attachment metadata straight from BODYSTRUCTURE — partId is the IMAP body
// part number used later by downloadAttachment. Content is never fetched here.
function collectAttachments(
  node: MessageStructureObject | undefined,
  out: RemoteAttachment[] = [],
): RemoteAttachment[] {
  if (!node) return out;
  if (node.childNodes) {
    for (const child of node.childNodes) collectAttachments(child, out);
    return out;
  }
  if (!node.part) return out;
  const filename =
    node.dispositionParameters?.filename ?? node.parameters?.name;
  const isInline = node.disposition === "inline";
  const isAttachment =
    node.disposition === "attachment" ||
    (isInline &&
      Boolean(filename ?? node.id) &&
      !node.type.startsWith("text/"));
  if (isAttachment) {
    out.push({
      partId: node.part,
      filename: filename ?? "attachment",
      contentType: node.type,
      sizeBytes: node.size ?? 0,
      contentId: node.id ? node.id.replace(/^<|>$/g, "") : null,
      isInline,
    });
  }
  return out;
}

export class ImapSmtpMailDriver implements MailDriver {
  private readonly config: MailConnectionConfig;
  private client: ImapFlow | null = null;
  private transporter: Transporter | null = null;

  constructor(config: MailConnectionConfig) {
    this.config = config;
  }

  private createImapClient(): ImapFlow {
    return new ImapFlow({
      host: this.config.imapHost,
      port: this.config.imapPort,
      secure: this.config.imapSecurity === "SSL",
      auth: { user: this.config.username, pass: this.config.imapPassword },
      connectionTimeout: TIMEOUT_MS,
      greetingTimeout: TIMEOUT_MS,
      socketTimeout: TIMEOUT_MS,
      logger: false,
    });
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
        connectionTimeout: TIMEOUT_MS,
        greetingTimeout: TIMEOUT_MS,
        socketTimeout: TIMEOUT_MS,
      });
    }
    return this.transporter;
  }

  private async getClient(): Promise<ImapFlow> {
    if (this.client?.usable) return this.client;
    const client = this.createImapClient();
    await client.connect();
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
        },
      );
    }
  }

  async verify(): Promise<{
    imapOk: boolean;
    smtpOk: boolean;
    error: string | null;
  }> {
    let imapOk = false;
    let smtpOk = false;
    const errors: string[] = [];
    // Throwaway IMAP client — verify must not leave a cached connection behind.
    const client = this.createImapClient();
    try {
      await client.connect();
      await client.logout();
      imapOk = true;
    } catch (error) {
      errors.push(`IMAP: ${errorMessage(error)}`);
    }
    try {
      await this.getTransporter().verify();
      smtpOk = true;
    } catch (error) {
      errors.push(`SMTP: ${errorMessage(error)}`);
    }
    return { imapOk, smtpOk, error: errors.length ? errors.join("; ") : null };
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
    opts: { afterUid?: bigint; initialLimit?: number },
  ): Promise<RemoteMessage[]> {
    return this.withImap("fetchMessages", async (client) => {
      const mailbox = await client.mailboxOpen(folderPath, { readOnly: true });
      const query = {
        uid: true,
        flags: true,
        envelope: true,
        bodyStructure: true,
        source: true,
      };
      const messages: RemoteMessage[] = [];
      if (opts.afterUid !== undefined) {
        // Incremental: UID range. Guard — the server returns the last message
        // even when the range is empty, so re-filter by uid afterwards.
        const afterUid = opts.afterUid;
        const range = `${afterUid + 1n}:*`;
        for await (const msg of client.fetch(range, query, { uid: true })) {
          if (BigInt(msg.uid) <= afterUid) continue;
          messages.push(await this.toRemoteMessage(msg));
        }
      } else {
        // Initial: last initialLimit messages by sequence number.
        const limit = opts.initialLimit ?? 100;
        if (mailbox.exists === 0) return [];
        const start = Math.max(1, mailbox.exists - limit + 1);
        for await (const msg of client.fetch(`${start}:*`, query)) {
          messages.push(await this.toRemoteMessage(msg));
        }
      }
      return messages;
    });
  }

  private async toRemoteMessage(
    msg: FetchMessageObject,
  ): Promise<RemoteMessage> {
    const parsed = msg.source ? await simpleParser(msg.source) : null;
    const bodyText = parsed?.text ?? "";
    const bodyHtml =
      parsed && typeof parsed.html === "string" ? parsed.html : null;
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
        { uid: true, flags: true },
        { uid: true },
      )) {
        const flags = msg.flags ?? new Set<string>();
        result.set(BigInt(msg.uid), {
          isRead: flags.has("\\Seen"),
          isAnswered: flags.has("\\Answered"),
          isFlagged: flags.has("\\Flagged"),
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
  ): Promise<void> {
    await this.withImap("move", async (client) => {
      await client.mailboxOpen(folderPath);
      await client.messageMove(uid.toString(), targetPath, { uid: true });
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
      throw new MailTransportError(`SMTP send failed: ${errorMessage(error)}`, {
        cause: error,
      });
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
