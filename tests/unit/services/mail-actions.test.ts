import { randomUUID } from "node:crypto";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { db } from "@/lib/db";
import { env } from "@/lib/config/env";
import {
  MockMailDriver,
  mockOutbox,
  resetMockMailStore,
} from "@/lib/mail/mock";
import { syncAccount } from "@/lib/services/mail-sync";
import * as mailService from "@/lib/services/mail";
import {
  deleteItem,
  MailFolderMismatchError,
  MailItemNotFoundError,
  MailSendNotAllowedError,
  MailSendRateLimitError,
  moveItem,
  sendMail,
  setRead,
} from "@/lib/services/mail-actions";
import {
  MailDraftNotFoundError,
  saveMailDraft,
  uploadMailDraftAttachment,
} from "@/lib/services/mail-drafts";

// Phase 6 action/send service tests against the deterministic MOCK driver
// (pattern: tests/unit/services/mail-sync.test.ts). The mock store is keyed
// by account id, so a second MockMailDriver instance observes the mutations
// the service performed. Mock INBOX: 30 messages, uids 1–30.

// Every test starts by syncing 30 mock messages into the DB — comfortably
// slower than the 5s default on a busy test container.
vi.setConfig({ testTimeout: 30_000 });

const NAME_PREFIX = `mail-actions-${randomUUID()}`;
let workspaceId: string;
let otherWorkspaceId: string;

async function createMockAccount(
  name: string,
  targetWorkspaceId = workspaceId,
) {
  return db.mailAccount.create({
    data: {
      workspaceId: targetWorkspaceId,
      kind: "IMAP",
      mode: "MOCK",
      name: `${NAME_PREFIX}-${name}`,
      email: "mock@example.ru",
      syncStatus: "IDLE",
    },
  });
}

async function createSyncedAccount(
  name: string,
  targetWorkspaceId = workspaceId,
) {
  const account = await createMockAccount(name, targetWorkspaceId);
  const outcome = await syncAccount(account.id, targetWorkspaceId);
  expect(outcome.status).toBe("synced");
  return account;
}

async function folderByPath(accountId: string, path: string) {
  const folder = await db.mailFolder.findFirst({
    where: { accountId, path },
  });
  expect(folder).not.toBeNull();
  return folder!;
}

async function itemByUid(folderId: string, uid: bigint) {
  const item = await db.mailItem.findFirst({ where: { folderId, uid } });
  expect(item).not.toBeNull();
  return item!;
}

beforeAll(async () => {
  const workspace = await db.workspace.create({
    data: {
      name: "Mail Actions Workspace",
      slug: `test-${randomUUID()}`,
      updatedAt: new Date(),
    },
  });
  workspaceId = workspace.id;
  const other = await db.workspace.create({
    data: {
      name: "Mail Actions Other Workspace",
      slug: `test-${randomUUID()}`,
      updatedAt: new Date(),
    },
  });
  otherWorkspaceId = other.id;
});

afterAll(async () => {
  for (const id of [workspaceId, otherWorkspaceId]) {
    if (id) await db.workspace.delete({ where: { id } }).catch(() => {});
  }
});

beforeEach(() => {
  resetMockMailStore();
});

describe("setRead", () => {
  it("round-trips \\Seen through the driver and updates the DB row", async () => {
    const account = await createSyncedAccount("set-read");
    const inbox = await folderByPath(account.id, "INBOX");
    // uid 1 (index 0) is unread in the seed.
    const item = await itemByUid(inbox.id, 1n);
    expect(item.isRead).toBe(false);

    await setRead(item.id, workspaceId, true);

    const driver = new MockMailDriver(account.id);
    const flags = await driver.listUidsWithFlags("INBOX", [1n]);
    expect(flags.get(1n)?.isRead).toBe(true);
    const stored = await db.mailItem.findUnique({ where: { id: item.id } });
    expect(stored?.isRead).toBe(true);

    await setRead(item.id, workspaceId, false);
    const flagsBack = await driver.listUidsWithFlags("INBOX", [1n]);
    expect(flagsBack.get(1n)?.isRead).toBe(false);
    expect(
      (await db.mailItem.findUnique({ where: { id: item.id } }))?.isRead,
    ).toBe(false);
  });

  it("throws MailItemNotFoundError for another workspace's item", async () => {
    const account = await createSyncedAccount("set-read-foreign");
    const inbox = await folderByPath(account.id, "INBOX");
    const item = await itemByUid(inbox.id, 1n);

    await expect(setRead(item.id, otherWorkspaceId, true)).rejects.toThrow(
      MailItemNotFoundError,
    );
  });
});

