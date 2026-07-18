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
import { resetMockMailStore } from "@/lib/mail/mock";
import { syncAccount } from "@/lib/services/mail-sync";
import {
  AttachmentTooLargeError,
  AttachmentUnavailableError,
  getAttachmentContent,
  MailAttachmentNotFoundError,
} from "@/lib/services/mail-attachments";

// Phase 7 attachment service tests against the deterministic MOCK driver
// (pattern: tests/unit/services/mail-actions.test.ts). The mock INBOX seeds
// attachments on uids 1/11/21 (partId "2", text/plain, deterministic body
// «Содержимое вложения №N (детерминированное).»).

// Every test starts by syncing 30 mock messages into the DB — comfortably
// slower than the 5s default on a busy test container.
vi.setConfig({ testTimeout: 30_000 });

const NAME_PREFIX = `mail-attachments-${randomUUID()}`;
let workspaceId: string;
let otherWorkspaceId: string;

async function createSyncedAccount(name: string) {
  const account = await db.mailAccount.create({
    data: {
      workspaceId,
      kind: "IMAP",
      mode: "MOCK",
      name: `${NAME_PREFIX}-${name}`,
      email: "mock@example.ru",
      syncStatus: "IDLE",
    },
  });
  const outcome = await syncAccount(account.id, workspaceId);
  expect(outcome.status).toBe("synced");
  return account;
}

// Item + attachment row for mock uid 1 (subject «Отчёт за неделю»,
// attachment document-1.txt).
async function attachmentForUid1(accountId: string) {
  const inbox = await db.mailFolder.findFirst({
    where: { accountId, path: "INBOX" },
  });
  expect(inbox).not.toBeNull();
  const item = await db.mailItem.findFirst({
    where: { folderId: inbox!.id, uid: 1n },
    include: { attachments: true },
  });
  expect(item).not.toBeNull();
  expect(item!.attachments).toHaveLength(1);
  return { item: item!, attachment: item!.attachments[0] };
}

beforeAll(async () => {
  const workspace = await db.workspace.create({
    data: {
      name: "Mail Attachments Workspace",
      slug: `test-${randomUUID()}`,
      updatedAt: new Date(),
    },
  });
  workspaceId = workspace.id;
  const other = await db.workspace.create({
    data: {
      name: "Mail Attachments Other Workspace",
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

describe("getAttachmentContent", () => {
  it("downloads from the driver on first access and caches content + fetchedAt", async () => {
    const account = await createSyncedAccount("first-download");
    const { item, attachment } = await attachmentForUid1(account.id);
    expect(attachment.content).toBeNull();
    expect(attachment.fetchedAt).toBeNull();

    const result = await getAttachmentContent(
      item.id,
      attachment.id,
      workspaceId,
    );
    expect(result.filename).toBe("document-1.txt");
    expect(result.contentType).toBe("text/plain");
    expect(result.content.toString("utf8")).toBe(
      "Содержимое вложения №1 (детерминированное).",
    );

    const stored = await db.mailAttachment.findUnique({
      where: { id: attachment.id },
    });
    expect(stored?.fetchedAt).not.toBeNull();
    expect(Buffer.from(stored!.content!).toString("utf8")).toBe(
      "Содержимое вложения №1 (детерминированное).",
    );
  });

  it("serves the cached content without touching the driver again", async () => {
    const account = await createSyncedAccount("cached");
    const { item, attachment } = await attachmentForUid1(account.id);

    await getAttachmentContent(item.id, attachment.id, workspaceId);

    // Killing partId (and the uid) makes any further driver fetch
    // impossible — a second call can only succeed from the cache.
    await db.mailAttachment.update({
      where: { id: attachment.id },
      data: { partId: null },
    });
    await db.mailItem.update({
      where: { id: item.id },
      data: { uid: null },
    });

    const result = await getAttachmentContent(
      item.id,
      attachment.id,
      workspaceId,
    );
    expect(result.content.toString("utf8")).toBe(
      "Содержимое вложения №1 (детерминированное).",
    );
  });

  it("throws MailAttachmentNotFoundError for another workspace's attachment", async () => {
    const account = await createSyncedAccount("foreign");
    const { item, attachment } = await attachmentForUid1(account.id);

    await expect(
      getAttachmentContent(item.id, attachment.id, otherWorkspaceId),
    ).rejects.toThrow(MailAttachmentNotFoundError);
  });

  it("throws MailAttachmentNotFoundError when the attachment belongs to another item", async () => {
    const account = await createSyncedAccount("wrong-item");
    const { attachment } = await attachmentForUid1(account.id);
    const otherItem = await db.mailItem.findFirst({
      where: { accountId: account.id, uid: 2n },
    });
    expect(otherItem).not.toBeNull();

    await expect(
      getAttachmentContent(otherItem!.id, attachment.id, workspaceId),
    ).rejects.toThrow(MailAttachmentNotFoundError);
  });

  it("throws AttachmentTooLargeError when sizeBytes exceeds the limit", async () => {
    const account = await createSyncedAccount("too-large");
    const { item, attachment } = await attachmentForUid1(account.id);
    await db.mailAttachment.update({
      where: { id: attachment.id },
      data: { sizeBytes: 2_000_000_000 },
    });

    await expect(
      getAttachmentContent(item.id, attachment.id, workspaceId),
    ).rejects.toThrow(AttachmentTooLargeError);
  });

  it("throws AttachmentUnavailableError for an uncached attachment on a uid-less item", async () => {
    const account = await createSyncedAccount("uid-null");
    const { item, attachment } = await attachmentForUid1(account.id);
    // Simulates a locally moved row awaiting re-sync: no cached content and
    // no live uid to fetch through.
    await db.mailItem.update({
      where: { id: item.id },
      data: { uid: null },
    });

    await expect(
      getAttachmentContent(item.id, attachment.id, workspaceId),
    ).rejects.toThrow(AttachmentUnavailableError);
  });
});
