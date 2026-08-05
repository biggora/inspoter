import { db } from "@/lib/db";
import type {
  MailAccount,
  MailAccountKind,
  MailFolder,
  MailSecurity,
  MailSpecialUse,
  MailSyncStatus,
  ProviderMode,
} from "@/generated/prisma/client";
import {
  encrypt,
  isEncryptionConfigured,
  maskSecret,
} from "@/lib/crypto/credentials";
import { getMailDriver, getMailDriverFromConfig } from "@/lib/mail";
import { EncryptionNotConfiguredError } from "@/lib/services/credentials";
import { logError } from "@/lib/services/logs";

export class MailAccountNotFoundError extends Error {
  constructor(id: string) {
    super(`Mail account not found: ${id}`);
    this.name = "MailAccountNotFoundError";
  }
}

// The system WEBHOOK account only allows renaming — its connection settings
// don't exist and the row must survive as the ingest target (plan §4).
export class WebhookAccountProtectedError extends Error {
  constructor() {
    super("The system webhook account cannot be modified or deleted");
    this.name = "WebhookAccountProtectedError";
  }
}

// One mailbox is one account. Connecting the same address on the same IMAP
// host twice would sync every message into two accounts and put two identical
// entries in the switcher, and the two copies would then drift as each syncs on
// its own lease. A different app password or display name does not make it a
// different mailbox, so identity is the address plus the host — never the
// secret, which may legitimately differ for the same mailbox.
export class DuplicateMailboxError extends Error {
  code = "MAILBOX_ALREADY_CONNECTED" as const;
  constructor(existingName: string) {
    super(`This mailbox is already connected as "${existingName}"`);
    this.name = "DuplicateMailboxError";
  }
}

// A space joins the two halves: neither an address nor a hostname may contain
// one, so the key cannot be ambiguous.
function mailboxKey(email: string, imapHost: string): string {
  return [email.trim().toLowerCase(), imapHost.trim().toLowerCase()].join(" ");
}

// Checked in the service rather than by a unique index: the stored columns keep
// the operator's own casing, so a case-insensitive constraint would need a
// normalized column plus a backfill that fails on any workspace that already
// has a duplicate. The dialog disables its submit while pending, so the
// remaining race is a concurrent write from two operators.
async function assertMailboxIsFree(
  workspaceId: string,
  email: string,
  imapHost: string,
  exceptAccountId?: string,
): Promise<void> {
  if (!email.trim() || !imapHost.trim()) return;

  const key = mailboxKey(email, imapHost);
  const candidates = await db.mailAccount.findMany({
    where: {
      workspaceId,
      kind: "IMAP",
      ...(exceptAccountId ? { id: { not: exceptAccountId } } : {}),
    },
    select: { name: true, email: true, imapHost: true },
  });

  const clash = candidates.find(
    (candidate) =>
      candidate.imapHost !== null &&
      mailboxKey(candidate.email, candidate.imapHost) === key,
  );
  if (clash) {
    throw new DuplicateMailboxError(clash.name);
  }
}

export interface WebhookMailbox {
  account: MailAccount;
  inboxFolder: MailFolder;
}

async function findWebhookMailbox(
  workspaceId: string,
): Promise<WebhookMailbox | null> {
  const account = await db.mailAccount.findFirst({
    where: { workspaceId, kind: "WEBHOOK" },
  });
  if (!account) return null;
  const inboxFolder = await db.mailFolder.findFirst({
    where: { accountId: account.id, path: "INBOX" },
  });
  // Account and INBOX are created in one transaction, so a visible account
  // implies its folder exists; null here means corrupted data — surface it.
  return inboxFolder ? { account, inboxFolder } : null;
}