describe("deleteItem", () => {
  it("moves an INBOX item into TRASH on the server and locally", async () => {
    const account = await createSyncedAccount("delete-to-trash");
    const inbox = await folderByPath(account.id, "INBOX");
    const trash = await folderByPath(account.id, "Trash");
    const item = await itemByUid(inbox.id, 5n);

    const result = await deleteItem(item.id, workspaceId);
    expect(result).toEqual({ status: "trashed" });

    // Local row moved to the trash folder; uid detaches until the next sync.
    const stored = await db.mailItem.findUnique({ where: { id: item.id } });
    expect(stored?.folderId).toBe(trash.id);
    expect(stored?.uid).toBeNull();

    // Mock server: gone from INBOX, present in Trash.
    const driver = new MockMailDriver(account.id);
    const inboxFlags = await driver.listUidsWithFlags("INBOX", [5n]);
    expect(inboxFlags.size).toBe(0);
    const trashed = await driver.fetchMessages("Trash", {});
    expect(trashed).toHaveLength(1);
    expect(trashed[0].subject).toBe(item.subject);
  });

  it("permanently deletes an item already in TRASH (row and mock message gone)", async () => {
    const account = await createSyncedAccount("delete-permanent");
    // Move uid 2 into the mock Trash server-side, then re-sync so the local
    // trash row carries a live uid.
    const driver = new MockMailDriver(account.id);
    await driver.move("INBOX", 2n, "Trash");
    await syncAccount(account.id, workspaceId);

    const trash = await folderByPath(account.id, "Trash");
    const trashedRow = await db.mailItem.findFirst({
      where: { folderId: trash.id, uid: { not: null } },
    });
    expect(trashedRow).not.toBeNull();

    const result = await deleteItem(trashedRow!.id, workspaceId);
    expect(result).toEqual({ status: "deleted" });

    expect(
      await db.mailItem.findUnique({ where: { id: trashedRow!.id } }),
    ).toBeNull();
    expect(await driver.fetchMessages("Trash", {})).toHaveLength(0);
  });
});

describe("moveItem", () => {
  it("moves an item into the Archive folder on the server and locally", async () => {
    const account = await createSyncedAccount("move-archive");
    const inbox = await folderByPath(account.id, "INBOX");
    const archive = await folderByPath(account.id, "Archive");
    const item = await itemByUid(inbox.id, 3n);

    await moveItem(item.id, workspaceId, archive.id);

    const stored = await db.mailItem.findUnique({ where: { id: item.id } });
    expect(stored?.folderId).toBe(archive.id);
    expect(stored?.uid).toBeNull();

    const driver = new MockMailDriver(account.id);
    expect((await driver.listUidsWithFlags("INBOX", [3n])).size).toBe(0);
    const archived = await driver.fetchMessages("Archive", {});
    expect(archived).toHaveLength(1);
    expect(archived[0].subject).toBe(item.subject);
  });

  it("rejects a target folder belonging to another account", async () => {
    const account = await createSyncedAccount("move-own");
    const foreignAccount = await createSyncedAccount("move-foreign");
    const inbox = await folderByPath(account.id, "INBOX");
    const item = await itemByUid(inbox.id, 4n);
    const foreignArchive = await folderByPath(foreignAccount.id, "Archive");

    await expect(
      moveItem(item.id, workspaceId, foreignArchive.id),
    ).rejects.toThrow(MailFolderMismatchError);

    // Nothing moved.
    const stored = await db.mailItem.findUnique({ where: { id: item.id } });
    expect(stored?.folderId).toBe(inbox.id);
    expect(stored?.uid).toBe(4n);
  });
});

