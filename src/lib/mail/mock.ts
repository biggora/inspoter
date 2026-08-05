import {
  MailTransportError,
  type MailAddress,
  type MailDriver,
  type OutgoingMessage,
  type RemoteAttachment,
  type RemoteFolder,
  type RemoteMessage,
  type RemoteMessageFlags,
} from "@/lib/mail/types";

// Deterministic mock mail driver (plan §2, patterned after
// src/lib/providers/dns/mock.ts) — zero network calls, module-level mutable
// store keyed by storeKey (account id) so mutations round-trip within a
// running process. Fixed base dates, no randomness.

interface MockMessage extends RemoteMessage {
  // Deterministic attachment payloads so downloadAttachment round-trips.
  attachmentContents: Map<string, { content: string; contentType: string }>;
}

interface MockFolder extends RemoteFolder {
  messages: MockMessage[];
}

interface MockStore {
  folders: MockFolder[];
}

const stores = new Map<string, MockStore>();

export const mockOutbox: OutgoingMessage[] = [];

export function resetMockMailStore(): void {
  stores.clear();
  mockOutbox.length = 0;
}

const BASE_DATE = Date.UTC(2026, 5, 1, 9, 0, 0); // 2026-06-01T09:00:00Z
const HOUR_MS = 60 * 60 * 1000;

const SENDERS: MailAddress[] = [
  { name: "Anna Smirnova", address: "anna.smirnova@example.com" },
  { name: "Peter Ivanov", address: "p.ivanov@example.com" },
  { name: "Maria Kozlova", address: "m.kozlova@example.com" },
  { name: "Sergey Volkov", address: "s.volkov@example.com" },
  { name: "Elena Sokolova", address: "e.sokolova@example.com" },
  { name: "Support Team", address: "support@example.com" },
];

const SUBJECTS = [
  "Weekly report",
  "Monday meeting",
  "Pricing update",
  "Question about the integration",
  "Invoice for payment",
  "Plans for the quarter",
  "Design sign-off",
  "Repository access",
  "Backup",
  "Sprint results",
];

const BODIES = [
  "Good afternoon! Here is the summary of last week's tasks. The key metrics look normal, details are attached.",
  "Team, a reminder about Monday's meeting at 11:00. Agenda: project status and planning the next stage.",
  "Hello! Service pricing changes on July 1st. The details are in the attached document.",
  "Hi! Could you help with the payment gateway integration — which key should we use for the test environment?",
  "Good afternoon. Attached is the invoice for this month's services. Please pay it by the end of the week.",
  "Team, let's discuss the plans for the quarter. A draft of the goals is attached, comments welcome until Friday.",
];

function makeSnippet(text: string): string {
  return text.replace(/\s+/g, " ").trim().slice(0, 120);
}

function makeMessage(index: number): MockMessage {
  const sender = SENDERS[index % SENDERS.length];
  const subject = SUBJECTS[index % SUBJECTS.length];
  const bodyText = BODIES[index % BODIES.length];
  const withHtml = index % 4 === 0;
  const attachmentContents = new Map<
    string,
    { content: string; contentType: string }
  >();
  const attachments: RemoteAttachment[] = [];
  // Every 10th message (uids 1, 11, 21) carries a deterministic attachment.
  if (index % 10 === 0) {
    const content = `Attachment #${index + 1} contents (deterministic).`;
    attachmentContents.set("2", { content, contentType: "text/plain" });
    attachments.push({
      partId: "2",
      filename: `document-${index + 1}.txt`,
      contentType: "text/plain",
      sizeBytes: Buffer.byteLength(content, "utf8"),
      contentId: null,
      isInline: false,
    });
  }
  return {
    uid: BigInt(index + 1),
    messageId: `<mock-${index + 1}@example.com>`,
    from: sender,
    to: [{ name: "Operator", address: "operator@inspot.local" }],
    cc: [],
    subject,
    date: new Date(BASE_DATE + index * 3 * HOUR_MS),
    isRead: index % 3 !== 0,
    isAnswered: false,
    isFlagged: index % 7 === 0,
    bodyText,
    bodyHtml: withHtml
      ? `<p><strong>${subject}</strong></p><p>${bodyText}</p>`
      : null,
    snippet: makeSnippet(bodyText),
    attachments,
    attachmentContents,
  };
}

