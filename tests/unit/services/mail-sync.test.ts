import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { MockMailDriver, resetMockMailStore } from "@/lib/mail/mock";
import { WebhookAccountHasNoTransportError } from "@/lib/mail";
import { syncAccount } from "@/lib/services/mail-sync";
import { MailAccountNotFoundError } from "@/lib/services/mail-accounts";

// Sync engine tests (plan §3) against the deterministic MOCK driver: the
// in-memory store is keyed by account id, so a second MockMailDriver
// instance sees (and can mutate) the same mailbox the sync engine reads.
// Mock INBOX: 30 messages, uids 1–30, unread at uids 1,4,…,28 (10 total),
// attachments on uids 1/11/21; Sent/Trash/Archive start empty.

const NAME_PREFIX = `mail-sync-${randomUUID()}`;
let workspaceId: string;
let otherWorkspaceId: string;

async function createMockAccount(name: string, targetWorkspaceId = workspaceId) {
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

beforeAll(async () => {
  const workspace = await db.workspace.create({
    data: {
      name: "Sync Test Workspace",
      slug: `test-${randomUUID()}`,
      updatedAt: new Date(),
    },
  });
  workspaceId = workspace.id;
  const other = await db.workspace.create({
    data: {
      name: "Sync Other Workspace",
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

describe("syncAccount — initial sync", () => {
  it("creates 4 folders and 30 INBOX messages with flags, attachments and lastSeenUid", async () => {
    const account = await createMockAccount("initial");

    const outcome = await syncAccount(account.id, workspaceId);
    expect(outcome).toEqual({ status: "synced", folders: 4, newMessages: 30 });

    const folders = await db.mailFolder.findMany({
      where: { accountId: account.id },
      orderBy: { position: "asc" },
    });
    expect(folders.map((f) => [f.path, f.position])).toEqual([
      ["INBOX", 0],
      ["Sent", 1],
      ["Trash", 3],
      ["Archive", 5],
    ]);

    const inbox = folders[0];
    expect(inbox.uidValidity).toBe(1n);
    expect(inbox.lastSeenUid).toBe(30n);
    expect(inbox.lastSyncAt).toBeInstanceOf(Date);

    const items = await db.mailItem.findMany({
      where: { folderId: inbox.id },
      include: { attachments: true },
    });
    expect(items).toHaveLength(30);

    // Unread: mock marks index % 3 === 0 as unread → uids 1,4,…,28.
    const unread = items.filter((i) => !i.isRead);
    expect(unread).toHaveLength(10);
    expect(unread.map((i) => i.uid).sort((a, b) => Number(a! - b!))[0]).toBe(1n);

    // Attachment metadata on uids 1/11/21 — metadata only, no content yet.
    const withAttachments = items
      .filter((i) => i.hasAttachments)
      .sort((a, b) => Number(a.uid! - b.uid!));
    expect(withAttachments.map((i) => i.uid)).toEqual([1n, 11n, 21n]);
    for (const item of withAttachments) {
      expect(item.attachments).toHaveLength(1);
      expect(item.attachments[0].filename).toBe(`document-${item.uid}.txt`);
      expect(item.attachments[0].contentType).toBe("text/plain");
      expect(item.attachments[0].partId).toBe("2");
      expect(item.attachments[0].sizeBytes).toBeGreaterThan(0);
      expect(item.attachments[0].content).toBeNull();
    }

    const synced = await db.mailAccount.findUnique({
      where: { id: account.id },
    });
    expect(synced?.syncStatus).toBe("IDLE");
    expect(synced?.syncError).toBeNull();
    expect(synced?.lastSyncAt).toBeInstanceOf(Date);
    expect(synced?.nextSyncAt!.getTime()).toBeGreaterThan(Date.now());
    expect(synced?.syncLeaseExpiresAt).toBeNull();
  });

  it("is idempotent — a second sync creates nothing new", async () => {
    const account = await createMockAccount("idempotent");
    await syncAccount(account.id, workspaceId);

    const outcome = await syncAccount(account.id, workspaceId);
    expect(outcome).toEqual({ status: "synced", folders: 4, newMessages: 0 });
    expect(
      await db.mailItem.count({ where: { accountId: account.id } }),
    ).toBe(30);
  });
});

describe("syncAccount — incremental sync", () => {
  it("fetches only messages after lastSeenUid", async () => {
    const account = await createMockAccount("incremental");
    await syncAccount(account.id, workspaceId);

    // Append into the shared mock store (same store key = account id).
    const driver = new MockMailDriver(account.id);
    await driver.append(
      "INBOX",
      Buffer.from("Subject: Новое письмо\r\n\r\nТело нового письма.", "utf8"),
      [],
    );

    const outcome = await syncAccount(account.id, workspaceId);
    expect(outcome).toEqual({ status: "synced", folders: 4, newMessages: 1 });

    const inbox = await db.mailFolder.findFirst({
      where: { accountId: account.id, path: "INBOX" },
    });
    expect(inbox?.lastSeenUid).toBe(31n);
    expect(
      await db.mailItem.count({ where: { folderId: inbox!.id } }),
    ).toBe(31);
  });
});

describe("syncAccount — UIDVALIDITY change", () => {
  it("wipes and resyncs the folder when stored validity differs from remote", async () => {
    const account = await createMockAccount("validity");
    await syncAccount(account.id, workspaceId);

    // The mock store has no public validity mutator — simulate the change
    // from the local side: a stored validity that no longer matches the
    // remote value (1n) must trigger wipe + full resync.
    const inbox = await db.mailFolder.findFirst({
      where: { accountId: account.id, path: "INBOX" },
    });
    await db.mailFolder.update({
      where: { id: inbox!.id },
      data: { uidValidity: 999n },
    });
    const beforeIds = (
      await db.mailItem.findMany({
        where: { folderId: inbox!.id },
        select: { id: true },
      })
    ).map((i) => i.id);

    const outcome = await syncAccount(account.id, workspaceId);
    expect(outcome).toEqual({ status: "synced", folders: 4, newMessages: 30 });

    const after = await db.mailFolder.findFirst({ where: { id: inbox!.id } });
    expect(after?.uidValidity).toBe(1n);
    expect(after?.lastSeenUid).toBe(30n);
    const afterItems = await db.mailItem.findMany({
      where: { folderId: inbox!.id },
      select: { id: true },
    });
    expect(afterItems).toHaveLength(30);
    // All rows were re-created, none of the old ids survived the wipe.
    expect(afterItems.some((i) => beforeIds.includes(i.id))).toBe(false);
  });
});

describe("syncAccount — flag down-sync and deletions", () => {
  it("updates isRead when the flag changed on the server", async () => {
    const account = await createMockAccount("flags");
    await syncAccount(account.id, workspaceId);

    // uid 1 is unread in the seed; mark it seen via a second driver instance.
    const driver = new MockMailDriver(account.id);
    await driver.setSeen("INBOX", 1n, true);

    await syncAccount(account.id, workspaceId);

    const inbox = await db.mailFolder.findFirst({
      where: { accountId: account.id, path: "INBOX" },
    });
    const item = await db.mailItem.findFirst({
      where: { folderId: inbox!.id, uid: 1n },
    });
    expect(item?.isRead).toBe(true);
  });

  it("deletes local rows whose uids vanished from the server folder", async () => {
    const account = await createMockAccount("deletions");
    await syncAccount(account.id, workspaceId);

    const driver = new MockMailDriver(account.id);
    await driver.move("INBOX", 2n, "Archive");

    await syncAccount(account.id, workspaceId);

    const inbox = await db.mailFolder.findFirst({
      where: { accountId: account.id, path: "INBOX" },
    });
    const gone = await db.mailItem.findFirst({
      where: { folderId: inbox!.id, uid: 2n },
    });
    expect(gone).toBeNull();
    expect(
      await db.mailItem.count({ where: { folderId: inbox!.id } }),
    ).toBe(29);

    // The moved message resurfaces in Archive via its incremental fetch.
    const archive = await db.mailFolder.findFirst({
      where: { accountId: account.id, path: "Archive" },
    });
    expect(
      await db.mailItem.count({ where: { folderId: archive!.id } }),
    ).toBe(1);
  });
});

describe("syncAccount — lease", () => {
  it("returns busy while another sync holds a fresh lease", async () => {
    const account = await createMockAccount("lease-busy");
    await db.mailAccount.update({
      where: { id: account.id },
      data: {
        syncStatus: "SYNCING",
        syncLeaseExpiresAt: new Date(Date.now() + 60_000),
      },
    });

    const outcome = await syncAccount(account.id, workspaceId);
    expect(outcome).toEqual({ status: "busy" });
  });

  it("takes over an expired lease from a crashed sync", async () => {
    const account = await createMockAccount("lease-expired");
    await db.mailAccount.update({
      where: { id: account.id },
      data: {
        syncStatus: "SYNCING",
        syncLeaseExpiresAt: new Date(Date.now() - 60_000),
      },
    });

    const outcome = await syncAccount(account.id, workspaceId);
    expect(outcome).toEqual({ status: "synced", folders: 4, newMessages: 30 });
  });
});

describe("syncAccount — errors and scoping", () => {
  it("throws MailAccountNotFoundError for a missing account", async () => {
    await expect(syncAccount(randomUUID(), workspaceId)).rejects.toThrow(
      MailAccountNotFoundError,
    );
  });

  it("throws MailAccountNotFoundError when the account belongs to another workspace", async () => {
    const account = await createMockAccount("foreign");
    await expect(
      syncAccount(account.id, otherWorkspaceId),
    ).rejects.toThrow(MailAccountNotFoundError);
  });

  it("rejects WEBHOOK accounts — they have no IMAP transport", async () => {
    const webhook = await db.mailAccount.create({
      data: {
        workspaceId,
        kind: "WEBHOOK",
        mode: "REAL",
        name: `${NAME_PREFIX}-webhook`,
        email: "",
        syncStatus: "IDLE",
      },
    });
    await expect(syncAccount(webhook.id, workspaceId)).rejects.toThrow(
      WebhookAccountHasNoTransportError,
    );
  });

  it("records ERROR + syncError and still advances nextSyncAt on transport failure", async () => {
    // REAL account without connection settings → getMailDriver throws
    // MailTransportError inside the sync try block.
    const account = await db.mailAccount.create({
      data: {
        workspaceId,
        kind: "IMAP",
        mode: "REAL",
        name: `${NAME_PREFIX}-broken`,
        email: "broken@example.ru",
        syncStatus: "IDLE",
      },
    });

    const outcome = await syncAccount(account.id, workspaceId);
    expect(outcome.status).toBe("error");

    const stored = await db.mailAccount.findUnique({
      where: { id: account.id },
    });
    expect(stored?.syncStatus).toBe("ERROR");
    expect(stored?.syncError).toContain("missing IMAP/SMTP");
    expect(stored?.nextSyncAt!.getTime()).toBeGreaterThan(Date.now());
    expect(stored?.syncLeaseExpiresAt).toBeNull();
  });

  it("never touches data of другого workspace", async () => {
    const foreignAccount = await createMockAccount(
      "isolated",
      otherWorkspaceId,
    );
    const account = await createMockAccount("local");

    await syncAccount(account.id, workspaceId);

    expect(
      await db.mailFolder.count({ where: { workspaceId: otherWorkspaceId } }),
    ).toBe(0);
    expect(
      await db.mailItem.count({ where: { workspaceId: otherWorkspaceId } }),
    ).toBe(0);
    const untouched = await db.mailAccount.findUnique({
      where: { id: foreignAccount.id },
    });
    expect(untouched?.syncStatus).toBe("IDLE");
    expect(untouched?.lastSyncAt).toBeNull();
  });
});