describe("sendMail", () => {
  it("autosaves, updates, and scopes a sanitized local draft", async () => {
    const account = await createSyncedAccount("draft-lifecycle");
    const created = await saveMailDraft(workspaceId, {
      accountId: account.id,
      to: ["unfinished-address"],
      cc: [],
      bcc: [],
      subject: "First subject",
      bodyText: "First body",
      bodyHtml: '<p>First body</p><script>alert("x")</script>',
    });

    expect(created.to).toEqual(["unfinished-address"]);
    expect(created.bodyHtml).toBe("<p>First body</p>");

    const updated = await saveMailDraft(workspaceId, {
      draftId: created.id,
      accountId: account.id,
      to: ["dest@example.ru"],
      cc: [],
      bcc: [],
      subject: "Updated subject",
      bodyText: "Updated body",
      bodyHtml: "<p><strong>Updated body</strong></p>",
    });
    expect(updated.id).toBe(created.id);
    expect(updated.subject).toBe("Updated subject");
    expect(
      await db.mailItem.count({
        where: { accountId: account.id, folder: { specialUse: "DRAFTS" } },
      }),
    ).toBe(1);

    await expect(
      saveMailDraft(otherWorkspaceId, {
        draftId: created.id,
        accountId: account.id,
        to: [],
        cc: [],
        bcc: [],
        subject: "foreign",
        bodyText: "foreign",
        bodyHtml: "<p>foreign</p>",
      }),
    ).rejects.toThrow();
  });

  it("sends draft attachments, stores the Sent copy, and removes the draft", async () => {
    const account = await createSyncedAccount("send-draft-attachment");
    const draft = await saveMailDraft(workspaceId, {
      accountId: account.id,
      to: ["dest@example.ru"],
      cc: [],
      bcc: [],
      subject: "Attached report",
      bodyText: "See attached.",
      bodyHtml: "<p>See attached.</p>",
    });
    const bytes = Buffer.from("attachment body", "utf8");
    const attachment = await uploadMailDraftAttachment(draft.id, workspaceId, {
      filename: "report.txt",
      contentType: "text/plain",
      content: bytes,
    });

    const result = await sendMail(workspaceId, {
      draftId: draft.id,
      accountId: account.id,
      to: draft.to,
      cc: draft.cc,
      bcc: draft.bcc,
      subject: draft.subject,
      bodyText: draft.bodyText,
      bodyHtml: draft.bodyHtml,
    });

    expect(mockOutbox).toHaveLength(1);
    expect(mockOutbox[0].attachments).toHaveLength(1);
    expect(mockOutbox[0].attachments[0]).toMatchObject({
      filename: "report.txt",
      contentType: "text/plain",
    });
    expect(Buffer.from(mockOutbox[0].attachments[0].content)).toEqual(bytes);
    expect(
      await db.mailItem.findUnique({ where: { id: draft.id } }),
    ).toBeNull();

    const sent = await db.mailItem.findUnique({
      where: { id: result.id! },
      include: { attachments: true },
    });
    expect(sent?.hasAttachments).toBe(true);
    expect(sent?.attachments).toHaveLength(1);
    expect(sent?.attachments[0]).toMatchObject({
      id: expect.any(String),
      filename: attachment.filename,
      contentType: attachment.contentType,
      sizeBytes: bytes.byteLength,
    });
    expect(Buffer.from(sent!.attachments[0].content!)).toEqual(bytes);
  });

  it("rejects a draft that belongs to another workspace", async () => {
    const account = await createSyncedAccount("own-draft-account");
    const foreignAccount = await createSyncedAccount(
      "foreign-draft-account",
      otherWorkspaceId,
    );
    const draft = await saveMailDraft(otherWorkspaceId, {
      accountId: foreignAccount.id,
      to: [],
      cc: [],
      bcc: [],
      subject: "Scoped",
      bodyText: "Scoped",
      bodyHtml: "<p>Scoped</p>",
    });

    await expect(
      sendMail(workspaceId, {
        draftId: draft.id,
        accountId: account.id,
        to: ["dest@example.ru"],
        cc: [],
        bcc: [],
        subject: "Scoped",
        bodyText: "Scoped",
        bodyHtml: "<p>Scoped</p>",
      }),
    ).rejects.toThrow(MailDraftNotFoundError);
  });

  it("sends via SMTP, appends the Sent copy, and creates a read local Sent row", async () => {
    const account = await createSyncedAccount("send");
    const sent = await folderByPath(account.id, "Sent");

    const result = await sendMail(workspaceId, {
      accountId: account.id,
      to: ["dest@example.ru"],
      cc: ["copy@example.ru"],
      bcc: [],
      subject: `${NAME_PREFIX}-send-subject`,
      bodyText: "Текст исходящего письма.",
      bodyHtml: "<p><strong>Текст</strong> исходящего письма.</p>",
    });
    expect(result.id).not.toBeNull();

    expect(mockOutbox).toHaveLength(1);
    expect(mockOutbox[0].to.map((a) => a.address)).toEqual(["dest@example.ru"]);
    expect(mockOutbox[0].cc.map((a) => a.address)).toEqual(["copy@example.ru"]);
    expect(mockOutbox[0].from.address).toBe(account.email);
    expect(mockOutbox[0].subject).toBe(`${NAME_PREFIX}-send-subject`);
    expect(mockOutbox[0].html).toBe(
      "<p><strong>Текст</strong> исходящего письма.</p>",
    );

    // Sent copy appended \Seen on the mock server.
    const driver = new MockMailDriver(account.id);
    const appended = await driver.fetchMessages("Sent", {});
    expect(appended).toHaveLength(1);
    expect(appended[0].isRead).toBe(true);

    const stored = await db.mailItem.findUnique({ where: { id: result.id! } });
    expect(stored?.folderId).toBe(sent.id);
    expect(stored?.isRead).toBe(true);
    expect(stored?.uid).toBeNull();
    expect(stored?.fromAddress).toBe(account.email);
    expect(stored?.messageId).toMatch(/^<mock-sent-/);
    expect(stored?.bodyText).toBe("Текст исходящего письма.");
    expect(stored?.bodyHtml).toBe(
      "<p><strong>Текст</strong> исходящего письма.</p>",
    );
    expect(stored?.toRecipients).toEqual([
      { name: null, address: "dest@example.ru" },
    ]);
  });

  it("reply threads In-Reply-To/References and marks the original answered", async () => {
    const account = await createSyncedAccount("send-reply");
    const inbox = await folderByPath(account.id, "INBOX");
    const original = await itemByUid(inbox.id, 6n);
    expect(original.messageId).not.toBeNull();
    expect(original.isAnswered).toBe(false);

    await sendMail(workspaceId, {
      accountId: account.id,
      to: [original.fromAddress],
      cc: [],
      bcc: [],
      subject: `Re: ${original.subject}`,
      bodyText: "Ответ.",
      bodyHtml: '<p><em>Ответ.</em><script>alert("x")</script></p>',
      inReplyToId: original.id,
    });

    expect(mockOutbox).toHaveLength(1);
    expect(mockOutbox[0].inReplyTo).toBe(original.messageId);
    expect(mockOutbox[0].references).toEqual([original.messageId]);
    expect(mockOutbox[0].text).toContain("wrote:\n>");
    expect(mockOutbox[0].html).toContain("<blockquote>");
    expect(mockOutbox[0].html).not.toContain("<script");

    const stored = await db.mailItem.findUnique({
      where: { id: original.id },
    });
    expect(stored?.isAnswered).toBe(true);
  });

  it("rejects sending from the webhook mailbox", async () => {
    // Auto-provision the system webhook account via a webhook mail.
    await mailService.create(workspaceId, {
      sender: `${NAME_PREFIX}-webhook-send@example.com`,
      subject: `${NAME_PREFIX}-webhook-send`,
      body: "webhook mail",
    });
    const webhookAccount = await db.mailAccount.findFirst({
      where: { workspaceId, kind: "WEBHOOK" },
    });
    expect(webhookAccount).not.toBeNull();

    await expect(
      sendMail(workspaceId, {
        accountId: webhookAccount!.id,
        to: ["dest@example.ru"],
        cc: [],
        bcc: [],
        subject: "n/a",
        bodyText: "n/a",
        bodyHtml: "<p>n/a</p>",
      }),
    ).rejects.toThrow(MailSendNotAllowedError);
  });

  it("enforces the per-workspace rate limit with a 429-mapped error", async () => {
    // Fresh workspace: the fixed window is keyed per workspace, so earlier
    // sends in this file don't count against this test.
    const workspace = await db.workspace.create({
      data: {
        name: "Rate Limit Workspace",
        slug: `test-${randomUUID()}`,
        updatedAt: new Date(),
      },
    });
    const account = await createMockAccount("rate-limit", workspace.id);
    await syncAccount(account.id, workspace.id);

    const input = {
      accountId: account.id,
      to: ["dest@example.ru"],
      cc: [],
      bcc: [],
      subject: "limit",
      bodyText: "limit",
      bodyHtml: "<p>limit</p>",
    };

    // env is parsed once at import; the limiter reads it at call time, so a
    // temporary tightening is visible immediately.
    const envRef = env as { MAIL_SEND_RATE_LIMIT: number };
    const originalLimit = envRef.MAIL_SEND_RATE_LIMIT;
    envRef.MAIL_SEND_RATE_LIMIT = 2;
    try {
      await sendMail(workspace.id, input);
      await sendMail(workspace.id, input);
      await expect(sendMail(workspace.id, input)).rejects.toThrow(
        MailSendRateLimitError,
      );
    } finally {
      envRef.MAIL_SEND_RATE_LIMIT = originalLimit;
      await db.workspace
        .delete({ where: { id: workspace.id } })
        .catch(() => {});
    }
  });
});

describe("WEBHOOK items — DB-only actions without a transport", () => {
  it("setRead and deleteItem work without touching any driver", async () => {
    const mail = await mailService.create(workspaceId, {
      sender: `${NAME_PREFIX}-webhook-item@example.com`,
      subject: `${NAME_PREFIX}-webhook-item`,
      body: "webhook item body",
    });

    await setRead(mail.id, workspaceId, true);
    expect(
      (await db.mailItem.findUnique({ where: { id: mail.id } }))?.isRead,
    ).toBe(true);

    // The webhook account has no TRASH folder — delete is permanent.
    const result = await deleteItem(mail.id, workspaceId);
    expect(result).toEqual({ status: "deleted" });
    expect(await db.mailItem.findUnique({ where: { id: mail.id } })).toBeNull();
  });
});
