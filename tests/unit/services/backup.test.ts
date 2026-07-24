import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { Prisma, type Workspace } from "@/generated/prisma/client";
import { decrypt } from "@/lib/crypto/credentials";
// CREDENTIAL_ENCRYPTION_KEY is not in scripts/test-env.mjs's TEST_ENV_KEYS
// allowlist scenarios that skip it, so it must be set directly here — a
// fixed 64-char hex test key, same as credentials.test.ts/mail-accounts.test.ts.
process.env.CREDENTIAL_ENCRYPTION_KEY ??=
  "7d65bff94a983c4052b8fce4bbc9ed8a50c4c014fca6c22121a2662d9e9a2bea";

import * as backupService from "@/lib/services/backup";
import {
  openArchive,
  BackupInvalidFileError,
  BackupPassphraseInvalidError,
  BackupUnsupportedVersionError,
} from "@/lib/backup/format";
import {
  BACKUP_SECTIONS,
  type BackupSection,
} from "@/lib/backup/serialization";
import * as workspacesService from "@/lib/services/workspaces";
import * as bookmarksService from "@/lib/services/bookmarks";
import * as messagesService from "@/lib/services/messages";
import * as mailAccountsService from "@/lib/services/mail-accounts";
import * as monitorServicesService from "@/lib/services/services";
import * as webhookTokensService from "@/lib/services/webhookTokens";
import * as outgoingWebhooksService from "@/lib/services/outgoingWebhooks";
import * as credentialsService from "@/lib/services/credentials";
import {
  requireWorkspaceOwner,
  WorkspaceOwnerRequiredError,
} from "@/lib/services/workspace-auth";

// Integration tests for the workspace backup/restore service (export +
// import) against the real test DB. Mirrors the harness conventions of
// tests/unit/services/workspaces.test.ts (RUN_ID-prefixed names,
// beforeAll/afterAll cleanup via services where they exist). Archive format
// (seal/open, header parsing) is already covered by
// tests/unit/backup/format.test.ts and is not re-tested here.

const RUN_ID = randomUUID();
const PASSPHRASE = "correct-horse-battery";
const ALL_SECTIONS = [...BACKUP_SECTIONS] as BackupSection[];

let ownerOp: { id: string };
let memberOp: { id: string };
let workspaceA: Workspace; // kitchen sink — one row of every exported model
const createdWorkspaceIds: string[] = [];
const createdOperatorIds: string[] = [];

// Seed handles captured while building workspace A, used by assertions below.
let parentCategoryName: string;
let childCategoryName: string;
let bookmarkName: string;
let mailFolderPath: string;
let mailAttachmentBytes: Buffer;
let providerCredentialLabel: string;
let providerCredentialData: { type: "CLOUDFLARE_DNS"; apiToken: string };
let originalWebhookTokenHash: string;
let parentCategoryCreatedAt: Date;
let seededCounts: Record<BackupSection extends string ? string : never, number>;

async function createWorkspaceFor(nameSuffix: string): Promise<Workspace> {
  const ws = await workspacesService.createWorkspace(ownerOp.id, {
    name: `Backup ${nameSuffix} ${RUN_ID}`,
  });
  createdWorkspaceIds.push(ws.id);
  return ws;
}