function seedStore(): MockStore {
  const inbox: MockFolder = {
    path: "INBOX",
    name: "Inbox",
    delimiter: "/",
    specialUse: "INBOX",
    uidValidity: 1n,
    messages: Array.from({ length: 30 }, (_, i) => makeMessage(i)),
  };
  // Display names stand in for what a real IMAP server would report, so they
  // stay in the base language like every other stored folder name; the sidebar
  // translates special-use folders on the way to the screen.
  const extra: Array<[string, string, MockFolder["specialUse"]]> = [
    ["Sent", "Sent", "SENT"],
    ["Drafts", "Drafts", "DRAFTS"],
    ["Trash", "Trash", "TRASH"],
    ["Archive", "Archive", "ARCHIVE"],
  ];
  return {
    folders: [
      inbox,
      ...extra.map(([path, name, specialUse]): MockFolder => ({
        path,
        name,
        delimiter: "/",
        specialUse,
        uidValidity: 1n,
        messages: [],
      })),
    ],
  };
}

export class MockMailDriver implements MailDriver {
  private readonly storeKey: string;

  constructor(storeKey: string) {
    this.storeKey = storeKey;
  }

  private store(): MockStore {
    let store = stores.get(this.storeKey);
    if (!store) {
      store = seedStore();
      stores.set(this.storeKey, store);
    }
    return store;
  }

  private folder(path: string): MockFolder {
    const folder = this.store().folders.find((f) => f.path === path);
    if (!folder) {
      throw new MailTransportError(`Mock folder not found: ${path}`);
    }
    return folder;
  }

  private message(folderPath: string, uid: bigint): MockMessage {
    const message = this.folder(folderPath).messages.find((m) => m.uid === uid);
    if (!message) {
      throw new MailTransportError(
        `Mock message not found: ${folderPath}#${uid}`,
      );
    }
    return message;
  }

  async verify(): Promise<{
    imapOk: boolean;
    smtpOk: boolean;
    error: string | null;
  }> {
    return { imapOk: true, smtpOk: true, error: null };
  }

  async listFolders(): Promise<RemoteFolder[]> {
    return this.store().folders.map(
      ({ path, name, delimiter, specialUse, uidValidity }) => ({
        path,
        name,
        delimiter,
        specialUse,
        uidValidity,
      }),
    );
  }

  async fetchMessages(
    folderPath: string,
    opts: { afterUid?: bigint; initialLimit?: number },
  ): Promise<RemoteMessage[]> {
    const messages = this.folder(folderPath).messages;
    if (opts.afterUid !== undefined) {
      const afterUid = opts.afterUid;
      return messages.filter((m) => m.uid > afterUid).map(toRemote);
    }
    const limit = opts.initialLimit ?? messages.length;
    return messages.slice(-limit).map(toRemote);
  }

  async listUidsWithFlags(
    folderPath: string,
    uids: bigint[],
  ): Promise<Map<bigint, RemoteMessageFlags>> {
    const messages = this.folder(folderPath).messages;
    const result = new Map<bigint, RemoteMessageFlags>();
    for (const uid of uids) {
      const message = messages.find((m) => m.uid === uid);
      if (!message) continue;
      result.set(uid, {
        isRead: message.isRead,
        isAnswered: message.isAnswered,
        isFlagged: message.isFlagged,
        attachments: [...message.attachments],
      });
    }
    return result;
  }

  async setSeen(folderPath: string, uid: bigint, seen: boolean): Promise<void> {
    this.message(folderPath, uid).isRead = seen;
  }

