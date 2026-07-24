import { db } from "@/lib/db";
import type {
  MailAccount,
  MailAccountKind,
  MailFolder,
  MailSecurity,
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
          // TODO(i18n): DB-persisted default folder name — migrating needs a
          // data migration for existing rows, out of scope for Phase C.
          name: "Входящие",
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
export type UpdateMailAccountData = Partial<CreateMailAccountData>;

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
    orderBy: { createdAt: "asc" },
  });
  return accounts.map(toSummary);
}

export async function createAccount(
  workspaceId: string,
  input: CreateMailAccountData,
): Promise<MailAccountSummary> {
  if (!isEncryptionConfigured()) {
    throw new EncryptionNotConfiguredError();
  }

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
    const renamed = await db.mailAccount.update({
      where: { id: existing.id },
      data: input.name !== undefined ? { name: input.name } : {},
    });
    return toSummary(renamed);
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

  const updated = await db.mailAccount.update({
    where: { id: existing.id },
    data: {
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
      ...secretData,
    },
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
  await db.mailAccount.delete({ where: { id: existing.id } });
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
    },
    { mock: input.mode === "MOCK" },
  );
  try {
    return await driver.verify();
  } finally {
    await driver.close().catch(() => {});
  }
}