beforeAll(async () => {
  ownerOp = await db.operator.create({
    data: { username: `bk-owner-${RUN_ID}`, passwordHash: "x" },
  });
  createdOperatorIds.push(ownerOp.id);

  workspaceA = await createWorkspaceFor("A-kitchen-sink");

  const member = await workspacesService.addMember(
    workspaceA.id,
    { username: `bk-member-${RUN_ID}`, password: "member-password-value" },
    ownerOp.id,
  );
  memberOp = { id: member.operatorId };
  createdOperatorIds.push(member.operatorId);

  // Non-empty hiddenSections so AC-BCK-002's "replace applies manifest
  // hiddenSections" assertion is meaningful.
  await workspacesService.setHiddenSections(workspaceA.id, ownerOp.id, [
    "logs",
    "mail",
  ]);

  // --- bookmarks: Category parent + child (hierarchy), Bookmark in child ---
  parentCategoryName = `Parent Category ${RUN_ID}`;
  childCategoryName = `Child Category ${RUN_ID}`;
  const parentCategory = await bookmarksService.createCategory(workspaceA.id, {
    name: parentCategoryName,
  });
  parentCategoryCreatedAt = parentCategory.createdAt;
  const childCategory = await bookmarksService.createCategory(workspaceA.id, {
    name: childCategoryName,
    parentCategoryId: parentCategory.id,
  });
  bookmarkName = `Bookmark ${RUN_ID}`;
  await bookmarksService.createBookmark(workspaceA.id, {
    name: bookmarkName,
    url: "https://example.com/bookmark",
    categoryId: childCategory.id,
  });

  // --- messages: MessageCategory + Channel + Message ---
  const messageCategory = await messagesService.createCategory(
    workspaceA.id,
    `Message Category ${RUN_ID}`,
  );
  const channel = await messagesService.createChannel(
    workspaceA.id,
    messageCategory.id,
    `Channel ${RUN_ID}`,
  );
  await messagesService.createMessage(workspaceA.id, {
    channelId: channel.id,
    content: `Hello from ${RUN_ID}`,
    author: "tester",
  });

  // --- mail: IMAP MailAccount (real encrypted password) + folder + item + attachment ---
  const account = await mailAccountsService.createAccount(
    workspaceA.id,
    {
      name: `Mail Account ${RUN_ID}`,
      email: `mail-${RUN_ID}@example.com`,
      imapHost: "imap.example.com",
      imapPort: 993,
      imapSecurity: "SSL",
      smtpHost: "smtp.example.com",
      smtpPort: 465,
      smtpSecurity: "SSL",
      username: `mail-${RUN_ID}@example.com`,
      password: "imap-app-password-value",
      mode: "MOCK",
    },
  );
  // Simulate a stuck sync so the "reset to IDLE on import" assertion is
  // meaningful rather than trivially true.
  await db.mailAccount.update({
    where: { id: account.id },
    data: {
      syncStatus: "SYNCING",
      syncLeaseExpiresAt: new Date(Date.now() + 60_000),
    },
  });

  mailFolderPath = `INBOX-${RUN_ID}`;
  const mailFolder = await db.mailFolder.create({
    data: {
      workspaceId: workspaceA.id,
      accountId: account.id,
      accountWorkspaceId: workspaceA.id,
      path: mailFolderPath,
      name: "Inbox",
      specialUse: "INBOX",
      position: 0,
      uidValidity: 123456789n,
      lastSeenUid: 42n,
    },
  });

  const mailItem = await db.mailItem.create({
    data: {
      workspaceId: workspaceA.id,
      accountId: account.id,
      accountWorkspaceId: workspaceA.id,
      folderId: mailFolder.id,
      folderWorkspaceId: workspaceA.id,
      uid: 7n,
      fromAddress: "sender@example.com",
      subject: `Mail subject ${RUN_ID}`,
      bodyText: "Mail body text",
      toRecipients: [
        { address: "to@example.com", name: "To Name" },
      ] as Prisma.InputJsonValue,
      hasAttachments: true,
    },
  });

  mailAttachmentBytes = randomBytes(320);
  await db.mailAttachment.create({
    data: {
      mailItemId: mailItem.id,
      filename: "attachment.bin",
      contentType: "application/octet-stream",
      sizeBytes: mailAttachmentBytes.length,
      content: new Uint8Array(mailAttachmentBytes),
    },
  });

  // --- logs: LogEntry (no service creator for a bare entry — direct db) ---
  await db.logEntry.create({
    data: {
      workspaceId: workspaceA.id,
      level: "info",
      source: `svc-${RUN_ID}`,
      message: `Seed log entry ${RUN_ID}`,
    },
  });

  // --- alerts: AlertCategory + Alert (direct db, mirrors alerts.ts internals) ---
  const alertCategory = await db.alertCategory.create({
    data: { workspaceId: workspaceA.id, name: `Alert Category ${RUN_ID}` },
  });
  await db.alert.create({
    data: {
      workspaceId: workspaceA.id,
      alertCategoryId: alertCategory.id,
      alertCategoryWorkspaceId: workspaceA.id,
      severity: "critical",
      source: `svc-${RUN_ID}`,
      message: `Seed alert ${RUN_ID}`,
    },
  });

  // --- services: Service + ServiceCheck ---
  const service = await monitorServicesService.create(workspaceA.id, {
    name: `Service ${RUN_ID}`,
    monitorType: "HTTP",
    url: "https://example.com/health",
  });
  await db.serviceCheck.create({
    data: {
      workspaceId: workspaceA.id,
      serviceId: service.id,
      serviceWorkspaceId: workspaceA.id,
      status: "UP",
      responseTimeMs: 120,
    },
  });

  // --- webhooks: WebhookToken (via its service, real tokenHash) + OutgoingWebhook ---
  const { webhook: createdToken } = await webhookTokensService.createForChannel(
    channel.id,
    workspaceA.id,
    `Channel Webhook ${RUN_ID}`,
  );
  const storedToken = await db.webhookToken.findUniqueOrThrow({
    where: { id: createdToken.id },
  });
  originalWebhookTokenHash = storedToken.tokenHash;

  await outgoingWebhooksService.create(workspaceA.id, {
    name: `Outgoing Webhook ${RUN_ID}`,
    url: "https://example.com/incoming",
    events: ["ALERT_CREATED"],
    isActive: true,
  });

  // --- providers: ProviderCredential (service creator) + ProviderResourceBinding (direct db, natural key) ---
  providerCredentialLabel = `Credential ${RUN_ID}`;
  providerCredentialData = {
    type: "CLOUDFLARE_DNS",
    apiToken: `cf-token-${RUN_ID}`,
  };
  await credentialsService.createCredential(
    workspaceA.id,
    "CLOUDFLARE_DNS",
    providerCredentialLabel,
    providerCredentialData,
  );

  // ProviderResourceBinding has several DB-level CHECK constraints (see
  // prisma/migrations/20260714090000_q13_workspace_ownership/migration.sql):
  // provider must match the resourceType's allow-list, mode="REAL" forbids
  // "mock:"-prefixed accountKey/remoteId, and a non-null operationIntent
  // requires operationState to be RUNNING/RECONCILE_REQUIRED with the other
  // operation fields all populated (operationState=IDLE requires them all
  // null instead).
  await db.providerResourceBinding.create({
    data: {
      workspaceId: workspaceA.id,
      provider: "cloudflare",
      accountKey: `acct-${RUN_ID}`,
      resourceType: "DOMAIN",
      mode: "REAL",
      remoteId: `remote-${RUN_ID}`,
      displayName: `Domain ${RUN_ID}`,
      operationState: "RUNNING",
      operationId: `op-${RUN_ID}`,
      operationKind: "reconcile",
      operationIntent: { kind: "seed", note: RUN_ID } as Prisma.InputJsonValue,
      operationStartedAt: new Date(),
      operationLeaseExpiresAt: new Date(Date.now() + 60_000),
    },
  });

  seededCounts = {
    categories: 2,
    bookmarks: 1,
    messageCategories: 1,
    channels: 1,
    messages: 1,
    mailAccounts: 1,
    mailFolders: 1,
    mailItems: 1,
    mailAttachments: 1,
    logEntries: 1,
    alertCategories: 1,
    alerts: 1,
    services: 1,
    serviceChecks: 1,
    webhookTokens: 1,
    outgoingWebhooks: 1,
    providerResourceBindings: 1,
    providerCredentials: 1,
  };
}, 60_000);