  async move(
    folderPath: string,
    uid: bigint,
    targetPath: string,
  ): Promise<{ moved: boolean; destinationUid: bigint | null }> {
    const source = this.folder(folderPath);
    const target = this.folder(targetPath);
    const message = source.messages.find((entry) => entry.uid === uid);
    if (!message) return { moved: false, destinationUid: null };
    source.messages = source.messages.filter((m) => m.uid !== uid);
    // Target folder assigns its own next UID, like a real IMAP server.
    const nextUid =
      target.messages.reduce((max, m) => (m.uid > max ? m.uid : max), 0n) + 1n;
    target.messages.push({ ...message, uid: nextUid });
    return { moved: true, destinationUid: nextUid };
  }

  async deleteMessage(folderPath: string, uid: bigint): Promise<void> {
    const folder = this.folder(folderPath);
    this.message(folderPath, uid); // Throws when the message is missing.
    folder.messages = folder.messages.filter((m) => m.uid !== uid);
  }

  async downloadAttachment(
    folderPath: string,
    uid: bigint,
    partId: string,
  ): Promise<{ content: Buffer; contentType: string }> {
    const stored = this.message(folderPath, uid).attachmentContents.get(partId);
    if (!stored) {
      throw new MailTransportError(
        `Mock attachment not found: ${folderPath}#${uid} part ${partId}`,
      );
    }
    return {
      content: Buffer.from(stored.content, "utf8"),
      contentType: stored.contentType,
    };
  }

  async send(
    message: OutgoingMessage,
  ): Promise<{ messageId: string; raw: Buffer }> {
    mockOutbox.push(message);
    const messageId = `<mock-sent-${mockOutbox.length}@inspot.local>`;
    const raw = Buffer.from(
      [
        `Message-ID: ${messageId}`,
        `From: ${message.from.address}`,
        `To: ${message.to.map((a) => a.address).join(", ")}`,
        `Subject: ${message.subject}`,
        "",
        message.text,
      ].join("\r\n"),
      "utf8",
    );
    return { messageId, raw };
  }

  async append(
    folderPath: string,
    raw: Buffer,
    flags: string[],
  ): Promise<void> {
    const folder = this.folder(folderPath);
    const nextUid =
      folder.messages.reduce((max, m) => (m.uid > max ? m.uid : max), 0n) + 1n;
    const text = raw.toString("utf8");
    const headerMatch = (name: string) =>
      text.match(new RegExp(`^${name}: (.+)$`, "m"))?.[1] ?? null;
    folder.messages.push({
      uid: nextUid,
      messageId: headerMatch("Message-ID"),
      from: { address: headerMatch("From") ?? "operator@inspot.local" },
      to: [],
      cc: [],
      subject: headerMatch("Subject") ?? "",
      date: new Date(BASE_DATE),
      isRead: flags.includes("\\Seen"),
      isAnswered: false,
      isFlagged: false,
      bodyText: text.split("\r\n\r\n").slice(1).join("\r\n\r\n"),
      bodyHtml: null,
      snippet: makeSnippet(text.split("\r\n\r\n").slice(1).join(" ")),
      attachments: [],
      attachmentContents: new Map(),
    });
  }

  async close(): Promise<void> {
    // No connection to release.
  }
}

// Strip the store-internal attachmentContents before handing messages out.
function toRemote(message: MockMessage): RemoteMessage {
  return {
    uid: message.uid,
    messageId: message.messageId,
    from: message.from,
    to: message.to,
    cc: message.cc,
    subject: message.subject,
    date: message.date,
    isRead: message.isRead,
    isAnswered: message.isAnswered,
    isFlagged: message.isFlagged,
    bodyText: message.bodyText,
    bodyHtml: message.bodyHtml,
    snippet: message.snippet,
    attachments: [...message.attachments],
  };
}
