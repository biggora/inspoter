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
import { MockMailDriver, resetMockMailStore } from "@/lib/mail/mock";
import { WebhookAccountHasNoTransportError } from "@/lib/mail";
import { syncAccount } from "@/lib/services/mail-sync";
import { MailAccountNotFoundError } from "@/lib/services/mail-accounts";
import { moveItem } from "@/lib/services/mail-actions";
import { saveMailDraft } from "@/lib/services/mail-drafts";
import { runMailAccountTransaction } from "@/lib/services/mail-locks";

// Sync engine tests (plan §3) against the deterministic MOCK driver: the
// in-memory store is keyed by account id, so a second MockMailDriver
// instance sees (and can mutate) the same mailbox the sync engine reads.
// Mock INBOX: 30 messages, uids 1–30, unread at uids 1,4,…,28 (10 total),
// attachments on uids 1/11/21; Sent/Drafts/Trash/Archive start empty.

const NAME_PREFIX = `mail-sync-${randomUUID()}`;
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
  it("creates 5 folders and 30 INBOX messages with flags, attachments and lastSeenUid", async () => {
    const account = await createMockAccount("initial");

    const outcome = await syncAccount(account.id, workspaceId);
    expect(outcome).toEqual({ status: "synced", folders: 5, newMessages: 30 });

    const folders = await db.mailFolder.findMany({
      where: { accountId: account.id },
      orderBy: { position: "asc" },
    });
    expect(folders.map((f) => [f.path, f.position])).toEqual([
      ["INBOX", 0],
      ["Sent", 1],
      ["Drafts", 2],
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
    expect(unread.map((i) => i.uid).sort((a, b) => Number(a! - b!))[0]).toBe(
      1n,
    );

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
    expect(outcome).toEqual({ status: "synced", folders: 5, newMessages: 0 });
    expect(await db.mailItem.count({ where: { accountId: account.id } })).toBe(
      30,
    );
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
    expect(outcome).toEqual({ status: "synced", folders: 5, newMessages: 1 });

    const inbox = await db.mailFolder.findFirst({
      where: { accountId: account.id, path: "INBOX" },
    });
    expect(inbox?.lastSeenUid).toBe(31n);
    expect(await db.mailItem.count({ where: { folderId: inbox!.id } })).toBe(
      31,
    );
  });
});