afterAll(async () => {
  // ProviderResourceBinding.workspaceId is ON DELETE RESTRICT (Q-13
  // ownership semantics), so it must be cleared before the owning
  // workspace can be deleted.
  await db.providerResourceBinding
    .deleteMany({ where: { workspaceId: { in: createdWorkspaceIds } } })
    .catch(() => {});
  for (const id of createdWorkspaceIds) {
    await db.workspace.delete({ where: { id } }).catch(() => {});
  }
  for (const id of createdOperatorIds) {
    await db.operator.delete({ where: { id } }).catch(() => {});
  }
});

// Models where the DB enforces a *global* (not per-workspace) uniqueness
// invariant tied to the underlying secret/resource: WebhookToken.tokenHash
// (@unique — a hash of a secret never re-exported, so a colliding hash means
// the original row elsewhere is still the only usable owner) and
// ProviderResourceBinding's natural key (@@unique([provider, accountKey,
// resourceType, mode, remoteId]) — one workspace owns a given external
// resource). Both collision checks in importWorkspace query the table with
// no workspaceId filter, so as long as the *source* workspace (A) — whose
// export produced byte-identical tokenHash/natural-key values — still
// exists, every import of that archive anywhere (a fresh workspace, itself,
// mode merge or replace) finds the original row and skips re-inserting a
// duplicate. This holds in every scenario below where workspace A survives.
const GLOBAL_SINGLETON_MODELS = ["webhookTokens", "providerResourceBindings"];

