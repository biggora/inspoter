import crypto from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import type {
  Category,
  Bookmark,
  MessageCategory,
  Channel,
  Message,
  MailAccount,
  MailFolder,
  MailItem,
  MailAttachment,
  LogEntry,
  AlertCategory,
  Alert,
  Service,
  ServiceCheck,
  WebhookToken,
  OutgoingWebhook,
  ProviderResourceBinding,
  ProviderCredential,
} from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { env } from "@/lib/config/env";
import {
  sealArchive,
  openArchive,
  BackupInvalidFileError,
  BackupTooLargeError,
} from "@/lib/backup/format";
import {
  BACKUP_SCHEMA_VERSION,
  backupPayloadSchema,
  type BackupSection,
  type BackupPayloadV1,
  type BackupData,
  type BackupManifest,
  type BackupCategoryRecord,
  type BackupBookmarkRecord,
  type BackupMessageCategoryRecord,
  type BackupChannelRecord,
  type BackupMessageRecord,
  type BackupMailAccountRecord,
  type BackupMailFolderRecord,
  type BackupMailItemRecord,
  type BackupMailAttachmentRecord,
  type BackupLogEntryRecord,
  type BackupAlertCategoryRecord,
  type BackupAlertRecord,
  type BackupServiceRecord,
  type BackupServiceCheckRecord,
  type BackupWebhookTokenRecord,
  type BackupOutgoingWebhookRecord,
  type BackupProviderResourceBindingRecord,
  type BackupProviderCredentialRecord,
} from "@/lib/backup/serialization";
import {
  encrypt,
  decrypt,
  isEncryptionConfigured,
} from "@/lib/crypto/credentials";
import { EncryptionNotConfiguredError } from "@/lib/services/outgoingWebhooks";
import { WorkspaceNotFoundError } from "@/lib/services/workspaces";
import type { BackupImportMode } from "@/lib/validation/backup";
import packageJson from "../../../package.json";

// Sole service layer for the workspace backup feature (export + import).
// Owner authorization is enforced by the API route (requireWorkspaceOwner),
// not here — mirrors the credentials/mail-account service convention.

export class BackupSecretDecryptError extends Error {
  readonly code = "BACKUP_SECRET_DECRYPT_FAILED" as const;
  constructor() {
    super("Could not decrypt a secret stored in this workspace");
    this.name = "BackupSecretDecryptError";
  }
}

// Re-exported so existing imports (e.g. src/app/api/backup/errors.ts) keep
// working now that the class lives alongside openArchive's size guard.
export { BackupTooLargeError };

export interface BackupImportSummary {
  mode: BackupImportMode;
  imported: Record<string, number>;
  skipped: { webhookTokens: number; providerResourceBindings: number };
}

// --- Shared helpers ---

function iso(date: Date): string {
  return date.toISOString();
}

function isoOrNull(date: Date | null): string | null {
  return date === null ? null : date.toISOString();
}

function bigintOrNull(value: bigint | null): string | null {
  return value === null ? null : value.toString();
}

function bytesToBase64(value: Uint8Array | null): string | null {
  return value === null ? null : Buffer.from(value).toString("base64");
}

function jsonInput(
  value: unknown,
): Prisma.NullableJsonNullValueInput | Prisma.InputJsonValue {
  return value === null ? Prisma.JsonNull : (value as Prisma.InputJsonValue);
}

function formatTimestamp(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `-${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}`
  );
}

async function createManyChunked<T>(
  create: (chunk: T[]) => Promise<unknown>,
  rows: T[],
  chunkSize: number,
): Promise<void> {
  for (let i = 0; i < rows.length; i += chunkSize) {
    await create(rows.slice(i, i + chunkSize));
  }
}

function mustRemap(map: Map<string, string>, id: string): string {
  const mapped = map.get(id);
  if (mapped === undefined) throw new BackupInvalidFileError();
  return mapped;
}

function remapOrNull(
  map: Map<string, string>,
  id: string | null,
): string | null {
  if (id === null) return null;
  return map.get(id) ?? null;
}

// ============================================================
// Export
// ============================================================