describe("syncAccount — shared Mail filter evaluator", () => {
  async function createSubjectRule(accountId: string, subjectContains: string) {
    const label = await db.mailLabel.create({
      data: {
        workspaceId,
        name: `${NAME_PREFIX}-${randomUUID()}`,
        normalizedName: `${NAME_PREFIX}-${randomUUID()}`,
        color: "AMBER",
      },
    });
    await db.mailFilterRule.create({
      data: {
        workspaceId,
        accountId,
        accountWorkspaceId: workspaceId,
        labelId: label.id,
        labelWorkspaceId: workspaceId,
        name: "IMAP subject rule",
        fromAddress: null,
        subjectContains,
      },
    });
    return label;
  }

  it("applies canonical subject matches on initial and UIDVALIDITY re-import", async () => {
    const account = await createMockAccount("filter-inbox");
    const label = await createSubjectRule(account.id, " ОТЧЁТ ");

    await syncAccount(account.id, workspaceId);
    const firstAssignments = await db.mailItemLabel.findMany({
      where: { labelId: label.id },
      include: { mailItem: { include: { attachments: true } } },
    });
    expect(firstAssignments).toHaveLength(3);
    expect(
      firstAssignments.every(
        ({ mailItem }) =>
          mailItem.subject === "Отчёт за неделю" &&
          mailItem.attachments.length === 1,
      ),
    ).toBe(true);
    const firstIds = firstAssignments.map(({ mailItemId }) => mailItemId);
    const manuallyLabeled = firstAssignments[0].mailItem;
    const manualLabel = await db.mailLabel.create({
      data: {
        workspaceId,
        name: `${NAME_PREFIX}-manual-uidvalidity-${randomUUID()}`,
        normalizedName: `${NAME_PREFIX}-manual-uidvalidity-${randomUUID()}`,
        color: "BLUE",
      },
    });
    await db.mailItemLabel.create({
      data: {
        workspaceId,
        mailItemId: manuallyLabeled.id,
        mailItemWorkspaceId: workspaceId,
        labelId: manualLabel.id,
        labelWorkspaceId: workspaceId,
      },
    });

    const inbox = await db.mailFolder.findFirstOrThrow({
      where: { accountId: account.id, specialUse: "INBOX" },
    });
    await db.mailFolder.update({
      where: { id: inbox.id },
      data: { uidValidity: 999n },
    });
    await syncAccount(account.id, workspaceId);

    const reapplied = await db.mailItemLabel.findMany({
      where: { labelId: label.id },
      select: { mailItemId: true },
    });
    expect(reapplied).toHaveLength(3);
    expect(
      reapplied.some(({ mailItemId }) => firstIds.includes(mailItemId)),
    ).toBe(false);
    const recreatedSameMessageId = await db.mailItem.findFirstOrThrow({
      where: {
        accountId: account.id,
        messageId: manuallyLabeled.messageId,
      },
      select: { id: true, messageId: true },
    });
    expect(recreatedSameMessageId.messageId).toBe(manuallyLabeled.messageId);
    expect(recreatedSameMessageId.id).not.toBe(manuallyLabeled.id);
    expect(
      await db.mailItemLabel.count({
        where: { mailItemId: recreatedSameMessageId.id, labelId: label.id },
      }),
    ).toBe(1);
    expect(
      await db.mailItemLabel.count({ where: { labelId: manualLabel.id } }),
    ).toBe(0);
  });

  it("does not evaluate Archive, Sent, or Trash imports", async () => {
    const account = await createMockAccount("filter-excluded");
    const label = await createSubjectRule(account.id, "excluded match");
    const driver = new MockMailDriver(account.id);
    const raw = Buffer.from(
      ["From: source@example.com", "Subject: Excluded MATCH", "", "body"].join(
        "\r\n",
      ),
      "utf8",
    );
    for (const folder of ["Archive", "Sent", "Trash"]) {
      await driver.append(folder, raw, []);
    }

    await syncAccount(account.id, workspaceId);
    const excludedItems = await db.mailItem.findMany({
      where: {
        accountId: account.id,
        folder: { specialUse: { in: ["ARCHIVE", "SENT", "TRASH"] } },
      },
      select: { id: true },
    });
    expect(excludedItems).toHaveLength(3);
    expect(
      await db.mailItemLabel.count({
        where: {
          labelId: label.id,
          mailItemId: { in: excludedItems.map(({ id }) => id) },
        },
      }),
    ).toBe(0);

    const inbox = await db.mailFolder.findFirstOrThrow({
      where: { accountId: account.id, specialUse: "INBOX" },
    });
    const archive = await db.mailFolder.findFirstOrThrow({
      where: { accountId: account.id, specialUse: "ARCHIVE" },
    });
    const moved = await db.mailItem.findFirstOrThrow({
      where: { folderId: archive.id },
    });
    await moveItem(moved.id, workspaceId, inbox.id);
    expect(
      await db.mailItemLabel.count({
        where: { mailItemId: moved.id, labelId: label.id },
      }),
    ).toBe(0);
  });

  it("performs remote fetch before acquiring the account transaction lock", async () => {
    const account = await createMockAccount("filter-remote-before-lock");
    let releaseFetch!: () => void;
    let reportFetchStarted!: () => void;
    const fetchStarted = new Promise<void>((resolve) => {
      reportFetchStarted = resolve;
    });
    const fetchRelease = new Promise<void>((resolve) => {
      releaseFetch = resolve;
    });
    const original = MockMailDriver.prototype.fetchMessages;
    let blocked = false;
    const fetchSpy = vi
      .spyOn(MockMailDriver.prototype, "fetchMessages")
      .mockImplementation(async function (
        this: MockMailDriver,
        folderPath,
        options,
      ) {
        if (!blocked) {
          blocked = true;
          reportFetchStarted();
          await fetchRelease;
        }
        return original.call(this, folderPath, options);
      });

    try {
      const sync = syncAccount(account.id, workspaceId);
      await fetchStarted;
      await runMailAccountTransaction(account.id, async () => undefined);
      releaseFetch();
      await expect(sync).resolves.toMatchObject({ status: "synced" });
    } finally {
      releaseFetch();
      fetchSpy.mockRestore();
    }
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
    expect(outcome).toEqual({ status: "synced", folders: 5, newMessages: 30 });

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

  it("preserves UID-less local drafts when Drafts UIDVALIDITY changes", async () => {
    const account = await createMockAccount("draft-validity");
    await syncAccount(account.id, workspaceId);
    const draft = await saveMailDraft(workspaceId, {
      accountId: account.id,
      to: ["dest@example.com"],
      cc: [],
      bcc: [],
      subject: "Local draft",
      bodyText: "Keep me",
      bodyHtml: "<p>Keep me</p>",
    });
    const draftsFolder = await db.mailFolder.findFirst({
      where: { accountId: account.id, specialUse: "DRAFTS" },
    });
    await db.mailFolder.update({
      where: { id: draftsFolder!.id },
      data: { uidValidity: 999n },
    });

    const outcome = await syncAccount(account.id, workspaceId);

    expect(outcome).toEqual({ status: "synced", folders: 5, newMessages: 0 });
    expect(
      await db.mailItem.findUnique({ where: { id: draft.id } }),
    ).toMatchObject({ uid: null, subject: "Local draft" });
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
    expect(await db.mailItem.count({ where: { folderId: inbox!.id } })).toBe(
      29,
    );

    // The moved message resurfaces in Archive via its incremental fetch.
    const archive = await db.mailFolder.findFirst({
      where: { accountId: account.id, path: "Archive" },
    });
    expect(await db.mailItem.count({ where: { folderId: archive!.id } })).toBe(
      1,
    );
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
    expect(outcome).toEqual({ status: "synced", folders: 5, newMessages: 30 });
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
    await expect(syncAccount(account.id, otherWorkspaceId)).rejects.toThrow(
      MailAccountNotFoundError,
    );
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