function expectNormalModelCounts(
  imported: Record<string, number>,
  multiplier: number,
  overrides: Record<string, number> = {},
) {
  for (const [model, seeded] of Object.entries(seededCounts)) {
    if (GLOBAL_SINGLETON_MODELS.includes(model)) continue;
    const expected = overrides[model] ?? seeded * multiplier;
    expect(imported[model], `imported.${model}`).toBe(expected);
  }
}

describe("backup service", () => {
  describe("AC-BCK-001 round-trip: export all sections, merge into a fresh workspace", () => {
    let workspaceB: Workspace;
    let archiveAll: Buffer;
    let summary: Awaited<ReturnType<typeof backupService.importWorkspace>>;

    beforeAll(async () => {
      workspaceB = await createWorkspaceFor("B-merge-target");
      const { buffer } = await backupService.exportWorkspace(workspaceA.id, {
        passphrase: PASSPHRASE,
        sections: ALL_SECTIONS,
      });
      archiveAll = buffer;
      summary = await backupService.importWorkspace(workspaceB.id, {
        mode: "merge",
        passphrase: PASSPHRASE,
        file: archiveAll,
      });
    });

    it("imports a full copy of every seeded model into the fresh workspace", () => {
      expect(summary.mode).toBe("merge");
      expectNormalModelCounts(summary.imported, 1);
      // Global-singleton models are skipped because source workspace A still
      // owns the original tokenHash / natural-key row (see comment above).
      expect(summary.imported.webhookTokens).toBe(0);
      expect(summary.skipped.webhookTokens).toBe(1);
      expect(summary.imported.providerResourceBindings).toBe(0);
      expect(summary.skipped.providerResourceBindings).toBe(1);
    });

    it("remaps the bookmark's category and preserves parent/child hierarchy", async () => {
      const child = await db.category.findFirstOrThrow({
        where: { workspaceId: workspaceB.id, name: childCategoryName },
      });
      const parent = await db.category.findFirstOrThrow({
        where: { workspaceId: workspaceB.id, name: parentCategoryName },
      });
      expect(child.parentCategoryId).toBe(parent.id);

      const bookmark = await db.bookmark.findFirstOrThrow({
        where: { workspaceId: workspaceB.id, name: bookmarkName },
      });
      expect(bookmark.categoryId).toBe(child.id);
    });

    it("preserves the mail folder's uidValidity as a BigInt", async () => {
      const folder = await db.mailFolder.findFirstOrThrow({
        where: { workspaceId: workspaceB.id, path: mailFolderPath },
      });
      expect(folder.uidValidity).toBe(123456789n);
    });

    it("preserves mail attachment content bytes exactly", async () => {
      const attachment = await db.mailAttachment.findFirstOrThrow({
        where: { mailItem: { workspaceId: workspaceB.id } },
      });
      expect(Buffer.from(attachment.content!)).toEqual(mailAttachmentBytes);
    });

    it("preserves original createdAt timestamps", async () => {
      const parent = await db.category.findFirstOrThrow({
        where: { workspaceId: workspaceB.id, name: parentCategoryName },
      });
      expect(parent.createdAt.getTime()).toBe(
        parentCategoryCreatedAt.getTime(),
      );
    });

    it("imports a provider credential that decrypts to the original CredentialData", async () => {
      const row = await db.providerCredential.findFirstOrThrow({
        where: { workspaceId: workspaceB.id, label: providerCredentialLabel },
      });
      const decrypted = decrypt({
        encryptedData: row.encryptedData,
        iv: row.iv,
        authTag: row.authTag,
      });
      expect(decrypted).toEqual(providerCredentialData);
    });

    it("resets the imported mail account's syncStatus to IDLE", async () => {
      const account = await db.mailAccount.findFirstOrThrow({
        where: { workspaceId: workspaceB.id, kind: "IMAP" },
      });
      expect(account.syncStatus).toBe("IDLE");
      expect(account.syncLeaseExpiresAt).toBeNull();
    });

    describe("AC-BCK-002 replace: wipes existing rows and applies manifest hiddenSections", () => {
      beforeAll(async () => {
        // Pre-seed workspace B with its own extra content so "old rows gone"
        // is a meaningful assertion, not a vacuous one.
        const extraCategory = await bookmarksService.createCategory(
          workspaceB.id,
          { name: `Extra category ${RUN_ID}` },
        );
        await bookmarksService.createBookmark(workspaceB.id, {
          name: `Extra bookmark ${RUN_ID}`,
          url: "https://example.com/extra",
          categoryId: extraCategory.id,
        });
        await db.logEntry.create({
          data: {
            workspaceId: workspaceB.id,
            level: "warn",
            source: "extra",
            message: "Extra pre-existing log",
          },
        });

        summary = await backupService.importWorkspace(workspaceB.id, {
          mode: "replace",
          passphrase: PASSPHRASE,
          file: archiveAll,
        });
      });

      it("replaces content with exact archive counts (no accumulation)", () => {
        expect(summary.mode).toBe("replace");
        expectNormalModelCounts(summary.imported, 1);
        expect(summary.imported.webhookTokens).toBe(0);
        expect(summary.imported.providerResourceBindings).toBe(0);
      });

      it("removes the pre-existing extra bookmark/category/log", async () => {
        const extraCategory = await db.category.findFirst({
          where: {
            workspaceId: workspaceB.id,
            name: `Extra category ${RUN_ID}`,
          },
        });
        expect(extraCategory).toBeNull();
        const extraLog = await db.logEntry.findFirst({
          where: {
            workspaceId: workspaceB.id,
            message: "Extra pre-existing log",
          },
        });
        expect(extraLog).toBeNull();

        expect(
          await db.category.count({ where: { workspaceId: workspaceB.id } }),
        ).toBe(seededCounts.categories);
        expect(
          await db.bookmark.count({ where: { workspaceId: workspaceB.id } }),
        ).toBe(seededCounts.bookmarks);
        expect(
          await db.logEntry.count({ where: { workspaceId: workspaceB.id } }),
        ).toBe(seededCounts.logEntries);
      });

      it("applies the archive's manifest hiddenSections to the workspace", async () => {
        const updated = await db.workspace.findUniqueOrThrow({
          where: { id: workspaceB.id },
        });
        expect(updated.hiddenSections.sort()).toEqual(["logs", "mail"]);
      });
    });
  });

  describe("AC-BCK-003/005 merge into the same workspace: doubling, category reuse, secret-collision skips", () => {
    let archiveAll: Buffer;
    let summary: Awaited<ReturnType<typeof backupService.importWorkspace>>;

    beforeAll(async () => {
      const { buffer } = await backupService.exportWorkspace(workspaceA.id, {
        passphrase: PASSPHRASE,
        sections: ALL_SECTIONS,
      });
      archiveAll = buffer;
      summary = await backupService.importWorkspace(workspaceA.id, {
        mode: "merge",
        passphrase: PASSPHRASE,
        file: archiveAll,
      });
    });

    it("doubles per-model counts, except reused/skipped models", () => {
      expectNormalModelCounts(summary.imported, 1, {
        // AlertCategory is matched and reused by name on merge, so no new
        // row is created for the already-existing "Alert Category {RUN_ID}".
        alertCategories: 0,
      });
      // Workspace A only ever had an IMAP mail account (no WEBHOOK account
      // was auto-vivified anywhere above), so all archived mail accounts are
      // freshly inserted — mail models double along with everything else.
      expect(summary.imported.mailAccounts).toBe(seededCounts.mailAccounts);

      // AC-BCK-005: tokenHash / natural-key collide with A's own original
      // rows (see GLOBAL_SINGLETON_MODELS comment) — skipped, not doubled.
      expect(summary.imported.webhookTokens).toBe(0);
      expect(summary.skipped.webhookTokens).toBe(1);
      expect(summary.imported.providerResourceBindings).toBe(0);
      expect(summary.skipped.providerResourceBindings).toBe(1);
    });

    it("does not throw a unique-constraint violation", () => {
      // Implicit: beforeAll above already awaited importWorkspace without
      // throwing. This test documents that expectation explicitly.
      expect(summary.mode).toBe("merge");
    });

    it("keeps exactly one AlertCategory row for the reused name", async () => {
      expect(
        await db.alertCategory.count({
          where: {
            workspaceId: workspaceA.id,
            name: `Alert Category ${RUN_ID}`,
          },
        }),
      ).toBe(1);
    });

    it("AC-BCK-005: the original webhook token row still uniquely exists and works", async () => {
      expect(
        await db.webhookToken.count({
          where: { tokenHash: originalWebhookTokenHash },
        }),
      ).toBe(1);
      const original = await db.webhookToken.findUniqueOrThrow({
        where: { tokenHash: originalWebhookTokenHash },
      });
      expect(original.workspaceId).toBe(workspaceA.id);
      expect(original.revokedAt).toBeNull();
    });

    it("doubles bookmarks/categories (new ids, no name-based reuse)", async () => {
      expect(
        await db.category.count({
          where: { workspaceId: workspaceA.id, name: childCategoryName },
        }),
      ).toBe(2);
      expect(
        await db.bookmark.count({
          where: { workspaceId: workspaceA.id, name: bookmarkName },
        }),
      ).toBe(2);
    });
  });

  describe("AC-BCK-004 bad inputs", () => {
    let archiveAll: Buffer;

    beforeAll(async () => {
      const { buffer } = await backupService.exportWorkspace(workspaceA.id, {
        passphrase: PASSPHRASE,
        sections: ALL_SECTIONS,
      });
      archiveAll = buffer;
    });

    it("wrong passphrase throws BackupPassphraseInvalidError", async () => {
      await expect(
        backupService.importWorkspace(workspaceA.id, {
          mode: "merge",
          passphrase: "definitely-the-wrong-passphrase",
          file: archiveAll,
        }),
      ).rejects.toBeInstanceOf(BackupPassphraseInvalidError);
    });

    it("truncated file (< 53-byte header) throws BackupInvalidFileError", async () => {
      const truncated = Buffer.from(archiveAll.subarray(0, 40));
      await expect(
        backupService.importWorkspace(workspaceA.id, {
          mode: "merge",
          passphrase: PASSPHRASE,
          file: truncated,
        }),
      ).rejects.toBeInstanceOf(BackupInvalidFileError);
    });

    it("version byte patched to 2 throws BackupUnsupportedVersionError", async () => {
      const patched = Buffer.from(archiveAll);
      patched[8] = 2;
      await expect(
        backupService.importWorkspace(workspaceA.id, {
          mode: "merge",
          passphrase: PASSPHRASE,
          file: patched,
        }),
      ).rejects.toBeInstanceOf(BackupUnsupportedVersionError);
    });

    // "File larger than BACKUP_MAX_IMPORT_BYTES" is intentionally not tested:
    // src/lib/config/env.ts parses env.BACKUP_MAX_IMPORT_BYTES once at module
    // import time (`export const env = loadEnv();`), so it cannot be
    // cheaply overridden per-test without restarting the module graph. The
    // guard itself (`if (input.file.length > env.BACKUP_MAX_IMPORT_BYTES)
    // throw new BackupTooLargeError()`) is a trivial, directly-readable
    // one-line check in src/lib/services/backup.ts — low risk left uncovered.
  });

  describe("AC-BCK-006 WEBHOOK account merge: reuse by path, no duplicate account", () => {
    let workspaceC: Workspace;
    let webhookAccountA: { id: string };
    let importedMailItemSubject: string;

    beforeAll(async () => {
      workspaceC = await createWorkspaceFor("C-webhook-merge-target");

      // Workspace A gets its own WEBHOOK-kind account + INBOX folder + item,
      // created *after* the AC-BCK-003 self-merge test above so it does not
      // perturb that test's "mail accounts double" assumption (A had none
      // before this point).
      const { account, inboxFolder } =
        await mailAccountsService.getOrCreateWebhookAccount(workspaceA.id);
      webhookAccountA = { id: account.id };
      importedMailItemSubject = `Webhook mail ${RUN_ID}`;
      await db.mailItem.create({
        data: {
          workspaceId: workspaceA.id,
          accountId: account.id,
          accountWorkspaceId: workspaceA.id,
          folderId: inboxFolder.id,
          folderWorkspaceId: workspaceA.id,
          fromAddress: "webhook-sender@example.com",
          subject: importedMailItemSubject,
          bodyText: "Webhook-ingested body",
        },
      });

      // Workspace C already has its own WEBHOOK account + same-path folder.
      await mailAccountsService.getOrCreateWebhookAccount(workspaceC.id);

      const { buffer } = await backupService.exportWorkspace(workspaceA.id, {
        passphrase: PASSPHRASE,
        sections: ["mail"],
      });

      await backupService.importWorkspace(workspaceC.id, {
        mode: "merge",
        passphrase: PASSPHRASE,
        file: buffer,
      });
    });

    it("does not create a second WEBHOOK-kind mail account in workspace C", async () => {
      expect(
        await db.mailAccount.count({
          where: { workspaceId: workspaceC.id, kind: "WEBHOOK" },
        }),
      ).toBe(1);
    });

    it("reuses the existing INBOX folder by path instead of creating a duplicate", async () => {
      const webhookAccountC = await db.mailAccount.findFirstOrThrow({
        where: { workspaceId: workspaceC.id, kind: "WEBHOOK" },
      });
      expect(
        await db.mailFolder.count({ where: { accountId: webhookAccountC.id } }),
      ).toBe(1);
    });

    it("imports the archive's mail item into workspace C's reused folder", async () => {
      const webhookAccountC = await db.mailAccount.findFirstOrThrow({
        where: { workspaceId: workspaceC.id, kind: "WEBHOOK" },
      });
      const item = await db.mailItem.findFirst({
        where: {
          workspaceId: workspaceC.id,
          accountId: webhookAccountC.id,
          subject: importedMailItemSubject,
        },
      });
      expect(item).toBeTruthy();
    });

    it("workspace A's own webhook account and item are untouched", async () => {
      const item = await db.mailItem.findFirst({
        where: { workspaceId: workspaceA.id, subject: importedMailItemSubject },
      });
      expect(item?.accountId).toBe(webhookAccountA.id);
    });
  });

  describe("AC-BCK-007 owner enforcement lives at the service layer (workspace-auth)", () => {
    it("requireWorkspaceOwner throws WorkspaceOwnerRequiredError for a MEMBER", async () => {
      await expect(
        requireWorkspaceOwner(workspaceA.id, memberOp.id),
      ).rejects.toBeInstanceOf(WorkspaceOwnerRequiredError);
    });

    it("requireWorkspaceOwner resolves for the OWNER", async () => {
      await expect(
        requireWorkspaceOwner(workspaceA.id, ownerOp.id),
      ).resolves.toBeUndefined();
    });
  });

  describe("AC-BCK-008 partial export", () => {
    it("bookmarks-only export contains only categories+bookmarks data keys", async () => {
      const { buffer } = await backupService.exportWorkspace(workspaceA.id, {
        passphrase: PASSPHRASE,
        sections: ["bookmarks"],
      });
      const raw = openArchive(buffer, PASSPHRASE) as {
        manifest: { sections: string[] };
        data: Record<string, unknown>;
      };
      expect(raw.manifest.sections).toEqual(["bookmarks"]);
      expect(Object.keys(raw.data).sort()).toEqual(["bookmarks", "categories"]);
    });

    describe("replace-imports bookmarks-only archive into a workspace with a pre-existing log", () => {
      let workspaceD: Workspace;
      let expectedCategories: number;
      let expectedBookmarks: number;

      beforeAll(async () => {
        workspaceD = await createWorkspaceFor("D-partial-bookmarks-target");
        await db.logEntry.create({
          data: {
            workspaceId: workspaceD.id,
            level: "info",
            source: "pre-existing",
            message: `Pre-existing log ${RUN_ID}`,
          },
        });

        const { buffer } = await backupService.exportWorkspace(workspaceA.id, {
          passphrase: PASSPHRASE,
          sections: ["bookmarks"],
        });
        // Workspace A's own category/bookmark counts were doubled by the
        // AC-BCK-003 self-merge above, so read the *actual* manifest counts
        // for this export rather than assuming the pristine seededCounts.
        const opened = openArchive(buffer, PASSPHRASE) as {
          manifest: { counts: Record<string, number> };
        };
        expectedCategories = opened.manifest.counts.categories;
        expectedBookmarks = opened.manifest.counts.bookmarks;

        await backupService.importWorkspace(workspaceD.id, {
          mode: "replace",
          passphrase: PASSPHRASE,
          file: buffer,
        });
      });

      it("imports the archive's bookmarks/categories", async () => {
        expect(
          await db.category.count({ where: { workspaceId: workspaceD.id } }),
        ).toBe(expectedCategories);
        expect(
          await db.bookmark.count({ where: { workspaceId: workspaceD.id } }),
        ).toBe(expectedBookmarks);
      });

      it("leaves the pre-existing log entry untouched (logs section not in the archive)", async () => {
        const log = await db.logEntry.findFirst({
          where: {
            workspaceId: workspaceD.id,
            message: `Pre-existing log ${RUN_ID}`,
          },
        });
        expect(log).toBeTruthy();
        expect(
          await db.logEntry.count({ where: { workspaceId: workspaceD.id } }),
        ).toBe(1);
      });
    });

    describe("webhooks-only export (without messages) merges with channelId nulled out", () => {
      let workspaceE: Workspace;
      let tokenHash: string;
      let summary: Awaited<ReturnType<typeof backupService.importWorkspace>>;

      beforeAll(async () => {
        workspaceE = await createWorkspaceFor("E-partial-webhooks-target");

        // The tokenHash collision guard (see GLOBAL_SINGLETON_MODELS) is
        // global: as long as the *source* workspace still holds its own
        // original row, importing that same tokenHash anywhere else always
        // collides and is skipped — there is no way to get a genuinely
        // "fresh" token out of workspace A while A is still alive. To
        // exercise the real successful-import path (the actual
        // disaster-recovery use case: the source workspace no longer
        // exists by the time the archive is restored), seed a throwaway
        // source workspace, export from it, delete it, then import.
        const source = await createWorkspaceFor("G-webhook-token-source");
        const messageCategory = await messagesService.createCategory(
          source.id,
          `Msg Category ${RUN_ID}`,
        );
        const channel = await messagesService.createChannel(
          source.id,
          messageCategory.id,
          `Channel ${RUN_ID}`,
        );
        const { webhook: token } = await webhookTokensService.createForChannel(
          channel.id,
          source.id,
          `Channel Webhook ${RUN_ID}`,
        );
        const storedToken = await db.webhookToken.findUniqueOrThrow({
          where: { id: token.id },
        });
        tokenHash = storedToken.tokenHash;

        const { buffer } = await backupService.exportWorkspace(source.id, {
          passphrase: PASSPHRASE,
          sections: ["webhooks"],
        });

        await db.workspace.delete({ where: { id: source.id } });
        createdWorkspaceIds.splice(createdWorkspaceIds.indexOf(source.id), 1);

        summary = await backupService.importWorkspace(workspaceE.id, {
          mode: "merge",
          passphrase: PASSPHRASE,
          file: buffer,
        });
      });

      it("imports the token (its source workspace no longer exists to collide with)", () => {
        expect(summary.skipped.webhookTokens).toBe(0);
        expect(summary.imported.webhookTokens).toBe(1);
      });

      it("imports the token with channelId nulled out (messages section absent)", async () => {
        const imported = await db.webhookToken.findUniqueOrThrow({
          where: { tokenHash },
        });
        expect(imported.workspaceId).toBe(workspaceE.id);
        expect(imported.channelId).toBeNull();
      });
    });
  });
});