// System webhook mailbox (kind WEBHOOK): at most one per workspace, enforced
// by the raw partial unique index MailAccount_workspaceId_webhook_key. The
// migration backfills it for existing workspaces; new workspaces get it
// lazily on first webhook mail.
export async function getOrCreateWebhookAccount(
  workspaceId: string,
): Promise<WebhookMailbox> {
  const existing = await findWebhookMailbox(workspaceId);
  if (existing) return existing;

  try {
    return await db.$transaction(async (tx) => {
      const account = await tx.mailAccount.create({
        data: {
          workspaceId,
          kind: "WEBHOOK",
          mode: "REAL",
          name: "Webhook",
          email: "",
          syncStatus: "IDLE",
        },
      });
      const inboxFolder = await tx.mailFolder.create({
        data: {
          workspaceId,
          accountId: account.id,
          accountWorkspaceId: workspaceId,
          path: "INBOX",
          // Base language, like every other name Inspoter writes itself. The
          // sidebar renders special-use folders from the message catalog
          // (SPECIAL_USE_NAME_KEYS in mail-sidebar.tsx), so this value only
          // shows up in the database, backups and the API.
          name: "Inbox",
          specialUse: "INBOX",
          position: 0,
        },
      });
      return { account, inboxFolder };
    });
  } catch (error) {
    // Partial unique index violation: a concurrent request created the
    // mailbox between our find and create — re-read and use theirs.
    const raced = await findWebhookMailbox(workspaceId);
    if (raced) return raced;
    throw error;
  }
}

export interface MailFolderSummary {
  id: string;
  path: string;
  name: string;
  specialUse: MailSpecialUse | null;
  position: number;
  unreadCount: number;
}

// Folder list for one account, sorted by position then name, with unread
// counts from a single groupBy. BigInt columns (uidValidity/lastSeenUid)
// intentionally never leave the service. Shared by the mail UI sidebar route
// and the MCP mail_folders_list tool.
export async function listFoldersForAccount(
  accountId: string,
  workspaceId: string,
): Promise<MailFolderSummary[]> {
  const account = await db.mailAccount.findFirst({
    where: { id: accountId, workspaceId },
    select: { id: true },
  });
  if (!account) throw new MailAccountNotFoundError(accountId);

  const [folders, unreadCounts] = await Promise.all([
    db.mailFolder.findMany({
      where: { accountId, workspaceId },
      orderBy: [{ position: "asc" }, { name: "asc" }],
    }),
    db.mailItem.groupBy({
      by: ["folderId"],
      where: { accountId, workspaceId, isRead: false },
      _count: true,
    }),
  ]);
  const unreadByFolder = new Map(
    unreadCounts.map((row) => [row.folderId, row._count]),
  );

  return folders.map((folder) => ({
    id: folder.id,
    path: folder.path,
    name: folder.name,
    specialUse: folder.specialUse,
    position: folder.position,
    unreadCount: unreadByFolder.get(folder.id) ?? 0,
  }));
}