function toCategoryRecord(row: Category): BackupCategoryRecord {
  return {
    id: row.id,
    name: row.name,
    position: row.position,
    parentCategoryId: row.parentCategoryId,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

function toBookmarkRecord(row: Bookmark): BackupBookmarkRecord {
  return {
    id: row.id,
    categoryId: row.categoryId,
    name: row.name,
    url: row.url,
    icon: row.icon,
    color: row.color,
    description: row.description,
    position: row.position,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

function toMessageCategoryRecord(
  row: MessageCategory,
): BackupMessageCategoryRecord {
  return {
    id: row.id,
    name: row.name,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

function toChannelRecord(row: Channel): BackupChannelRecord {
  return {
    id: row.id,
    messageCategoryId: row.messageCategoryId,
    name: row.name,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

function toMessageRecord(row: Message): BackupMessageRecord {
  return {
    id: row.id,
    channelId: row.channelId,
    content: row.content,
    author: row.author,
    origin: row.origin,
    createdAt: iso(row.createdAt),
  };
}

// MailAccount.encryptedData is nullable (WEBHOOK-kind accounts have no
// credentials); every other secret model below always has one.
function decryptMailAccountSecret(
  row: MailAccount,
): Record<string, unknown> | null {
  if (row.encryptedData === null || row.iv === null || row.authTag === null) {
    return null;
  }
  try {
    const data = decrypt({
      encryptedData: row.encryptedData,
      iv: row.iv,
      authTag: row.authTag,
    });
    return data as unknown as Record<string, unknown>;
  } catch {
    throw new BackupSecretDecryptError();
  }
}

// Decrypted secretData shape per model (exact CredentialData subtype):
// MailAccount -> { type: "MAIL_PASSWORD"; imapPassword: string; smtpPassword?: string } | null
function toMailAccountRecord(row: MailAccount): BackupMailAccountRecord {
  return {
    id: row.id,
    kind: row.kind,
    mode: row.mode,
    name: row.name,
    email: row.email,
    imapHost: row.imapHost,
    imapPort: row.imapPort,
    imapSecurity: row.imapSecurity,
    smtpHost: row.smtpHost,
    smtpPort: row.smtpPort,
    smtpSecurity: row.smtpSecurity,
    username: row.username,
    secretData: decryptMailAccountSecret(row),
    maskedHint: row.maskedHint,
    isValid: row.isValid,
    lastCheckedAt: isoOrNull(row.lastCheckedAt),
    isActive: row.isActive,
    syncStatus: row.syncStatus,
    syncError: row.syncError,
    lastSyncAt: isoOrNull(row.lastSyncAt),
    nextSyncAt: isoOrNull(row.nextSyncAt),
    syncLeaseExpiresAt: isoOrNull(row.syncLeaseExpiresAt),
    syncIntervalSeconds: row.syncIntervalSeconds,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

function toMailFolderRecord(row: MailFolder): BackupMailFolderRecord {
  return {
    id: row.id,
    accountId: row.accountId,
    path: row.path,
    name: row.name,
    delimiter: row.delimiter,
    specialUse: row.specialUse,
    position: row.position,
    uidValidity: bigintOrNull(row.uidValidity),
    lastSeenUid: bigintOrNull(row.lastSeenUid),
    lastSyncAt: isoOrNull(row.lastSyncAt),
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

function toMailItemRecord(row: MailItem): BackupMailItemRecord {
  return {
    id: row.id,
    accountId: row.accountId,
    folderId: row.folderId,
    uid: bigintOrNull(row.uid),
    messageId: row.messageId,
    fromAddress: row.fromAddress,
    fromName: row.fromName,
    toRecipients: row.toRecipients,
    ccRecipients: row.ccRecipients,
    bccRecipients: row.bccRecipients,
    replyToAddress: row.replyToAddress,
    subject: row.subject,
    bodyText: row.bodyText,
    bodyHtml: row.bodyHtml,
    snippet: row.snippet,
    isRead: row.isRead,
    isAnswered: row.isAnswered,
    isFlagged: row.isFlagged,
    hasAttachments: row.hasAttachments,
    receivedAt: iso(row.receivedAt),
    createdAt: iso(row.createdAt),
  };
}

function toMailAttachmentRecord(
  row: MailAttachment,
): BackupMailAttachmentRecord {
  return {
    id: row.id,
    mailItemId: row.mailItemId,
    partId: row.partId,
    filename: row.filename,
    contentType: row.contentType,
    sizeBytes: row.sizeBytes,
    contentId: row.contentId,
    isInline: row.isInline,
    content: bytesToBase64(row.content),
    fetchedAt: isoOrNull(row.fetchedAt),
    createdAt: iso(row.createdAt),
  };
}

function toLogEntryRecord(row: LogEntry): BackupLogEntryRecord {
  return {
    id: row.id,
    level: row.level,
    source: row.source,
    message: row.message,
    timestamp: iso(row.timestamp),
    createdAt: iso(row.createdAt),
  };
}

function toAlertCategoryRecord(row: AlertCategory): BackupAlertCategoryRecord {
  return {
    id: row.id,
    name: row.name,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

function toAlertRecord(row: Alert): BackupAlertRecord {
  return {
    id: row.id,
    alertCategoryId: row.alertCategoryId,
    severity: row.severity,
    source: row.source,
    message: row.message,
    timestamp: iso(row.timestamp),
    createdAt: iso(row.createdAt),
  };
}

function toServiceRecord(row: Service): BackupServiceRecord {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    monitorType: row.monitorType,
    url: row.url,
    host: row.host,
    port: row.port,
    expectedStatusCodes: row.expectedStatusCodes,
    intervalSeconds: row.intervalSeconds,
    timeoutMs: row.timeoutMs,
    retries: row.retries,
    isActive: row.isActive,
    currentStatus: row.currentStatus,
    consecutiveFailures: row.consecutiveFailures,
    lastCheckedAt: isoOrNull(row.lastCheckedAt),
    lastResponseTimeMs: row.lastResponseTimeMs,
    lastMessage: row.lastMessage,
    nextCheckAt: iso(row.nextCheckAt),
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

function toServiceCheckRecord(row: ServiceCheck): BackupServiceCheckRecord {
  return {
    id: row.id,
    serviceId: row.serviceId,
    status: row.status,
    responseTimeMs: row.responseTimeMs,
    message: row.message,
    checkedAt: iso(row.checkedAt),
    createdAt: iso(row.createdAt),
  };
}

function toWebhookTokenRecord(row: WebhookToken): BackupWebhookTokenRecord {
  return {
    id: row.id,
    channelId: row.channelId,
    name: row.name,
    tokenHash: row.tokenHash,
    tokenPrefix: row.tokenPrefix,
    createdAt: iso(row.createdAt),
    revokedAt: isoOrNull(row.revokedAt),
    lastUsedAt: isoOrNull(row.lastUsedAt),
  };
}

// OutgoingWebhook -> { type: "WEBHOOK_SECRET"; secret: string }
function decryptOutgoingWebhookSecret(
  row: OutgoingWebhook,
): Record<string, unknown> {
  try {
    const data = decrypt({
      encryptedData: row.encryptedData,
      iv: row.iv,
      authTag: row.authTag,
    });
    return data as unknown as Record<string, unknown>;
  } catch {
    throw new BackupSecretDecryptError();
  }
}

function toOutgoingWebhookRecord(
  row: OutgoingWebhook,
): BackupOutgoingWebhookRecord {
  return {
    id: row.id,
    name: row.name,
    url: row.url,
    events: row.events,
    isActive: row.isActive,
    secretData: decryptOutgoingWebhookSecret(row),
    secretPrefix: row.secretPrefix,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

function toProviderResourceBindingRecord(
  row: ProviderResourceBinding,
): BackupProviderResourceBindingRecord {
  return {
    id: row.id,
    provider: row.provider,
    accountKey: row.accountKey,
    resourceType: row.resourceType,
    mode: row.mode,
    remoteId: row.remoteId,
    displayName: row.displayName,
    operationState: row.operationState,
    operationId: row.operationId,
    operationKind: row.operationKind,
    operationIntent: row.operationIntent,
    operationStartedAt: isoOrNull(row.operationStartedAt),
    operationLeaseExpiresAt: isoOrNull(row.operationLeaseExpiresAt),
    lastReconciledAt: isoOrNull(row.lastReconciledAt),
    version: row.version,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

// ProviderCredential -> one of the non-MAIL_PASSWORD/WEBHOOK_SECRET
// CredentialData variants (CLOUDFLARE_DNS/HETZNER_DNS/HETZNER_CLOUD/
// GODADDY_DNS/HOSTINGER/CPANEL_WHM/CPANEL_UAPI), matching row.provider.
function decryptProviderCredentialSecret(
  row: ProviderCredential,
): Record<string, unknown> {
  try {
    const data = decrypt({
      encryptedData: row.encryptedData,
      iv: row.iv,
      authTag: row.authTag,
    });
    return data as unknown as Record<string, unknown>;
  } catch {
    throw new BackupSecretDecryptError();
  }
}

function toProviderCredentialRecord(
  row: ProviderCredential,
): BackupProviderCredentialRecord {
  return {
    id: row.id,
    provider: row.provider,
    label: row.label,
    secretData: decryptProviderCredentialSecret(row),
    maskedHint: row.maskedHint,
    allowInsecure: row.allowInsecure,
    isValid: row.isValid,
    lastCheckedAt: isoOrNull(row.lastCheckedAt),
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

async function fetchMailAttachments(
  tx: Prisma.TransactionClient,
  workspaceId: string,
): Promise<MailAttachment[]> {
  const rows: MailAttachment[] = [];
  let cursorId: string | null = null;
  for (;;) {
    const batch: MailAttachment[] = cursorId
      ? await tx.mailAttachment.findMany({
          where: { mailItem: { workspaceId } },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          take: 100,
          cursor: { id: cursorId },
          skip: 1,
        })
      : await tx.mailAttachment.findMany({
          where: { mailItem: { workspaceId } },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          take: 100,
        });
    if (batch.length === 0) break;
    rows.push(...batch);
    if (batch.length < 100) break;
    cursorId = batch[batch.length - 1].id;
  }
  return rows;
}

function orderByCreated(): Array<{ createdAt: "asc" } | { id: "asc" }> {
  return [{ createdAt: "asc" }, { id: "asc" }];
}

export async function exportWorkspace(
  workspaceId: string,
  input: { passphrase: string; sections: BackupSection[] },
): Promise<{ buffer: Buffer; filename: string }> {
  const workspace = await db.workspace.findUnique({
    where: { id: workspaceId },
  });
  if (!workspace) throw new WorkspaceNotFoundError(workspaceId);

  const sections = input.sections;
  const data: BackupData = {};
  const counts: Record<string, number> = {};

  await db.$transaction(
    async (tx) => {
      if (sections.includes("bookmarks")) {
        const categories = await tx.category.findMany({
          where: { workspaceId },
          orderBy: orderByCreated(),
        });
        const bookmarks = await tx.bookmark.findMany({
          where: { workspaceId },
          orderBy: orderByCreated(),
        });
        data.categories = categories.map(toCategoryRecord);
        data.bookmarks = bookmarks.map(toBookmarkRecord);
        counts.categories = categories.length;
        counts.bookmarks = bookmarks.length;
      }

      if (sections.includes("messages")) {
        const messageCategories = await tx.messageCategory.findMany({
          where: { workspaceId },
          orderBy: orderByCreated(),
        });
        const channels = await tx.channel.findMany({
          where: { workspaceId },
          orderBy: orderByCreated(),
        });
        const messages = await tx.message.findMany({
          where: { workspaceId },
          orderBy: orderByCreated(),
        });
        data.messageCategories = messageCategories.map(toMessageCategoryRecord);
        data.channels = channels.map(toChannelRecord);
        data.messages = messages.map(toMessageRecord);
        counts.messageCategories = messageCategories.length;
        counts.channels = channels.length;
        counts.messages = messages.length;
      }

      if (sections.includes("mail")) {
        const mailAccounts = await tx.mailAccount.findMany({
          where: { workspaceId },
          orderBy: orderByCreated(),
        });
        const mailFolders = await tx.mailFolder.findMany({
          where: { workspaceId },
          orderBy: orderByCreated(),
        });
        const mailItems = await tx.mailItem.findMany({
          where: { workspaceId },
          orderBy: orderByCreated(),
        });
        const mailAttachments = await fetchMailAttachments(tx, workspaceId);

        if (
          mailAccounts.some((a) => a.encryptedData !== null) &&
          !isEncryptionConfigured()
        ) {
          throw new EncryptionNotConfiguredError();
        }

        data.mailAccounts = mailAccounts.map(toMailAccountRecord);
        data.mailFolders = mailFolders.map(toMailFolderRecord);
        data.mailItems = mailItems.map(toMailItemRecord);
        data.mailAttachments = mailAttachments.map(toMailAttachmentRecord);
        counts.mailAccounts = mailAccounts.length;
        counts.mailFolders = mailFolders.length;
        counts.mailItems = mailItems.length;
        counts.mailAttachments = mailAttachments.length;
      }

      if (sections.includes("logs")) {
        const logEntries = await tx.logEntry.findMany({
          where: { workspaceId },
          orderBy: orderByCreated(),
        });
        data.logEntries = logEntries.map(toLogEntryRecord);
        counts.logEntries = logEntries.length;
      }

      if (sections.includes("alerts")) {
        const alertCategories = await tx.alertCategory.findMany({
          where: { workspaceId },
          orderBy: orderByCreated(),
        });
        const alerts = await tx.alert.findMany({
          where: { workspaceId },
          orderBy: orderByCreated(),
        });
        data.alertCategories = alertCategories.map(toAlertCategoryRecord);
        data.alerts = alerts.map(toAlertRecord);
        counts.alertCategories = alertCategories.length;
        counts.alerts = alerts.length;
      }

      if (sections.includes("services")) {
        const services = await tx.service.findMany({
          where: { workspaceId },
          orderBy: orderByCreated(),
        });
        const serviceChecks = await tx.serviceCheck.findMany({
          where: { workspaceId },
          orderBy: orderByCreated(),
        });
        data.services = services.map(toServiceRecord);
        data.serviceChecks = serviceChecks.map(toServiceCheckRecord);
        counts.services = services.length;
        counts.serviceChecks = serviceChecks.length;
      }

      if (sections.includes("webhooks")) {
        const webhookTokens = await tx.webhookToken.findMany({
          where: { workspaceId },
          orderBy: orderByCreated(),
        });
        const outgoingWebhooks = await tx.outgoingWebhook.findMany({
          where: { workspaceId },
          orderBy: orderByCreated(),
        });

        if (outgoingWebhooks.length > 0 && !isEncryptionConfigured()) {
          throw new EncryptionNotConfiguredError();
        }

        data.webhookTokens = webhookTokens.map(toWebhookTokenRecord);
        data.outgoingWebhooks = outgoingWebhooks.map(toOutgoingWebhookRecord);
        counts.webhookTokens = webhookTokens.length;
        counts.outgoingWebhooks = outgoingWebhooks.length;
      }

      if (sections.includes("providers")) {
        const providerResourceBindings =
          await tx.providerResourceBinding.findMany({
            where: { workspaceId },
            orderBy: orderByCreated(),
          });
        const providerCredentials = await tx.providerCredential.findMany({
          where: { workspaceId },
          orderBy: orderByCreated(),
        });

        if (providerCredentials.length > 0 && !isEncryptionConfigured()) {
          throw new EncryptionNotConfiguredError();
        }

        data.providerResourceBindings = providerResourceBindings.map(
          toProviderResourceBindingRecord,
        );
        data.providerCredentials = providerCredentials.map(
          toProviderCredentialRecord,
        );
        counts.providerResourceBindings = providerResourceBindings.length;
        counts.providerCredentials = providerCredentials.length;
      }
    },
    {
      timeout: env.BACKUP_IMPORT_TX_TIMEOUT_MS,
      maxWait: 10_000,
      isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
    },
  );

  const manifest: BackupManifest = {
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    appVersion: packageJson.version,
    workspace: {
      id: workspace.id,
      name: workspace.name,
      slug: workspace.slug,
      hiddenSections: workspace.hiddenSections,
    },
    sections,
    counts,
  };

  const payload: BackupPayloadV1 = { manifest, data };
  const buffer = sealArchive(payload, input.passphrase);
  const filename = `inspot-backup-${workspace.slug}-${formatTimestamp(new Date())}.inspot-backup`;
  return { buffer, filename };
}

// ============================================================
// Import
// ============================================================

function topoSortCategories(
  categories: BackupCategoryRecord[],
): BackupCategoryRecord[] {
  const ids = new Set(categories.map((c) => c.id));
  const resolved = new Set<string>();
  const sorted: BackupCategoryRecord[] = [];
  let remaining = categories;
  while (remaining.length > 0) {
    const ready = remaining.filter(
      (c) =>
        c.parentCategoryId === null ||
        !ids.has(c.parentCategoryId) ||
        resolved.has(c.parentCategoryId),
    );
    if (ready.length === 0) throw new BackupInvalidFileError();
    for (const c of ready) resolved.add(c.id);
    sorted.push(...ready);
    remaining = remaining.filter((c) => !resolved.has(c.id));
  }
  return sorted;
}

export async function importWorkspace(
  workspaceId: string,
  input: { mode: BackupImportMode; passphrase: string; file: Buffer },
): Promise<BackupImportSummary> {
  if (input.file.length > env.BACKUP_MAX_IMPORT_BYTES) {
    throw new BackupTooLargeError();
  }

  const raw = openArchive(input.file, input.passphrase, {
    // 4x the compressed size cap is a pragmatic bound on decompressed
    // output — enough headroom for legitimate JSON payloads while still
    // guarding against a gzip bomb inflating a small archive unbounded.
    maxDecompressedBytes: env.BACKUP_MAX_IMPORT_BYTES * 4,
  });
  const parsed = backupPayloadSchema.safeParse(raw);
  if (!parsed.success) {
    throw new BackupInvalidFileError();
  }
  const payload = parsed.data;
  const { mode } = input;

  const hasSecrets =
    (payload.data.mailAccounts?.some((a) => a.secretData !== null) ?? false) ||
    (payload.data.outgoingWebhooks?.length ?? 0) > 0 ||
    (payload.data.providerCredentials?.length ?? 0) > 0;
  if (hasSecrets && !isEncryptionConfigured()) {
    throw new EncryptionNotConfiguredError();
  }

  return db.$transaction(
    async (tx) => {
      const sections = new Set(payload.manifest.sections);
      const imported: Record<string, number> = {};
      const skipped = { webhookTokens: 0, providerResourceBindings: 0 };

      if (mode === "replace") {
        if (sections.has("mail")) {
          await tx.mailAttachment.deleteMany({
            where: { mailItem: { workspaceId } },
          });
        }
        if (sections.has("webhooks")) {
          await tx.webhookDelivery.deleteMany({ where: { workspaceId } });
          await tx.idempotencyKey.deleteMany({ where: { workspaceId } });
        }
        if (sections.has("messages")) {
          await tx.message.deleteMany({ where: { workspaceId } });
        }
        if (sections.has("mail")) {
          await tx.mailItem.deleteMany({ where: { workspaceId } });
        }
        if (sections.has("services")) {
          await tx.serviceCheck.deleteMany({ where: { workspaceId } });
        }
        if (sections.has("bookmarks")) {
          await tx.bookmark.deleteMany({ where: { workspaceId } });
        }
        if (sections.has("webhooks")) {
          await tx.webhookToken.deleteMany({ where: { workspaceId } });
        }
        if (sections.has("alerts")) {
          await tx.alert.deleteMany({ where: { workspaceId } });
        }
        if (sections.has("messages")) {
          await tx.channel.deleteMany({ where: { workspaceId } });
        }
        if (sections.has("mail")) {
          await tx.mailFolder.deleteMany({ where: { workspaceId } });
        }
        if (sections.has("bookmarks")) {
          await tx.category.deleteMany({ where: { workspaceId } });
        }
        if (sections.has("messages")) {
          await tx.messageCategory.deleteMany({ where: { workspaceId } });
        }
        if (sections.has("alerts")) {
          await tx.alertCategory.deleteMany({ where: { workspaceId } });
        }
        if (sections.has("mail")) {
          await tx.mailAccount.deleteMany({ where: { workspaceId } });
        }
        if (sections.has("services")) {
          await tx.service.deleteMany({ where: { workspaceId } });
        }
        if (sections.has("webhooks")) {
          await tx.outgoingWebhook.deleteMany({ where: { workspaceId } });
        }
        if (sections.has("providers")) {
          await tx.providerResourceBinding.deleteMany({
            where: { workspaceId },
          });
          await tx.providerCredential.deleteMany({ where: { workspaceId } });
        }
        if (sections.has("logs")) {
          await tx.logEntry.deleteMany({ where: { workspaceId } });
        }
        if (sections.has("workspaceSettings")) {
          await tx.workspace.update({
            where: { id: workspaceId },
            data: { hiddenSections: payload.manifest.workspace.hiddenSections },
          });
        }
      }

      const categoryIdMap = new Map<string, string>();
      const messageCategoryIdMap = new Map<string, string>();
      const channelIdMap = new Map<string, string>();
      const mailAccountIdMap = new Map<string, string>();
      const remappedWebhookAccountOldIds = new Set<string>();
      const mailFolderIdMap = new Map<string, string>();
      const mailItemIdMap = new Map<string, string>();
      const alertCategoryIdMap = new Map<string, string>();
      const serviceIdMap = new Map<string, string>();

      // --- Tier 1: Category (self-referential, topological) ---
      if (payload.data.categories) {
        const sorted = topoSortCategories(payload.data.categories);
        const inserts = sorted.map((cat) => {
          const newId = crypto.randomUUID();
          categoryIdMap.set(cat.id, newId);
          const parentId =
            cat.parentCategoryId !== null
              ? (categoryIdMap.get(cat.parentCategoryId) ?? null)
              : null;
          return {
            id: newId,
            workspaceId,
            name: cat.name,
            position: cat.position,
            parentCategoryId: parentId,
            parentCategoryWorkspaceId: parentId !== null ? workspaceId : null,
            createdAt: cat.createdAt,
            updatedAt: cat.updatedAt,
          };
        });
        await createManyChunked(
          (chunk) => tx.category.createMany({ data: chunk }),
          inserts,
          500,
        );
        imported.categories = inserts.length;
      }

      // --- Tier 2: independent parents ---
      if (payload.data.messageCategories) {
        const inserts = payload.data.messageCategories.map((row) => {
          const newId = crypto.randomUUID();
          messageCategoryIdMap.set(row.id, newId);
          return {
            id: newId,
            workspaceId,
            name: row.name,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
          };
        });
        await createManyChunked(
          (chunk) => tx.messageCategory.createMany({ data: chunk }),
          inserts,
          500,
        );
        imported.messageCategories = inserts.length;
      }

      if (payload.data.alertCategories) {
        const existingByName =
          mode === "merge" && payload.data.alertCategories.length > 0
            ? new Map(
                (
                  await tx.alertCategory.findMany({
                    where: {
                      workspaceId,
                      name: {
                        in: payload.data.alertCategories.map((c) => c.name),
                      },
                    },
                  })
                ).map((c) => [c.name, c.id]),
              )
            : new Map<string, string>();

        const inserts: Array<{
          id: string;
          workspaceId: string;
          name: string;
          createdAt: string;
          updatedAt: string;
        }> = [];
        for (const row of payload.data.alertCategories) {
          const existingId = existingByName.get(row.name);
          if (existingId) {
            alertCategoryIdMap.set(row.id, existingId);
            continue;
          }
          const newId = crypto.randomUUID();
          alertCategoryIdMap.set(row.id, newId);
          inserts.push({
            id: newId,
            workspaceId,
            name: row.name,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
          });
        }
        await createManyChunked(
          (chunk) => tx.alertCategory.createMany({ data: chunk }),
          inserts,
          500,
        );
        imported.alertCategories = inserts.length;
      }

      if (payload.data.mailAccounts) {
        const existingWebhookAccount =
          mode === "merge"
            ? await tx.mailAccount.findFirst({
                where: { workspaceId, kind: "WEBHOOK" },
              })
            : null;

        const inserts = [];
        for (const row of payload.data.mailAccounts) {
          if (row.kind === "WEBHOOK" && existingWebhookAccount) {
            mailAccountIdMap.set(row.id, existingWebhookAccount.id);
            remappedWebhookAccountOldIds.add(row.id);
            continue;
          }
          const newId = crypto.randomUUID();
          mailAccountIdMap.set(row.id, newId);
          const secret =
            row.secretData !== null
              ? encrypt(row.secretData as Parameters<typeof encrypt>[0])
              : null;
          inserts.push({
            id: newId,
            workspaceId,
            kind: row.kind,
            mode: row.mode,
            name: row.name,
            email: row.email,
            imapHost: row.imapHost,
            imapPort: row.imapPort,
            imapSecurity: row.imapSecurity,
            smtpHost: row.smtpHost,
            smtpPort: row.smtpPort,
            smtpSecurity: row.smtpSecurity,
            username: row.username,
            encryptedData: secret?.encryptedData ?? null,
            iv: secret?.iv ?? null,
            authTag: secret?.authTag ?? null,
            maskedHint: row.maskedHint,
            isValid: row.isValid,
            lastCheckedAt: row.lastCheckedAt,
            isActive: row.isActive,
            syncStatus: "IDLE" as const,
            syncError: null,
            lastSyncAt: row.lastSyncAt,
            nextSyncAt: new Date(),
            syncLeaseExpiresAt: null,
            syncIntervalSeconds: row.syncIntervalSeconds,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
          });
        }
        await createManyChunked(
          (chunk) => tx.mailAccount.createMany({ data: chunk }),
          inserts,
          500,
        );
        imported.mailAccounts = inserts.length;
      }

      if (payload.data.services) {
        const inserts = payload.data.services.map((row) => {
          const newId = crypto.randomUUID();
          serviceIdMap.set(row.id, newId);
          return {
            id: newId,
            workspaceId,
            name: row.name,
            description: row.description,
            monitorType: row.monitorType,
            url: row.url,
            host: row.host,
            port: row.port,
            expectedStatusCodes: row.expectedStatusCodes,
            intervalSeconds: row.intervalSeconds,
            timeoutMs: row.timeoutMs,
            retries: row.retries,
            isActive: row.isActive,
            currentStatus: row.currentStatus,
            consecutiveFailures: row.consecutiveFailures,
            lastCheckedAt: row.lastCheckedAt,
            lastResponseTimeMs: row.lastResponseTimeMs,
            lastMessage: row.lastMessage,
            nextCheckAt: new Date(),
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
          };
        });
        await createManyChunked(
          (chunk) => tx.service.createMany({ data: chunk }),
          inserts,
          500,
        );
        imported.services = inserts.length;
      }

      if (payload.data.outgoingWebhooks) {
        const inserts = payload.data.outgoingWebhooks.map((row) => {
          const newId = crypto.randomUUID();
          const secret = encrypt(
            row.secretData as Parameters<typeof encrypt>[0],
          );
          return {
            id: newId,
            workspaceId,
            name: row.name,
            url: row.url,
            events: row.events,
            isActive: row.isActive,
            encryptedData: secret.encryptedData,
            iv: secret.iv,
            authTag: secret.authTag,
            secretPrefix: row.secretPrefix,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
          };
        });
        await createManyChunked(
          (chunk) => tx.outgoingWebhook.createMany({ data: chunk }),
          inserts,
          500,
        );
        imported.outgoingWebhooks = inserts.length;
      }

      if (payload.data.providerCredentials) {
        const inserts = payload.data.providerCredentials.map((row) => {
          const newId = crypto.randomUUID();
          const secret = encrypt(
            row.secretData as Parameters<typeof encrypt>[0],
          );
          return {
            id: newId,
            workspaceId,
            provider: row.provider,
            label: row.label,
            encryptedData: secret.encryptedData,
            iv: secret.iv,
            authTag: secret.authTag,
            maskedHint: row.maskedHint,
            allowInsecure: row.allowInsecure,
            isValid: row.isValid,
            lastCheckedAt: row.lastCheckedAt,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
          };
        });
        await createManyChunked(
          (chunk) => tx.providerCredential.createMany({ data: chunk }),
          inserts,
          500,
        );
        imported.providerCredentials = inserts.length;
      }

      if (payload.data.providerResourceBindings) {
        const candidates = payload.data.providerResourceBindings;
        const existing =
          candidates.length > 0
            ? await tx.providerResourceBinding.findMany({
                where: {
                  OR: candidates.map((b) => ({
                    provider: b.provider,
                    accountKey: b.accountKey,
                    resourceType: b.resourceType,
                    mode: b.mode,
                    remoteId: b.remoteId,
                  })),
                },
                select: {
                  provider: true,
                  accountKey: true,
                  resourceType: true,
                  mode: true,
                  remoteId: true,
                },
              })
            : [];
        const key = (b: {
          provider: string;
          accountKey: string;
          resourceType: string;
          mode: string;
          remoteId: string;
        }) =>
          `${b.provider}|${b.accountKey}|${b.resourceType}|${b.mode}|${b.remoteId}`;
        const existingKeys = new Set(existing.map(key));

        const inserts = [];
        for (const row of candidates) {
          if (existingKeys.has(key(row))) {
            skipped.providerResourceBindings += 1;
            continue;
          }
          inserts.push({
            id: crypto.randomUUID(),
            workspaceId,
            provider: row.provider,
            accountKey: row.accountKey,
            resourceType: row.resourceType,
            mode: row.mode,
            remoteId: row.remoteId,
            displayName: row.displayName,
            operationState: "IDLE" as const,
            operationId: null,
            operationKind: null,
            operationIntent: Prisma.JsonNull,
            operationStartedAt: null,
            operationLeaseExpiresAt: null,
            lastReconciledAt: row.lastReconciledAt,
            version: 1,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
          });
        }
        await createManyChunked(
          (chunk) => tx.providerResourceBinding.createMany({ data: chunk }),
          inserts,
          500,
        );
        imported.providerResourceBindings = inserts.length;
      }

      if (payload.data.logEntries) {
        const inserts = payload.data.logEntries.map((row) => ({
          id: crypto.randomUUID(),
          workspaceId,
          level: row.level,
          source: row.source,
          message: row.message,
          timestamp: row.timestamp,
          createdAt: row.createdAt,
        }));
        await createManyChunked(
          (chunk) => tx.logEntry.createMany({ data: chunk }),
          inserts,
          500,
        );
        imported.logEntries = inserts.length;
      }

      // --- Tier 3: children of tier 1/2 ---
      if (payload.data.bookmarks) {
        const inserts = payload.data.bookmarks.map((row) => {
          const categoryId = mustRemap(categoryIdMap, row.categoryId);
          return {
            id: crypto.randomUUID(),
            workspaceId,
            categoryId,
            categoryWorkspaceId: workspaceId,
            name: row.name,
            url: row.url,
            icon: row.icon,
            color: row.color,
            description: row.description,
            position: row.position,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
          };
        });
        await createManyChunked(
          (chunk) => tx.bookmark.createMany({ data: chunk }),
          inserts,
          500,
        );
        imported.bookmarks = inserts.length;
      }

      if (payload.data.channels) {
        const inserts = payload.data.channels.map((row) => {
          const newId = crypto.randomUUID();
          channelIdMap.set(row.id, newId);
          const messageCategoryId = mustRemap(
            messageCategoryIdMap,
            row.messageCategoryId,
          );
          return {
            id: newId,
            workspaceId,
            messageCategoryId,
            messageCategoryWorkspaceId: workspaceId,
            name: row.name,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
          };
        });
        await createManyChunked(
          (chunk) => tx.channel.createMany({ data: chunk }),
          inserts,
          500,
        );
        imported.channels = inserts.length;
      }

      if (payload.data.mailFolders) {
        const inserts = [];
        for (const row of payload.data.mailFolders) {
          const accountId = mustRemap(mailAccountIdMap, row.accountId);
          if (remappedWebhookAccountOldIds.has(row.accountId)) {
            const existingFolder = await tx.mailFolder.findFirst({
              where: { accountId, path: row.path },
            });
            if (existingFolder) {
              mailFolderIdMap.set(row.id, existingFolder.id);
              continue;
            }
          }
          const newId = crypto.randomUUID();
          mailFolderIdMap.set(row.id, newId);
          inserts.push({
            id: newId,
            workspaceId,
            accountId,
            accountWorkspaceId: workspaceId,
            path: row.path,
            name: row.name,
            delimiter: row.delimiter,
            specialUse: row.specialUse,
            position: row.position,
            uidValidity:
              row.uidValidity !== null ? BigInt(row.uidValidity) : null,
            lastSeenUid:
              row.lastSeenUid !== null ? BigInt(row.lastSeenUid) : null,
            lastSyncAt: row.lastSyncAt,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
          });
        }
        await createManyChunked(
          (chunk) => tx.mailFolder.createMany({ data: chunk }),
          inserts,
          500,
        );
        imported.mailFolders = inserts.length;
      }

      if (payload.data.alerts) {
        const inserts = payload.data.alerts.map((row) => {
          const alertCategoryId = remapOrNull(
            alertCategoryIdMap,
            row.alertCategoryId,
          );
          return {
            id: crypto.randomUUID(),
            workspaceId,
            alertCategoryId,
            alertCategoryWorkspaceId:
              alertCategoryId !== null ? workspaceId : null,
            severity: row.severity,
            source: row.source,
            message: row.message,
            timestamp: row.timestamp,
            createdAt: row.createdAt,
          };
        });
        await createManyChunked(
          (chunk) => tx.alert.createMany({ data: chunk }),
          inserts,
          500,
        );
        imported.alerts = inserts.length;
      }

      if (payload.data.serviceChecks) {
        const inserts = payload.data.serviceChecks.map((row) => {
          const serviceId = mustRemap(serviceIdMap, row.serviceId);
          return {
            id: crypto.randomUUID(),
            workspaceId,
            serviceId,
            serviceWorkspaceId: workspaceId,
            status: row.status,
            responseTimeMs: row.responseTimeMs,
            message: row.message,
            checkedAt: row.checkedAt,
            createdAt: row.createdAt,
          };
        });
        await createManyChunked(
          (chunk) => tx.serviceCheck.createMany({ data: chunk }),
          inserts,
          500,
        );
        imported.serviceChecks = inserts.length;
      }

      if (payload.data.webhookTokens) {
        const hashes = payload.data.webhookTokens.map((t) => t.tokenHash);
        const collisions =
          hashes.length > 0
            ? await tx.webhookToken.findMany({
                where: { tokenHash: { in: hashes } },
                select: { tokenHash: true },
              })
            : [];
        const collisionHashes = new Set(collisions.map((c) => c.tokenHash));

        const inserts = [];
        for (const row of payload.data.webhookTokens) {
          if (collisionHashes.has(row.tokenHash)) {
            skipped.webhookTokens += 1;
            continue;
          }
          const channelId = remapOrNull(channelIdMap, row.channelId);
          inserts.push({
            id: crypto.randomUUID(),
            workspaceId,
            channelId,
            channelWorkspaceId: channelId !== null ? workspaceId : null,
            name: row.name,
            tokenHash: row.tokenHash,
            tokenPrefix: row.tokenPrefix,
            createdAt: row.createdAt,
            revokedAt: row.revokedAt,
            lastUsedAt: row.lastUsedAt,
          });
        }
        await createManyChunked(
          (chunk) => tx.webhookToken.createMany({ data: chunk }),
          inserts,
          500,
        );
        imported.webhookTokens = inserts.length;
      }

      // --- Tier 4: mail items / messages ---
      if (payload.data.messages) {
        const inserts = payload.data.messages.map((row) => {
          const channelId = mustRemap(channelIdMap, row.channelId);
          return {
            id: crypto.randomUUID(),
            workspaceId,
            channelId,
            channelWorkspaceId: workspaceId,
            content: row.content,
            author: row.author,
            origin: row.origin,
            createdAt: row.createdAt,
          };
        });
        await createManyChunked(
          (chunk) => tx.message.createMany({ data: chunk }),
          inserts,
          500,
        );
        imported.messages = inserts.length;
      }

      if (payload.data.mailItems) {
        const inserts = payload.data.mailItems.map((row) => {
          const newId = crypto.randomUUID();
          mailItemIdMap.set(row.id, newId);
          const accountId = mustRemap(mailAccountIdMap, row.accountId);
          const folderId = mustRemap(mailFolderIdMap, row.folderId);
          return {
            id: newId,
            workspaceId,
            accountId,
            accountWorkspaceId: workspaceId,
            folderId,
            folderWorkspaceId: workspaceId,
            uid: row.uid !== null ? BigInt(row.uid) : null,
            messageId: row.messageId,
            fromAddress: row.fromAddress,
            fromName: row.fromName,
            toRecipients: jsonInput(row.toRecipients),
            ccRecipients: jsonInput(row.ccRecipients),
            bccRecipients: jsonInput(row.bccRecipients),
            replyToAddress: row.replyToAddress,
            subject: row.subject,
            bodyText: row.bodyText,
            bodyHtml: row.bodyHtml,
            snippet: row.snippet,
            isRead: row.isRead,
            isAnswered: row.isAnswered,
            isFlagged: row.isFlagged,
            hasAttachments: row.hasAttachments,
            receivedAt: row.receivedAt,
            createdAt: row.createdAt,
          };
        });
        await createManyChunked(
          (chunk) => tx.mailItem.createMany({ data: chunk }),
          inserts,
          500,
        );
        imported.mailItems = inserts.length;
      }

      // --- Tier 5: mail attachments ---
      if (payload.data.mailAttachments) {
        const inserts = payload.data.mailAttachments.map((row) => {
          const mailItemId = mustRemap(mailItemIdMap, row.mailItemId);
          return {
            id: crypto.randomUUID(),
            mailItemId,
            partId: row.partId,
            filename: row.filename,
            contentType: row.contentType,
            sizeBytes: row.sizeBytes,
            contentId: row.contentId,
            isInline: row.isInline,
            content:
              row.content !== null
                ? new Uint8Array(Buffer.from(row.content, "base64"))
                : null,
            fetchedAt: row.fetchedAt,
            createdAt: row.createdAt,
          };
        });
        await createManyChunked(
          (chunk) => tx.mailAttachment.createMany({ data: chunk }),
          inserts,
          100,
        );
        imported.mailAttachments = inserts.length;
      }

      return { mode, imported, skipped };
    },
    { timeout: env.BACKUP_IMPORT_TX_TIMEOUT_MS, maxWait: 10_000 },
  );
}