// Secret-free projection of a MailAccount row — encryptedData/iv/authTag
// never leave the service (plan §6, blank-means-keep).
export interface MailAccountSummary {
  id: string;
  kind: MailAccountKind;
  mode: ProviderMode;
  name: string;
  email: string;
  imapHost: string | null;
  imapPort: number | null;
  imapSecurity: MailSecurity | null;
  smtpHost: string | null;
  smtpPort: number | null;
  smtpSecurity: MailSecurity | null;
  username: string | null;
  maskedHint: string | null;
  isValid: boolean | null;
  lastCheckedAt: Date | null;
  isActive: boolean;
  isDefault: boolean;
  syncStatus: MailSyncStatus;
  syncError: string | null;
  lastSyncAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateMailAccountData {
  name: string;
  email: string;
  imapHost: string;
  imapPort: number;
  imapSecurity: MailSecurity;
  smtpHost: string;
  smtpPort: number;
  smtpSecurity: MailSecurity;
  username: string;
  password: string;
  mode?: ProviderMode;
}

// Empty/absent password means "keep the stored one".
export type UpdateMailAccountData = Partial<CreateMailAccountData> & {
  isDefault?: true;
};

function toSummary(account: MailAccount): MailAccountSummary {
  return {
    id: account.id,
    kind: account.kind,
    mode: account.mode,
    name: account.name,
    email: account.email,
    imapHost: account.imapHost,
    imapPort: account.imapPort,
    imapSecurity: account.imapSecurity,
    smtpHost: account.smtpHost,
    smtpPort: account.smtpPort,
    smtpSecurity: account.smtpSecurity,
    username: account.username,
    maskedHint: account.maskedHint,
    isValid: account.isValid,
    lastCheckedAt: account.lastCheckedAt,
    isActive: account.isActive,
    isDefault: account.isDefault,
    syncStatus: account.syncStatus,
    syncError: account.syncError,
    lastSyncAt: account.lastSyncAt,
    createdAt: account.createdAt,
    updatedAt: account.updatedAt,
  };
}

// Runs verify() against the stored account and persists the outcome. Never
// throws: a broken config/transport must not fail create/update — the
// account is saved with isValid=false and the dialog shows the state.
async function verifyAndPersist(account: MailAccount): Promise<MailAccount> {
  let isValid = false;
  try {
    const driver = await getMailDriver(account);
    try {
      const result = await driver.verify();
      isValid = result.imapOk && result.smtpOk;
    } finally {
      await driver.close().catch(() => {});
    }
  } catch {
    // Driver construction failed (incomplete settings, decryption error) —
    // keep isValid=false.
  }
  return db.mailAccount.update({
    where: { id: account.id },
    data: { isValid, lastCheckedAt: new Date() },
  });
}

export async function listAccounts(
  workspaceId: string,
): Promise<MailAccountSummary[]> {
  // The system webhook mailbox must always show up in settings, even for
  // workspaces that never received webhook mail.
  await getOrCreateWebhookAccount(workspaceId);
  const accounts = await db.mailAccount.findMany({
    where: { workspaceId },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
  });
  return accounts.map(toSummary);
}

export interface MailAccountIdentity {
  id: string;
  name: string;
  email: string;
}

/**
 * Just enough to label a mailbox: id, name, address. Read-only on purpose —
 * unlike listAccounts() it never creates the webhook mailbox, so the dashboard
 * widget resolver can call it on every poll without writing to the database.
 */
export async function listAccountIdentities(
  workspaceId: string,
): Promise<MailAccountIdentity[]> {
  return db.mailAccount.findMany({
    where: { workspaceId },
    select: { id: true, name: true, email: true },
    orderBy: { createdAt: "asc" },
  });
}

export async function createAccount(
  workspaceId: string,
  input: CreateMailAccountData,
): Promise<MailAccountSummary> {
  if (!isEncryptionConfigured()) {
    throw new EncryptionNotConfiguredError();
  }

  await assertMailboxIsFree(workspaceId, input.email, input.imapHost);

  const encrypted = encrypt({
    type: "MAIL_PASSWORD",
    imapPassword: input.password,
  });

  const account = await db.mailAccount.create({
    data: {
      workspaceId,
      kind: "IMAP",
      mode: input.mode ?? "REAL",
      name: input.name,
      email: input.email,
      imapHost: input.imapHost,
      imapPort: input.imapPort,
      imapSecurity: input.imapSecurity,
      smtpHost: input.smtpHost,
      smtpPort: input.smtpPort,
      smtpSecurity: input.smtpSecurity,
      username: input.username,
      encryptedData: encrypted.encryptedData,
      iv: encrypted.iv,
      authTag: encrypted.authTag,
      maskedHint: maskSecret(input.password),
      syncStatus: "IDLE",
    },
  });

  return toSummary(await verifyAndPersist(account));
}

const CONNECTION_FIELDS = [
  "email",
  "imapHost",
  "imapPort",
  "imapSecurity",
  "smtpHost",
  "smtpPort",
  "smtpSecurity",
  "username",
] as const;

export async function updateAccount(
  workspaceId: string,
  id: string,
  input: UpdateMailAccountData,
): Promise<MailAccountSummary> {
  const existing = await db.mailAccount.findFirst({
    where: { id, workspaceId },
  });
  if (!existing) {
    throw new MailAccountNotFoundError(id);
  }

  const password = input.password ? input.password : undefined;

  if (existing.kind === "WEBHOOK") {
    const touchesProtectedField =
      password !== undefined ||
      input.mode !== undefined ||
      CONNECTION_FIELDS.some((field) => input[field] !== undefined);
    if (touchesProtectedField) {
      throw new WebhookAccountProtectedError();
    }
    const data = {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.isDefault ? { isDefault: true } : {}),
    };
    const renamed = input.isDefault
      ? await db.$transaction(async (tx) => {
          await tx.mailAccount.updateMany({
            where: {
              workspaceId,
              id: { not: existing.id },
              isDefault: true,
            },
            data: { isDefault: false },
          });
          return tx.mailAccount.update({
            where: { id: existing.id },
            data,
          });
        })
      : await db.mailAccount.update({
          where: { id: existing.id },
          data,
        });
    return toSummary(renamed);
  }

  if (input.email !== undefined || input.imapHost !== undefined) {
    await assertMailboxIsFree(
      workspaceId,
      input.email ?? existing.email,
      input.imapHost ?? existing.imapHost ?? "",
      existing.id,
    );
  }

  const connectionChanged =
    password !== undefined ||
    CONNECTION_FIELDS.some(
      (field) => input[field] !== undefined && input[field] !== existing[field],
    );

  let secretData = {};
  if (password !== undefined) {
    if (!isEncryptionConfigured()) {
      throw new EncryptionNotConfiguredError();
    }
    const encrypted = encrypt({
      type: "MAIL_PASSWORD",
      imapPassword: password,
    });
    secretData = {
      encryptedData: encrypted.encryptedData,
      iv: encrypted.iv,
      authTag: encrypted.authTag,
      maskedHint: maskSecret(password),
    };
  }

  const updateData = {
    ...(input.name !== undefined ? { name: input.name } : {}),
    ...(input.email !== undefined ? { email: input.email } : {}),
    ...(input.imapHost !== undefined ? { imapHost: input.imapHost } : {}),
    ...(input.imapPort !== undefined ? { imapPort: input.imapPort } : {}),
    ...(input.imapSecurity !== undefined
      ? { imapSecurity: input.imapSecurity }
      : {}),
    ...(input.smtpHost !== undefined ? { smtpHost: input.smtpHost } : {}),
    ...(input.smtpPort !== undefined ? { smtpPort: input.smtpPort } : {}),
    ...(input.smtpSecurity !== undefined
      ? { smtpSecurity: input.smtpSecurity }
      : {}),
    ...(input.username !== undefined ? { username: input.username } : {}),
    ...(input.mode !== undefined ? { mode: input.mode } : {}),
    ...(input.isDefault ? { isDefault: true } : {}),
    ...secretData,
  };

  const updated = input.isDefault
    ? await db.$transaction(async (tx) => {
        await tx.mailAccount.updateMany({
          where: {
            workspaceId,
            id: { not: existing.id },
            isDefault: true,
          },
          data: { isDefault: false },
        });
        return tx.mailAccount.update({
          where: { id: existing.id },
          data: updateData,
        });
      })
    : await db.mailAccount.update({
        where: { id: existing.id },
        data: updateData,
      });

  if (!connectionChanged) {
    return toSummary(updated);
  }
  return toSummary(await verifyAndPersist(updated));
}

export async function deleteAccount(
  workspaceId: string,
  id: string,
): Promise<void> {
  const existing = await db.mailAccount.findFirst({
    where: { id, workspaceId },
  });
  if (!existing) {
    throw new MailAccountNotFoundError(id);
  }
  if (existing.kind === "WEBHOOK") {
    throw new WebhookAccountProtectedError();
  }
  await db.$transaction(async (tx) => {
    await tx.mailAccount.delete({ where: { id: existing.id } });
    if (!existing.isDefault) return;

    const replacement =
      (await tx.mailAccount.findFirst({
        where: { workspaceId, kind: "IMAP" },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: { id: true },
      })) ??
      (await tx.mailAccount.findFirst({
        where: { workspaceId },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: { id: true },
      }));

    if (replacement) {
      await tx.mailAccount.update({
        where: { id: replacement.id },
        data: { isDefault: true },
      });
    }
  });
}

export interface TestConnectionData {
  email: string;
  imapHost: string;
  imapPort: number;
  imapSecurity: MailSecurity;
  smtpHost: string;
  smtpPort: number;
  smtpSecurity: MailSecurity;
  username: string;
  password: string;
  mode?: ProviderMode;
}

// Transient verify from raw dialog input — nothing is persisted and no
// account row is involved (POST /api/mail/accounts/test, plan §4).
export async function testConnection(
  workspaceId: string,
  input: TestConnectionData,
): Promise<{ imapOk: boolean; smtpOk: boolean; error: string | null }> {
  const driver = getMailDriverFromConfig(
    {
      email: input.email,
      imapHost: input.imapHost,
      imapPort: input.imapPort,
      imapSecurity: input.imapSecurity,
      smtpHost: input.smtpHost,
      smtpPort: input.smtpPort,
      smtpSecurity: input.smtpSecurity,
      username: input.username,
      imapPassword: input.password,
      // Mirrors getMailDriver() so out-of-band IMAP socket errors from a
      // "Test connection" attempt reach the Logs page too — skipped for
      // the mock path since MockMailDriver never emits transport errors.
      ...(input.mode === "MOCK"
        ? {}
        : {
            onTransportError: (message: string, details: string) =>
              logError(workspaceId, "mail:imap", message, details),
          }),
    },
    { mock: input.mode === "MOCK" },
  );
  try {
    return await driver.verify();
  } finally {
    await driver.close().catch(() => {});
  }
}
