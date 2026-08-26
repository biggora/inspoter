import crypto from "node:crypto";
import { AlertCategorySource, Prisma } from "@/generated/prisma/client";
import type {
  Category,
  Bookmark,
  Contact,
  ContactAddress,
  ContactField,
  ContactLabel,
  ContactLabelAssignment,
  Dashboard,
  DashboardWidget,
  KanbanBoard,
  KanbanCard,
  KanbanCardLabel,
  KanbanChecklistItem,
  KanbanColumn,
  KanbanComment,
  KanbanLabel,
  MessageCategory,
  Channel,
  Message,
  MailAccount,
  MailFolder,
  MailItem,
  MailAttachment,
  MailTemplate,
  MailTemplateTag,
  MailTemplateTagLink,
  LogEntry,
  AlertCategory,
  Alert,
  Service,
  ServiceCheck,
  WebhookToken,
  OutgoingWebhook,
  ProviderResourceBinding,
  ProviderCredential,
  ExecutiveBriefGeneration,
  ExecutiveBrief,
  Decision,
  DecisionActionReceipt,
  DecisionEvent,
} from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { env } from "@/lib/config/env";
import { normalizeLabelName } from "@/lib/label-normalization";
import {
  createEmptyContactRecord,
  type ContactRecord,
} from "@/lib/contacts/model";
import {
  buildDisplayName,
  buildSearchText,
  buildSortKey,
} from "@/lib/contacts/normalize";
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
  type BackupContactRecord,
  type BackupContactAddressRecord,
  type BackupContactFieldRecord,
  type BackupContactLabelRecord,
  type BackupContactLabelAssignmentRecord,
  type BackupDashboardRecord,
  type BackupDashboardWidgetRecord,
  type BackupKanbanBoardRecord,
  type BackupKanbanCardLabelRecord,
  type BackupKanbanCardRecord,
  type BackupKanbanChecklistItemRecord,
  type BackupKanbanColumnRecord,
  type BackupKanbanCommentRecord,
  type BackupKanbanLabelRecord,
  type BackupMessageCategoryRecord,
  type BackupChannelRecord,
  type BackupMessageRecord,
  type BackupMailAccountRecord,
  type BackupMailFolderRecord,
  type BackupMailItemRecord,
  type BackupMailAttachmentRecord,
  type BackupMailTemplateRecord,
  type BackupMailTemplateTagRecord,
  type BackupMailTemplateTagLinkRecord,
  type BackupLogEntryRecord,
  type BackupAlertCategoryRecord,
  type BackupAlertRecord,
  type BackupServiceRecord,
  type BackupServiceCheckRecord,
  type BackupWebhookTokenRecord,
  type BackupOutgoingWebhookRecord,
  type BackupProviderResourceBindingRecord,
  type BackupProviderCredentialRecord,
  type BackupExecutiveBriefGenerationRecord,
  type BackupExecutiveBriefRecord,
  type BackupDecisionRecord,
  type BackupDecisionActionReceiptRecord,
  type BackupDecisionEventRecord,
} from "@/lib/backup/serialization";
import {
  encrypt,
  decrypt,
  isEncryptionConfigured,
} from "@/lib/crypto/credentials";
import { EncryptionNotConfiguredError } from "@/lib/services/outgoingWebhooks";
import { WorkspaceNotFoundError } from "@/lib/services/workspaces";
import type { BackupImportMode } from "@/lib/validation/backup";
import {
  managementActionSchema,
  type ManagementAction,
} from "@/lib/validation/management";
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

function requiredJsonInput(value: unknown): Prisma.InputJsonValue {
  if (value === null) throw new BackupInvalidFileError();
  return value as Prisma.InputJsonValue;
}

function formatTimestamp(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `-${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}`
  );
}

async function createManyChunked<T>(
  create: (chunk: T[]) => Promise<{ count: number }>,
  rows: T[],
  chunkSize: number,
): Promise<number> {
  let count = 0;
  for (let i = 0; i < rows.length; i += chunkSize) {
    count += (await create(rows.slice(i, i + chunkSize))).count;
  }
  return count;
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

/**
 * Rebuilds the format-neutral record a contact's derived columns
 * (displayName, sortKey, searchText) are computed from. The archive stores the
 * parts, not the derivations, so an import recomputes them with the current
 * rules rather than restoring whatever the exporting version wrote.
 */
interface ContactParts {
  fields: Map<string, BackupContactFieldRecord[]>;
  addresses: Map<string, BackupContactAddressRecord[]>;
  labelNames: Map<string, string[]>;
}

function groupContactParts(data: BackupData): ContactParts {
  const fields = new Map<string, BackupContactFieldRecord[]>();
  for (const field of data.contactFields ?? []) {
    const list = fields.get(field.contactId) ?? [];
    list.push(field);
    fields.set(field.contactId, list);
  }

  const addresses = new Map<string, BackupContactAddressRecord[]>();
  for (const address of data.contactAddresses ?? []) {
    const list = addresses.get(address.contactId) ?? [];
    list.push(address);
    addresses.set(address.contactId, list);
  }

  const labelNameById = new Map(
    (data.contactLabels ?? []).map((label) => [label.id, label.name]),
  );
  const labelNames = new Map<string, string[]>();
  for (const assignment of data.contactLabelAssignments ?? []) {
    const name = labelNameById.get(assignment.labelId);
    if (name === undefined) continue;
    const list = labelNames.get(assignment.contactId) ?? [];
    list.push(name);
    labelNames.set(assignment.contactId, list);
  }

  return { fields, addresses, labelNames };
}

function contactRecordFor(
  row: BackupContactRecord,
  parts: ContactParts,
): ContactRecord {
  return {
    ...createEmptyContactRecord(),
    prefix: row.prefix,
    firstName: row.firstName,
    middleName: row.middleName,
    lastName: row.lastName,
    suffix: row.suffix,
    phoneticFirst: row.phoneticFirst,
    phoneticMiddle: row.phoneticMiddle,
    phoneticLast: row.phoneticLast,
    nickname: row.nickname,
    fileAs: row.fileAs,
    organization: row.organization,
    jobTitle: row.jobTitle,
    department: row.department,
    birthday: row.birthday,
    notes: row.notes,
    starred: row.starred,
    fields: (parts.fields.get(row.id) ?? []).map((field) => ({
      kind: field.kind,
      label: field.label,
      value: field.value,
      isPrimary: field.isPrimary,
    })),
    addresses: (parts.addresses.get(row.id) ?? []).map((address) => ({
      label: address.label,
      poBox: address.poBox,
      extended: address.extended,
      street: address.street,
      city: address.city,
      region: address.region,
      postalCode: address.postalCode,
      country: address.country,
      formatted: address.formatted,
    })),
    labels: parts.labelNames.get(row.id) ?? [],
  };
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

function toContactLabelRecord(row: ContactLabel): BackupContactLabelRecord {
  return {
    id: row.id,
    name: row.name,
    normalizedName: row.normalizedName,
    color: row.color,
    position: row.position,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

function toContactRecord(row: Contact): BackupContactRecord {
  return {
    id: row.id,
    prefix: row.prefix,
    firstName: row.firstName,
    middleName: row.middleName,
    lastName: row.lastName,
    suffix: row.suffix,
    phoneticFirst: row.phoneticFirst,
    phoneticMiddle: row.phoneticMiddle,
    phoneticLast: row.phoneticLast,
    nickname: row.nickname,
    fileAs: row.fileAs,
    organization: row.organization,
    jobTitle: row.jobTitle,
    department: row.department,
    birthday: row.birthday,
    notes: row.notes,
    starred: row.starred,
    // displayName, sortKey and searchText are derived on write, so they are
    // recomputed at import rather than carried.
    photoBase64:
      row.photo === null ? null : Buffer.from(row.photo).toString("base64"),
    photoContentType: row.photoContentType,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

function toContactFieldRecord(row: ContactField): BackupContactFieldRecord {
  return {
    id: row.id,
    contactId: row.contactId,
    kind: row.kind,
    label: row.label,
    value: row.value,
    normalizedValue: row.normalizedValue,
    isPrimary: row.isPrimary,
    position: row.position,
    createdAt: iso(row.createdAt),
  };
}

function toContactAddressRecord(
  row: ContactAddress,
): BackupContactAddressRecord {
  return {
    id: row.id,
    contactId: row.contactId,
    label: row.label,
    poBox: row.poBox,
    extended: row.extended,
    street: row.street,
    city: row.city,
    region: row.region,
    postalCode: row.postalCode,
    country: row.country,
    formatted: row.formatted,
    position: row.position,
    createdAt: iso(row.createdAt),
  };
}

function toContactLabelAssignmentRecord(
  row: ContactLabelAssignment,
): BackupContactLabelAssignmentRecord {
  return {
    contactId: row.contactId,
    labelId: row.labelId,
    appliedAt: iso(row.appliedAt),
  };
}

function toDashboardRecord(row: Dashboard): BackupDashboardRecord {
  return {
    id: row.id,
    name: row.name,
    position: row.position,
    isDefault: row.isDefault,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

function toDashboardWidgetRecord(
  row: DashboardWidget,
): BackupDashboardWidgetRecord {
  return {
    id: row.id,
    dashboardId: row.dashboardId,
    kind: row.kind,
    x: row.x,
    y: row.y,
    w: row.w,
    h: row.h,
    config: row.config,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

function toKanbanBoardRecord(row: KanbanBoard): BackupKanbanBoardRecord {
  return {
    id: row.id,
    name: row.name,
    position: row.position,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

function toKanbanColumnRecord(row: KanbanColumn): BackupKanbanColumnRecord {
  return {
    id: row.id,
    boardId: row.boardId,
    name: row.name,
    color: row.color,
    position: row.position,
    wipLimit: row.wipLimit,
    isDone: row.isDone,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

function toKanbanCardRecord(row: KanbanCard): BackupKanbanCardRecord {
  return {
    id: row.id,
    boardId: row.boardId,
    columnId: row.columnId,
    title: row.title,
    description: row.description,
    position: row.position,
    priority: row.priority,
    dueDate: row.dueDate ? iso(row.dueDate) : null,
    assigneeOperatorId: row.assigneeOperatorId,
    linkedType: row.linkedType,
    linkedId: row.linkedId,
    linkedLabel: row.linkedLabel,
    completedAt: row.completedAt ? iso(row.completedAt) : null,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

function toKanbanLabelRecord(row: KanbanLabel): BackupKanbanLabelRecord {
  return {
    id: row.id,
    name: row.name,
    normalizedName: row.normalizedName,
    color: row.color,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

function toKanbanCardLabelRecord(
  row: KanbanCardLabel,
): BackupKanbanCardLabelRecord {
  return {
    cardId: row.cardId,
    labelId: row.labelId,
    appliedAt: iso(row.appliedAt),
  };
}

function toKanbanChecklistItemRecord(
  row: KanbanChecklistItem,
): BackupKanbanChecklistItemRecord {
  return {
    id: row.id,
    cardId: row.cardId,
    text: row.text,
    isDone: row.isDone,
    position: row.position,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

function toKanbanCommentRecord(row: KanbanComment): BackupKanbanCommentRecord {
  return {
    id: row.id,
    cardId: row.cardId,
    authorOperatorId: row.authorOperatorId,
    authorName: row.authorName,
    body: row.body,
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
    embeds: row.embeds,
    avatarUrl: row.avatarUrl,
    tts: row.tts,
    flags: row.flags,
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
    isDefault: row.isDefault,
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
    bodyTruncated: row.bodyTruncated,
    sourceSizeBytes: bigintOrNull(row.sourceSizeBytes),
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

function toMailTemplateRecord(row: MailTemplate): BackupMailTemplateRecord {
  return {
    id: row.id,
    name: row.name,
    subject: row.subject,
    bodyText: row.bodyText,
    bodyHtml: row.bodyHtml,
    starred: row.starred,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

function toMailTemplateTagRecord(
  row: MailTemplateTag,
): BackupMailTemplateTagRecord {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

function toMailTemplateTagLinkRecord(
  row: MailTemplateTagLink,
): BackupMailTemplateTagLinkRecord {
  return {
    templateId: row.templateId,
    tagId: row.tagId,
    appliedAt: iso(row.appliedAt),
  };
}

function toLogEntryRecord(row: LogEntry): BackupLogEntryRecord {
  return {
    id: row.id,
    level: row.level,
    source: row.source,
    message: row.message,
    details: row.details,
    timestamp: iso(row.timestamp),
    createdAt: iso(row.createdAt),
  };
}

function toAlertCategoryRecord(row: AlertCategory): BackupAlertCategoryRecord {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    systemKey: row.systemKey,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

function toAlertRecord(row: Alert): BackupAlertRecord {
  return {
    id: row.id,
    alertCategoryId: row.alertCategoryId,
    categorySource: row.categorySource,
    categoryConfidence: row.categoryConfidence,
    severity: row.severity,
    source: row.source,
    message: row.message,
    messageKey: row.messageKey,
    messageParams: row.messageParams as Record<string, string | number> | null,
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
    format: row.format,
    publicKey: row.publicKey,
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
// GODADDY_DNS/HOSTINGER/CPANEL_WHM/CPANEL_UAPI/OPENAI_COMPATIBLE), matching
// row.provider.
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

function requiredBackupValue<T>(value: T): NonNullable<T> {
  if (value === null) throw new BackupInvalidFileError();
  return value as NonNullable<T>;
}

function toExecutiveBriefGenerationRecord(
  row: ExecutiveBriefGeneration,
): BackupExecutiveBriefGenerationRecord {
  return {
    id: row.id,
    period: row.period,
    status: "PUBLISHED",
    sourceRunId: row.sourceRunId,
    sourceAgentId: row.sourceAgentId,
    sourceAgentName: row.sourceAgentName,
    snapshotVersion: row.snapshotVersion,
    snapshot: requiredBackupValue(row.snapshot),
    snapshotHash: requiredBackupValue(row.snapshotHash),
    snapshotByteLength: requiredBackupValue(row.snapshotByteLength),
    snapshotCapturedAt: iso(requiredBackupValue(row.snapshotCapturedAt)),
    publishedAt: iso(requiredBackupValue(row.publishedAt)),
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

function toExecutiveBriefRecord(
  row: ExecutiveBrief,
): BackupExecutiveBriefRecord {
  return {
    id: row.id,
    generationId: row.generationId,
    period: row.period,
    windowStart: iso(row.windowStart),
    windowEnd: iso(row.windowEnd),
    snapshotAsOf: iso(row.snapshotAsOf),
    headline: row.headline,
    summary: row.summary,
    highlights: requiredBackupValue(row.highlights),
    risks: requiredBackupValue(row.risks),
    opportunities: requiredBackupValue(row.opportunities),
    snapshotHash: row.snapshotHash,
    sourceRunId: row.sourceRunId,
    sourceAgentId: row.sourceAgentId,
    sourceAgentName: row.sourceAgentName,
    publishedAt: iso(row.publishedAt),
    createdAt: iso(row.createdAt),
  };
}

function toDecisionRecord(row: Decision): BackupDecisionRecord {
  return {
    id: row.id,
    briefId: row.briefId,
    origin: row.origin,
    title: row.title,
    context: row.context,
    recommendation: row.recommendation,
    evidenceRefs: requiredBackupValue(row.evidenceRefs),
    priority: row.priority,
    dueAt: isoOrNull(row.dueAt),
    status: row.status,
    deferredUntil: isoOrNull(row.deferredUntil),
    resolutionNote: row.resolutionNote,
    actionType: row.actionType,
    actionPayload: row.actionPayload,
    actionRevision: row.actionRevision,
    executionStatus: row.executionStatus,
    executionAttempts: row.executionAttempts,
    lastExecutionErrorCode: row.lastExecutionErrorCode,
    lastExecutionError: row.lastExecutionError,
    executedAt: isoOrNull(row.executedAt),
    resultType: row.resultType,
    resultId: row.resultId,
    resultLabel: row.resultLabel,
    resultHref: row.resultHref,
    createdByType: row.createdByType,
    createdById: row.createdById,
    createdByName: row.createdByName,
    resolvedByOperatorId: row.resolvedByOperatorId,
    resolvedByOperatorName: row.resolvedByOperatorName,
    resolvedAt: isoOrNull(row.resolvedAt),
    version: row.version,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

function toDecisionActionReceiptRecord(
  row: DecisionActionReceipt,
): BackupDecisionActionReceiptRecord {
  return {
    id: row.id,
    decisionId: row.decisionId,
    actionRevision: row.actionRevision,
    actionType: row.actionType,
    payloadHash: row.payloadHash,
    historicalTargetId: row.historicalTargetId,
    historicalTargetType: row.historicalTargetType,
    historicalTargetLabel: row.historicalTargetLabel,
    historicalTargetHref: row.historicalTargetHref,
    liveTargetId: row.liveTargetId,
    liveTargetHref: row.liveTargetHref,
    targetAvailability: row.targetAvailability,
    committedAt: iso(row.committedAt),
    createdAt: iso(row.createdAt),
  };
}

function toDecisionEventRecord(row: DecisionEvent): BackupDecisionEventRecord {
  return {
    id: row.id,
    decisionId: row.decisionId,
    receiptId: row.receiptId,
    sequence: row.sequence,
    type: row.type,
    actorKind: row.actorKind,
    actorId: row.actorId,
    actorName: row.actorName,
    fromStatus: row.fromStatus,
    toStatus: row.toStatus,
    fromExecutionStatus: row.fromExecutionStatus,
    toExecutionStatus: row.toExecutionStatus,
    actionRevision: row.actionRevision,
    payloadHash: row.payloadHash,
    targetType: row.targetType,
    targetId: row.targetId,
    targetLabel: row.targetLabel,
    errorCode: row.errorCode,
    errorMessage: row.errorMessage,
    createdAt: iso(row.createdAt),
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

      if (sections.includes("contacts")) {
        const contactLabels = await tx.contactLabel.findMany({
          where: { workspaceId },
          orderBy: orderByCreated(),
        });
        const contacts = await tx.contact.findMany({
          where: { workspaceId },
          orderBy: orderByCreated(),
        });
        const contactFields = await tx.contactField.findMany({
          where: { workspaceId },
          orderBy: orderByCreated(),
        });
        const contactAddresses = await tx.contactAddress.findMany({
          where: { workspaceId },
          orderBy: orderByCreated(),
        });
        const contactLabelAssignments =
          await tx.contactLabelAssignment.findMany({
            where: { workspaceId },
            orderBy: [{ contactId: "asc" }, { labelId: "asc" }],
          });
        data.contactLabels = contactLabels.map(toContactLabelRecord);
        data.contacts = contacts.map(toContactRecord);
        data.contactFields = contactFields.map(toContactFieldRecord);
        data.contactAddresses = contactAddresses.map(toContactAddressRecord);
        data.contactLabelAssignments = contactLabelAssignments.map(
          toContactLabelAssignmentRecord,
        );
        counts.contactLabels = contactLabels.length;
        counts.contacts = contacts.length;
        counts.contactFields = contactFields.length;
        counts.contactAddresses = contactAddresses.length;
        counts.contactLabelAssignments = contactLabelAssignments.length;
      }

      if (sections.includes("dashboards")) {
        const dashboards = await tx.dashboard.findMany({
          where: { workspaceId },
          orderBy: orderByCreated(),
        });
        const dashboardWidgets = await tx.dashboardWidget.findMany({
          where: { workspaceId },
          orderBy: orderByCreated(),
        });
        data.dashboards = dashboards.map(toDashboardRecord);
        data.dashboardWidgets = dashboardWidgets.map(toDashboardWidgetRecord);
        counts.dashboards = dashboards.length;
        counts.dashboardWidgets = dashboardWidgets.length;
      }

      if (sections.includes("calendar")) {
        const [
          calendarEvents,
          calendarEventExceptions,
          reminders,
          reminderOccurrences,
          calendarLinks,
        ] = await Promise.all([
          tx.calendarEvent.findMany({
            where: { workspaceId },
            orderBy: orderByCreated(),
          }),
          tx.calendarEventException.findMany({
            where: { workspaceId },
            orderBy: orderByCreated(),
          }),
          tx.reminder.findMany({
            where: { workspaceId },
            orderBy: orderByCreated(),
          }),
          tx.reminderOccurrence.findMany({
            where: { workspaceId },
            orderBy: orderByCreated(),
          }),
          tx.calendarLink.findMany({
            where: { workspaceId },
            orderBy: orderByCreated(),
          }),
        ]);
        data.calendarEvents = calendarEvents.map((row) => ({
          ...row,
          startAt: row.startAt.toISOString(),
          endAt: row.endAt.toISOString(),
          createdAt: row.createdAt.toISOString(),
          updatedAt: row.updatedAt.toISOString(),
        }));
        data.calendarEventExceptions = calendarEventExceptions.map((row) => ({
          id: row.id,
          calendarEventId: row.calendarEventId,
          originalStartAt: row.originalStartAt.toISOString(),
          replacementStartAt: row.replacementStartAt?.toISOString() ?? null,
          replacementEndAt: row.replacementEndAt?.toISOString() ?? null,
          isCancelled: row.isCancelled,
          createdAt: row.createdAt.toISOString(),
          updatedAt: row.updatedAt.toISOString(),
        }));
        data.reminders = reminders.map((row) => ({
          id: row.id,
          calendarEventId: row.calendarEventId,
          kind: row.kind,
          title: row.title,
          description: row.description,
          dueAt: row.dueAt?.toISOString() ?? null,
          offsetMinutes: row.offsetMinutes,
          timeZone: row.timeZone,
          recurrence: row.recurrence,
          nextTriggerAt: row.nextTriggerAt?.toISOString() ?? null,
          isActive: row.isActive,
          amount: row.amount?.toString() ?? null,
          currency: row.currency,
          payee: row.payee,
          paymentReference: row.paymentReference,
          paymentUrl: row.paymentUrl,
          createdAt: row.createdAt.toISOString(),
          updatedAt: row.updatedAt.toISOString(),
        }));
        data.reminderOccurrences = reminderOccurrences.map((row) => ({
          id: row.id,
          reminderId: row.reminderId,
          scheduledFor: row.scheduledFor.toISOString(),
          triggerAt: row.triggerAt.toISOString(),
          status: row.status,
          snoozedUntil: row.snoozedUntil?.toISOString() ?? null,
          resolvedAt: row.resolvedAt?.toISOString() ?? null,
          createdAt: row.createdAt.toISOString(),
          updatedAt: row.updatedAt.toISOString(),
        }));
        data.calendarLinks = calendarLinks.map((row) => ({
          id: row.id,
          calendarEventId: row.calendarEventId,
          reminderId: row.reminderId,
          targetType: row.targetType,
          targetId: row.targetId,
          targetContext: row.targetContext,
          targetLabel: row.targetLabel,
          targetHref: row.targetHref,
          position: row.position,
          createdAt: row.createdAt.toISOString(),
        }));
        counts.calendarEvents = calendarEvents.length;
        counts.calendarEventExceptions = calendarEventExceptions.length;
        counts.reminders = reminders.length;
        counts.reminderOccurrences = reminderOccurrences.length;
        counts.calendarLinks = calendarLinks.length;
      }

      if (sections.includes("kanban")) {
        const [
          kanbanBoards,
          kanbanColumns,
          kanbanLabels,
          kanbanCards,
          kanbanCardLabels,
          kanbanChecklistItems,
          kanbanComments,
        ] = await Promise.all([
          tx.kanbanBoard.findMany({
            where: { workspaceId },
            orderBy: orderByCreated(),
          }),
          tx.kanbanColumn.findMany({
            where: { workspaceId },
            orderBy: orderByCreated(),
          }),
          tx.kanbanLabel.findMany({
            where: { workspaceId },
            orderBy: orderByCreated(),
          }),
          tx.kanbanCard.findMany({
            where: { workspaceId },
            orderBy: orderByCreated(),
          }),
          tx.kanbanCardLabel.findMany({
            where: { workspaceId },
            orderBy: [{ cardId: "asc" }, { labelId: "asc" }],
          }),
          tx.kanbanChecklistItem.findMany({
            where: { workspaceId },
            orderBy: orderByCreated(),
          }),
          tx.kanbanComment.findMany({
            where: { workspaceId },
            orderBy: orderByCreated(),
          }),
        ]);
        data.kanbanBoards = kanbanBoards.map(toKanbanBoardRecord);
        data.kanbanColumns = kanbanColumns.map(toKanbanColumnRecord);
        data.kanbanLabels = kanbanLabels.map(toKanbanLabelRecord);
        data.kanbanCards = kanbanCards.map(toKanbanCardRecord);
        data.kanbanCardLabels = kanbanCardLabels.map(toKanbanCardLabelRecord);
        data.kanbanChecklistItems = kanbanChecklistItems.map(
          toKanbanChecklistItemRecord,
        );
        data.kanbanComments = kanbanComments.map(toKanbanCommentRecord);
        counts.kanbanBoards = kanbanBoards.length;
        counts.kanbanColumns = kanbanColumns.length;
        counts.kanbanLabels = kanbanLabels.length;
        counts.kanbanCards = kanbanCards.length;
        counts.kanbanCardLabels = kanbanCardLabels.length;
        counts.kanbanChecklistItems = kanbanChecklistItems.length;
        counts.kanbanComments = kanbanComments.length;
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
        const [
          mailAccounts,
          mailFolders,
          mailItems,
          mailAttachments,
          mailTemplates,
          mailTemplateTags,
          mailTemplateTagLinks,
        ] = await Promise.all([
          tx.mailAccount.findMany({
            where: { workspaceId },
            orderBy: orderByCreated(),
          }),
          tx.mailFolder.findMany({
            where: { workspaceId },
            orderBy: orderByCreated(),
          }),
          tx.mailItem.findMany({
            where: { workspaceId },
            orderBy: orderByCreated(),
          }),
          fetchMailAttachments(tx, workspaceId),
          tx.mailTemplate.findMany({
            where: { workspaceId },
            orderBy: orderByCreated(),
          }),
          tx.mailTemplateTag.findMany({
            where: { workspaceId },
            orderBy: orderByCreated(),
          }),
          tx.mailTemplateTagLink.findMany({
            where: { workspaceId },
            orderBy: { appliedAt: "asc" },
          }),
        ]);

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
        data.mailTemplates = mailTemplates.map(toMailTemplateRecord);
        data.mailTemplateTags = mailTemplateTags.map(toMailTemplateTagRecord);
        data.mailTemplateTagLinks = mailTemplateTagLinks.map(
          toMailTemplateTagLinkRecord,
        );
        counts.mailAccounts = mailAccounts.length;
        counts.mailFolders = mailFolders.length;
        counts.mailItems = mailItems.length;
        counts.mailAttachments = mailAttachments.length;
        counts.mailTemplates = mailTemplates.length;
        counts.mailTemplateTags = mailTemplateTags.length;
        counts.mailTemplateTagLinks = mailTemplateTagLinks.length;
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

      if (sections.includes("management")) {
        const generations = await tx.executiveBriefGeneration.findMany({
          where: { workspaceId, status: "PUBLISHED" },
          orderBy: orderByCreated(),
        });
        const generationIds = generations.map((row) => row.id);
        const [briefs, decisions, events, receipts] = await Promise.all([
          tx.executiveBrief.findMany({
            where: { workspaceId, generationId: { in: generationIds } },
            orderBy: orderByCreated(),
          }),
          tx.decision.findMany({
            where: { workspaceId },
            orderBy: orderByCreated(),
          }),
          tx.decisionEvent.findMany({
            where: { workspaceId },
            orderBy: [{ decisionId: "asc" }, { sequence: "asc" }],
          }),
          tx.decisionActionReceipt.findMany({
            where: { workspaceId },
            orderBy: [{ decisionId: "asc" }, { actionRevision: "asc" }],
          }),
        ]);
        data.executiveBriefGenerations = generations.map(
          toExecutiveBriefGenerationRecord,
        );
        data.executiveBriefs = briefs.map(toExecutiveBriefRecord);
        data.decisions = decisions.map(toDecisionRecord);
        data.decisionEvents = events.map(toDecisionEventRecord);
        data.decisionActionReceipts = receipts.map(
          toDecisionActionReceiptRecord,
        );
        counts.executiveBriefGenerations = generations.length;
        counts.executiveBriefs = briefs.length;
        counts.decisions = decisions.length;
        counts.decisionEvents = events.length;
        counts.decisionActionReceipts = receipts.length;
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
      timeZone: workspace.timeZone,
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

type ManagementReferenceMaps = {
  alertIds: Map<string, string>;
  bookmarkIds: Map<string, string>;
  channelIds: Map<string, string>;
  contactIds: Map<string, string>;
  dashboardIds: Map<string, string>;
  kanbanBoardIds: Map<string, string>;
  kanbanCardIds: Map<string, string>;
  kanbanColumnIds: Map<string, string>;
  kanbanLabelIds: Map<string, string>;
  logEntryIds: Map<string, string>;
  mailAccountIds: Map<string, string>;
  mailItemIds: Map<string, string>;
  mailTemplateIds: Map<string, string>;
  messageIds: Map<string, string>;
  reminderIds: Map<string, string>;
  serviceIds: Map<string, string>;
};

function targetTypeForAction(actionType: string): string {
  switch (actionType) {
    case "CREATE_KANBAN_CARD":
      return "KANBAN_CARD";
    case "CREATE_REMINDER":
      return "REMINDER";
    case "CREATE_NOTE":
      return "NOTE";
    case "CREATE_MAIL_DRAFT":
      return "MAIL_DRAFT";
    default:
      throw new BackupInvalidFileError();
  }
}

function managementActionHash(action: ManagementAction): string {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify({ type: action.type, payload: action.payload }))
    .digest("hex");
}

function validateManagementArchive(data: BackupData): void {
  const decisions = new Map((data.decisions ?? []).map((row) => [row.id, row]));
  for (const row of data.decisions ?? []) {
    if (row.actionType === null || row.actionPayload === null) continue;
    const action = managementActionSchema.safeParse({
      type: row.actionType,
      payload: row.actionPayload,
    });
    if (!action.success) throw new BackupInvalidFileError();
    const currentReceipt = (data.decisionActionReceipts ?? []).find(
      (receipt) =>
        receipt.decisionId === row.id &&
        receipt.actionRevision === row.actionRevision,
    );
    if (
      currentReceipt !== undefined &&
      currentReceipt.payloadHash !== managementActionHash(action.data)
    ) {
      throw new BackupInvalidFileError();
    }
  }
  for (const receipt of data.decisionActionReceipts ?? []) {
    const decision = decisions.get(receipt.decisionId);
    if (
      decision === undefined ||
      receipt.historicalTargetType !== targetTypeForAction(receipt.actionType)
    ) {
      throw new BackupInvalidFileError();
    }
  }
}

function mapManagementLinkTarget(
  type: string,
  id: string,
  maps: ManagementReferenceMaps,
): string | null {
  const map =
    type === "DASHBOARD"
      ? maps.dashboardIds
      : type === "BOOKMARK"
        ? maps.bookmarkIds
        : type === "KANBAN_BOARD"
          ? maps.kanbanBoardIds
          : type === "KANBAN_CARD"
            ? maps.kanbanCardIds
            : type === "SERVICE"
              ? maps.serviceIds
              : type === "MAIL_ITEM"
                ? maps.mailItemIds
                : type === "MAIL_TEMPLATE"
                  ? maps.mailTemplateIds
                  : type === "CONTACT"
                    ? maps.contactIds
                    : type === "MESSAGE_CHANNEL"
                      ? maps.channelIds
                      : type === "MESSAGE"
                        ? maps.messageIds
                        : type === "REMINDER"
                          ? maps.reminderIds
                          : type === "MAIL_DRAFT"
                            ? maps.mailItemIds
                            : type === "LOG"
                              ? maps.logEntryIds
                              : type === "ALERT"
                                ? maps.alertIds
                                : null;
  return map?.get(id) ?? null;
}

function remapManagementAction(
  action: ManagementAction,
  maps: ManagementReferenceMaps,
): { action: ManagementAction; hasMissingReferences: boolean } {
  switch (action.type) {
    case "CREATE_KANBAN_CARD": {
      const columnId = maps.kanbanColumnIds.get(action.payload.columnId);
      const labelIds = action.payload.labelIds?.map((id) =>
        maps.kanbanLabelIds.get(id),
      );
      const hasMissingReferences =
        columnId === undefined ||
        labelIds?.some((id) => id === undefined) === true;
      return {
        action: {
          type: action.type,
          payload: {
            ...action.payload,
            columnId: columnId ?? action.payload.columnId,
            ...(labelIds
              ? {
                  labelIds: labelIds.map(
                    (id, index) => id ?? action.payload.labelIds?.[index] ?? "",
                  ),
                }
              : {}),
          },
        },
        hasMissingReferences,
      };
    }
    case "CREATE_REMINDER": {
      let hasMissingReferences = false;
      const links = action.payload.links?.map((link) => {
        if (link.targetType === "EXTERNAL_URL") return link;
        const targetId = mapManagementLinkTarget(
          link.targetType,
          link.targetId,
          maps,
        );
        if (targetId === null) {
          hasMissingReferences = true;
          return link;
        }
        return { ...link, targetId };
      });
      return {
        action: {
          type: action.type,
          payload: { ...action.payload, ...(links ? { links } : {}) },
        },
        hasMissingReferences,
      };
    }
    case "CREATE_NOTE": {
      // Notes and folders are deliberately outside the backup contract, so a
      // folder-bound action always requires an operator rebind after restore.
      return {
        action,
        hasMissingReferences: action.payload.folderId != null,
      };
    }
    case "CREATE_MAIL_DRAFT": {
      const accountId = maps.mailAccountIds.get(action.payload.accountId);
      const inReplyToId = action.payload.inReplyToId
        ? maps.mailItemIds.get(action.payload.inReplyToId)
        : undefined;
      const forwardOfId = action.payload.forwardOfId
        ? maps.mailItemIds.get(action.payload.forwardOfId)
        : undefined;
      const hasMissingReferences =
        accountId === undefined ||
        (action.payload.inReplyToId !== undefined &&
          inReplyToId === undefined) ||
        (action.payload.forwardOfId !== undefined && forwardOfId === undefined);
      return {
        action: {
          type: action.type,
          payload: {
            ...action.payload,
            accountId: accountId ?? action.payload.accountId,
            ...(action.payload.inReplyToId !== undefined
              ? { inReplyToId: inReplyToId ?? action.payload.inReplyToId }
              : {}),
            ...(action.payload.forwardOfId !== undefined
              ? { forwardOfId: forwardOfId ?? action.payload.forwardOfId }
              : {}),
          },
        },
        hasMissingReferences,
      };
    }
  }
}

function remapReceiptTarget(
  receipt: BackupDecisionActionReceiptRecord,
  maps: ManagementReferenceMaps,
): { liveTargetId: string | null; liveTargetHref: string | null } {
  const id = mapManagementLinkTarget(
    receipt.historicalTargetType,
    receipt.historicalTargetId,
    maps,
  );
  if (id === null) return { liveTargetId: null, liveTargetHref: null };
  const liveTargetHref =
    receipt.historicalTargetType === "KANBAN_CARD"
      ? `/kanban?card=${id}`
      : receipt.historicalTargetType === "REMINDER"
        ? `/calendar?reminder=${id}`
        : `/mail?item=${id}`;
  return { liveTargetId: id, liveTargetHref };
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
  validateManagementArchive(payload.data);
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
        if (sections.has("management")) {
          await tx.decisionEvent.deleteMany({ where: { workspaceId } });
          await tx.decisionActionReceipt.deleteMany({ where: { workspaceId } });
          await tx.decision.deleteMany({ where: { workspaceId } });
          await tx.executiveBrief.deleteMany({ where: { workspaceId } });
          await tx.executiveBriefGeneration.deleteMany({
            where: { workspaceId },
          });
        }
        if (sections.has("calendar")) {
          await tx.calendarLink.deleteMany({ where: { workspaceId } });
          await tx.reminderOccurrence.deleteMany({ where: { workspaceId } });
          await tx.reminder.deleteMany({ where: { workspaceId } });
          await tx.calendarEventException.deleteMany({
            where: { workspaceId },
          });
          await tx.calendarEvent.deleteMany({ where: { workspaceId } });
        }
        if (sections.has("mail")) {
          await tx.mailAttachment.deleteMany({
            where: { mailItem: { workspaceId } },
          });
          await tx.mailTemplateTagLink.deleteMany({ where: { workspaceId } });
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
          await tx.mailTemplate.deleteMany({ where: { workspaceId } });
          await tx.mailTemplateTag.deleteMany({ where: { workspaceId } });
        }
        if (sections.has("services")) {
          await tx.serviceCheck.deleteMany({ where: { workspaceId } });
        }
        if (sections.has("bookmarks")) {
          await tx.bookmark.deleteMany({ where: { workspaceId } });
        }
        if (sections.has("dashboards")) {
          await tx.dashboardWidget.deleteMany({ where: { workspaceId } });
        }
        // Deleting the boards alone would cascade the rest, but the explicit
        // child-first order keeps this block readable next to its siblings.
        if (sections.has("kanban")) {
          await tx.kanbanComment.deleteMany({ where: { workspaceId } });
          await tx.kanbanChecklistItem.deleteMany({ where: { workspaceId } });
          await tx.kanbanCardLabel.deleteMany({ where: { workspaceId } });
          await tx.kanbanCard.deleteMany({ where: { workspaceId } });
          await tx.kanbanColumn.deleteMany({ where: { workspaceId } });
          await tx.kanbanLabel.deleteMany({ where: { workspaceId } });
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
        if (sections.has("dashboards")) {
          await tx.dashboard.deleteMany({ where: { workspaceId } });
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
            data: {
              hiddenSections: payload.manifest.workspace.hiddenSections,
              timeZone: payload.manifest.workspace.timeZone,
            },
          });
        }
      }

      const categoryIdMap = new Map<string, string>();
      const contactIdMap = new Map<string, string>();
      const contactLabelIdMap = new Map<string, string>();
      const dashboardIdMap = new Map<string, string>();
      const messageCategoryIdMap = new Map<string, string>();
      const channelIdMap = new Map<string, string>();
      const mailAccountIdMap = new Map<string, string>();
      const remappedWebhookAccountOldIds = new Set<string>();
      const mailFolderIdMap = new Map<string, string>();
      const mailItemIdMap = new Map<string, string>();
      const mailTemplateIdMap = new Map<string, string>();
      const mailTemplateTagIdMap = new Map<string, string>();
      const alertCategoryIdMap = new Map<string, string>();
      const serviceIdMap = new Map<string, string>();
      const kanbanBoardIdMap = new Map<string, string>();
      const kanbanColumnIdMap = new Map<string, string>();
      const kanbanCardIdMap = new Map<string, string>();
      const kanbanLabelIdMap = new Map<string, string>();
      const calendarEventIdMap = new Map<string, string>();
      const reminderIdMap = new Map<string, string>();
      const bookmarkIdMap = new Map<string, string>();
      const messageIdMap = new Map<string, string>();
      const logEntryIdMap = new Map<string, string>();
      const alertIdMap = new Map<string, string>();

      if (payload.data.calendarEvents) {
        const inserts = payload.data.calendarEvents.map((row) => {
          const id = crypto.randomUUID();
          calendarEventIdMap.set(row.id, id);
          return {
            id,
            workspaceId,
            title: row.title,
            description: row.description,
            location: row.location,
            color: row.color,
            startAt: row.startAt,
            endAt: row.endAt,
            allDay: row.allDay,
            timeZone: row.timeZone,
            recurrence:
              row.recurrence === null
                ? Prisma.DbNull
                : (row.recurrence as Prisma.InputJsonValue),
            isActive: row.isActive,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
          };
        });
        await createManyChunked(
          (chunk) => tx.calendarEvent.createMany({ data: chunk }),
          inserts,
          500,
        );
        imported.calendarEvents = inserts.length;
      }

      if (payload.data.calendarEventExceptions) {
        const inserts = payload.data.calendarEventExceptions.map((row) => ({
          id: crypto.randomUUID(),
          workspaceId,
          calendarEventId: mustRemap(calendarEventIdMap, row.calendarEventId),
          eventWorkspaceId: workspaceId,
          originalStartAt: row.originalStartAt,
          replacementStartAt: row.replacementStartAt,
          replacementEndAt: row.replacementEndAt,
          isCancelled: row.isCancelled,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
        }));
        await createManyChunked(
          (chunk) => tx.calendarEventException.createMany({ data: chunk }),
          inserts,
          500,
        );
        imported.calendarEventExceptions = inserts.length;
      }

      if (payload.data.reminders) {
        const inserts = payload.data.reminders.map((row) => {
          const id = crypto.randomUUID();
          reminderIdMap.set(row.id, id);
          const calendarEventId = row.calendarEventId
            ? mustRemap(calendarEventIdMap, row.calendarEventId)
            : null;
          return {
            id,
            workspaceId,
            calendarEventId,
            calendarEventWorkspaceId: calendarEventId ? workspaceId : null,
            kind: row.kind,
            title: row.title,
            description: row.description,
            dueAt: row.dueAt,
            offsetMinutes: row.offsetMinutes,
            timeZone: row.timeZone,
            recurrence:
              row.recurrence === null
                ? Prisma.DbNull
                : (row.recurrence as Prisma.InputJsonValue),
            nextTriggerAt: row.nextTriggerAt,
            isActive: row.isActive,
            amount: row.amount,
            currency: row.currency,
            payee: row.payee,
            paymentReference: row.paymentReference,
            paymentUrl: row.paymentUrl,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
          };
        });
        await createManyChunked(
          (chunk) => tx.reminder.createMany({ data: chunk }),
          inserts,
          500,
        );
        imported.reminders = inserts.length;
      }

      if (payload.data.reminderOccurrences) {
        const inserts = payload.data.reminderOccurrences.map((row) => ({
          id: crypto.randomUUID(),
          workspaceId,
          reminderId: mustRemap(reminderIdMap, row.reminderId),
          reminderWorkspaceId: workspaceId,
          scheduledFor: row.scheduledFor,
          triggerAt: row.triggerAt,
          status: row.status,
          snoozedUntil: row.snoozedUntil,
          resolvedAt: row.resolvedAt,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
        }));
        await createManyChunked(
          (chunk) => tx.reminderOccurrence.createMany({ data: chunk }),
          inserts,
          500,
        );
        imported.reminderOccurrences = inserts.length;
      }

      if (payload.data.calendarLinks) {
        const inserts = payload.data.calendarLinks.map((row) => {
          const calendarEventId = row.calendarEventId
            ? mustRemap(calendarEventIdMap, row.calendarEventId)
            : null;
          const reminderId = row.reminderId
            ? mustRemap(reminderIdMap, row.reminderId)
            : null;
          return {
            id: crypto.randomUUID(),
            workspaceId,
            calendarEventId,
            eventWorkspaceId: calendarEventId ? workspaceId : null,
            reminderId,
            reminderWorkspaceId: reminderId ? workspaceId : null,
            targetType: row.targetType,
            targetId: row.targetId,
            targetContext: jsonInput(row.targetContext),
            targetLabel: row.targetLabel,
            targetHref: row.targetHref,
            position: row.position,
            createdAt: row.createdAt,
          };
        });
        await createManyChunked(
          (chunk) => tx.calendarLink.createMany({ data: chunk }),
          inserts,
          500,
        );
        imported.calendarLinks = inserts.length;
      }

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

      if (payload.data.contactLabels) {
        const inserts = payload.data.contactLabels.map((row) => {
          const newId = crypto.randomUUID();
          contactLabelIdMap.set(row.id, newId);
          return {
            id: newId,
            workspaceId,
            name: row.name,
            normalizedName: row.normalizedName,
            color: row.color,
            position: row.position,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
          };
        });
        await createManyChunked(
          (chunk) =>
            // A merge-mode import into a workspace that already has a label
            // of the same name would violate the per-workspace unique index;
            // the existing label wins and its assignments are dropped below.
            tx.contactLabel.createMany({ data: chunk, skipDuplicates: true }),
          inserts,
          500,
        );
        imported.contactLabels = inserts.length;
      }

      if (payload.data.contacts) {
        // Grouped once: the derived columns need every field, address and
        // label of a contact, and looking them up per row would be quadratic.
        const derivedParts = groupContactParts(payload.data);
        const inserts = payload.data.contacts.map((row) => {
          const newId = crypto.randomUUID();
          contactIdMap.set(row.id, newId);
          const record = contactRecordFor(row, derivedParts);
          const displayName = buildDisplayName(record);
          return {
            id: newId,
            workspaceId,
            prefix: row.prefix,
            firstName: row.firstName,
            middleName: row.middleName,
            lastName: row.lastName,
            suffix: row.suffix,
            phoneticFirst: row.phoneticFirst,
            phoneticMiddle: row.phoneticMiddle,
            phoneticLast: row.phoneticLast,
            nickname: row.nickname,
            fileAs: row.fileAs,
            organization: row.organization,
            jobTitle: row.jobTitle,
            department: row.department,
            birthday: row.birthday,
            notes: row.notes,
            starred: row.starred,
            // Derived columns are rebuilt rather than trusted from the file.
            displayName,
            sortKey: buildSortKey(displayName),
            searchText: buildSearchText(record),
            photo:
              row.photoBase64 === null
                ? null
                : Buffer.from(row.photoBase64, "base64"),
            photoContentType: row.photoContentType,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
          };
        });
        await createManyChunked(
          (chunk) => tx.contact.createMany({ data: chunk }),
          inserts,
          500,
        );
        imported.contacts = inserts.length;
      }

      // --- Tier 2: independent parents ---
      // `isDefault` is dropped on import: at most one dashboard per workspace
      // may carry it (partial unique index), and a merge-mode import into a
      // workspace that already has a start dashboard would collide. The section
      // falls back to the first dashboard by position, so nothing breaks — the
      // operator re-pins their preferred board.
      if (payload.data.dashboards) {
        const inserts = payload.data.dashboards.map((row) => {
          const newId = crypto.randomUUID();
          dashboardIdMap.set(row.id, newId);
          return {
            id: newId,
            workspaceId,
            name: row.name,
            position: row.position,
            isDefault: false,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
          };
        });
        await createManyChunked(
          (chunk) => tx.dashboard.createMany({ data: chunk }),
          inserts,
          500,
        );
        imported.dashboards = inserts.length;
      }

      if (payload.data.kanbanBoards) {
        const inserts = payload.data.kanbanBoards.map((row) => {
          const newId = crypto.randomUUID();
          kanbanBoardIdMap.set(row.id, newId);
          return {
            id: newId,
            workspaceId,
            name: row.name,
            position: row.position,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
          };
        });
        await createManyChunked(
          (chunk) => tx.kanbanBoard.createMany({ data: chunk }),
          inserts,
          500,
        );
        imported.kanbanBoards = inserts.length;
      }

      if (payload.data.kanbanLabels) {
        const inserts = payload.data.kanbanLabels.map((row) => {
          const newId = crypto.randomUUID();
          kanbanLabelIdMap.set(row.id, newId);
          return {
            id: newId,
            workspaceId,
            name: row.name,
            normalizedName: row.normalizedName,
            color: row.color,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
          };
        });
        await createManyChunked(
          // A merge-mode import into a workspace that already uses the same
          // label name would violate the (workspaceId, normalizedName) unique
          // index; the existing label wins and the archived one is dropped.
          (chunk) =>
            tx.kanbanLabel.createMany({ data: chunk, skipDuplicates: true }),
          inserts,
          500,
        );
        imported.kanbanLabels = inserts.length;
      }

      if (payload.data.messageCategories) {
        const canonicalCategoryIds = new Map<string, string>();
        for (const row of payload.data.messageCategories) {
          const normalizedName = normalizeLabelName(row.name);
          const canonicalId = canonicalCategoryIds.get(normalizedName);
          if (canonicalId) {
            messageCategoryIdMap.set(row.id, canonicalId);
            continue;
          }
          const existing =
            mode === "merge"
              ? await tx.messageCategory.findUnique({
                  where: {
                    workspaceId_normalizedName: { workspaceId, normalizedName },
                  },
                })
              : null;
          if (existing) {
            messageCategoryIdMap.set(row.id, existing.id);
            canonicalCategoryIds.set(normalizedName, existing.id);
            continue;
          }
          const newId = crypto.randomUUID();
          messageCategoryIdMap.set(row.id, newId);
          canonicalCategoryIds.set(normalizedName, newId);
          await tx.messageCategory.create({
            data: {
              id: newId,
              workspaceId,
              name: row.name,
              normalizedName,
              createdAt: row.createdAt,
              updatedAt: row.updatedAt,
            },
          });
        }
        imported.messageCategories = payload.data.messageCategories.length;
      }

      if (payload.data.alertCategories) {
        // Matched on the case-folded name, not the literal one: the target
        // workspace unique index is [workspaceId, normalizedName], so an
        // archived "Availability" must merge into an existing "availability"
        // instead of colliding on insert.
        const existingByName =
          mode === "merge" && payload.data.alertCategories.length > 0
            ? new Map(
                (
                  await tx.alertCategory.findMany({
                    where: {
                      workspaceId,
                      normalizedName: {
                        in: payload.data.alertCategories.map((c) =>
                          normalizeLabelName(c.name),
                        ),
                      },
                    },
                  })
                ).map((c) => [c.normalizedName, c.id]),
              )
            : new Map<string, string>();

        const inserts: Array<{
          id: string;
          workspaceId: string;
          name: string;
          normalizedName: string;
          description: string | null;
          systemKey: string | null;
          createdAt: string;
          updatedAt: string;
        }> = [];
        for (const row of payload.data.alertCategories) {
          const normalizedName = normalizeLabelName(row.name);
          const existingId = existingByName.get(normalizedName);
          if (existingId) {
            alertCategoryIdMap.set(row.id, existingId);
            continue;
          }
          const newId = crypto.randomUUID();
          alertCategoryIdMap.set(row.id, newId);
          // Two archived categories can differ only in case (they predate the
          // unique index); the first one wins and the rest map onto it.
          existingByName.set(normalizedName, newId);
          inserts.push({
            id: newId,
            workspaceId,
            name: row.name,
            normalizedName,
            description: row.description ?? null,
            systemKey: row.systemKey ?? null,
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
        const existingDefaultAccount = await tx.mailAccount.findFirst({
          where: { workspaceId, isDefault: true },
          select: { id: true },
        });
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
            // Apply the archived default after the batch insert. Keeping this
            // false here avoids colliding with an existing target default in
            // merge mode and tolerates malformed archives carrying two flags.
            isDefault: false,
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
        const archivedDefault = payload.data.mailAccounts.find(
          (row) => row.isDefault,
        );
        const defaultAccountId = archivedDefault
          ? mailAccountIdMap.get(archivedDefault.id)
          : undefined;
        if (!existingDefaultAccount && defaultAccountId) {
          await tx.mailAccount.update({
            where: { id: defaultAccountId },
            data: { isDefault: true },
          });
        }
        imported.mailAccounts = inserts.length;
      }

      if (payload.data.mailTemplateTags) {
        const existing = await tx.mailTemplateTag.findMany({
          where: { workspaceId },
          select: { id: true, normalizedName: true },
        });
        const existingByName = new Map(
          existing.map((tag) => [tag.normalizedName, tag.id]),
        );
        const inserts = [];
        for (const row of payload.data.mailTemplateTags) {
          const normalizedName = normalizeLabelName(row.name);
          const existingId = existingByName.get(normalizedName);
          if (existingId) {
            mailTemplateTagIdMap.set(row.id, existingId);
            continue;
          }
          const newId = crypto.randomUUID();
          mailTemplateTagIdMap.set(row.id, newId);
          existingByName.set(normalizedName, newId);
          inserts.push({
            id: newId,
            workspaceId,
            name: row.name,
            normalizedName,
            color: row.color,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
          });
        }
        await createManyChunked(
          (chunk) => tx.mailTemplateTag.createMany({ data: chunk }),
          inserts,
          500,
        );
        imported.mailTemplateTags = inserts.length;
      }

      if (payload.data.mailTemplates) {
        const existing = await tx.mailTemplate.findMany({
          where: { workspaceId },
          select: { id: true, normalizedName: true },
        });
        const existingByName = new Map(
          existing.map((template) => [template.normalizedName, template.id]),
        );
        const inserts = [];
        for (const row of payload.data.mailTemplates) {
          const normalizedName = normalizeLabelName(row.name);
          const existingId = existingByName.get(normalizedName);
          if (existingId) {
            mailTemplateIdMap.set(row.id, existingId);
            continue;
          }
          const newId = crypto.randomUUID();
          mailTemplateIdMap.set(row.id, newId);
          existingByName.set(normalizedName, newId);
          inserts.push({
            id: newId,
            workspaceId,
            name: row.name,
            normalizedName,
            subject: row.subject,
            bodyText: row.bodyText,
            bodyHtml: row.bodyHtml,
            starred: row.starred,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
          });
        }
        await createManyChunked(
          (chunk) => tx.mailTemplate.createMany({ data: chunk }),
          inserts,
          500,
        );
        imported.mailTemplates = inserts.length;
      }

      if (payload.data.mailTemplateTagLinks) {
        const inserts = payload.data.mailTemplateTagLinks.map((row) => ({
          workspaceId,
          templateId: mustRemap(mailTemplateIdMap, row.templateId),
          templateWorkspaceId: workspaceId,
          tagId: mustRemap(mailTemplateTagIdMap, row.tagId),
          tagWorkspaceId: workspaceId,
          appliedAt: row.appliedAt,
        }));
        const inserted = await createManyChunked(
          (chunk) =>
            tx.mailTemplateTagLink.createMany({
              data: chunk,
              skipDuplicates: true,
            }),
          inserts,
          500,
        );
        imported.mailTemplateTagLinks = inserted;
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
            format: row.format ?? "INSPOT",
            publicKey: row.publicKey ?? null,
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
        const inserts = payload.data.logEntries.map((row) => {
          const id = crypto.randomUUID();
          logEntryIdMap.set(row.id, id);
          return {
            id,
            workspaceId,
            level: row.level,
            source: row.source,
            message: row.message,
            details: row.details ?? null,
            timestamp: row.timestamp,
            createdAt: row.createdAt,
          };
        });
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
          const id = crypto.randomUUID();
          bookmarkIdMap.set(row.id, id);
          const categoryId = mustRemap(categoryIdMap, row.categoryId);
          return {
            id,
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

      if (payload.data.contactFields) {
        const inserts = payload.data.contactFields.map((row) => ({
          id: crypto.randomUUID(),
          workspaceId,
          contactId: mustRemap(contactIdMap, row.contactId),
          contactWorkspaceId: workspaceId,
          kind: row.kind,
          label: row.label,
          value: row.value,
          normalizedValue: row.normalizedValue,
          isPrimary: row.isPrimary,
          position: row.position,
          createdAt: row.createdAt,
        }));
        await createManyChunked(
          (chunk) => tx.contactField.createMany({ data: chunk }),
          inserts,
          500,
        );
        imported.contactFields = inserts.length;
      }

      if (payload.data.contactAddresses) {
        const inserts = payload.data.contactAddresses.map((row) => ({
          id: crypto.randomUUID(),
          workspaceId,
          contactId: mustRemap(contactIdMap, row.contactId),
          contactWorkspaceId: workspaceId,
          label: row.label,
          poBox: row.poBox,
          extended: row.extended,
          street: row.street,
          city: row.city,
          region: row.region,
          postalCode: row.postalCode,
          country: row.country,
          formatted: row.formatted,
          position: row.position,
          createdAt: row.createdAt,
        }));
        await createManyChunked(
          (chunk) => tx.contactAddress.createMany({ data: chunk }),
          inserts,
          500,
        );
        imported.contactAddresses = inserts.length;
      }

      if (payload.data.contactLabelAssignments) {
        // A label whose name collided with an existing one was skipped above,
        // so its id never entered the map; those assignments are dropped
        // rather than aborting the import.
        const inserts = payload.data.contactLabelAssignments
          .map((row) => {
            const labelId = contactLabelIdMap.get(row.labelId);
            if (labelId === undefined) return null;
            return {
              workspaceId,
              contactId: mustRemap(contactIdMap, row.contactId),
              contactWorkspaceId: workspaceId,
              labelId,
              labelWorkspaceId: workspaceId,
              appliedAt: row.appliedAt,
            };
          })
          .filter((row) => row !== null);
        await createManyChunked(
          (chunk) =>
            tx.contactLabelAssignment.createMany({
              data: chunk,
              skipDuplicates: true,
            }),
          inserts,
          500,
        );
        imported.contactLabelAssignments = inserts.length;
      }

      if (payload.data.dashboardWidgets) {
        const inserts = payload.data.dashboardWidgets.map((row) => {
          const dashboardId = mustRemap(dashboardIdMap, row.dashboardId);
          return {
            id: crypto.randomUUID(),
            workspaceId,
            dashboardId,
            dashboardWorkspaceId: workspaceId,
            kind: row.kind,
            x: row.x,
            y: row.y,
            w: row.w,
            h: row.h,
            // The column is non-nullable Json, so jsonInput()'s DbNull branch
            // does not apply here: an absent config restores as `{}`, which is
            // exactly what every widget schema defaults from.
            config: (row.config ?? {}) as Prisma.InputJsonValue,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
          };
        });
        await createManyChunked(
          (chunk) => tx.dashboardWidget.createMany({ data: chunk }),
          inserts,
          500,
        );
        imported.dashboardWidgets = inserts.length;
      }

      if (payload.data.kanbanColumns) {
        const inserts = payload.data.kanbanColumns.map((row) => {
          const newId = crypto.randomUUID();
          kanbanColumnIdMap.set(row.id, newId);
          const boardId = mustRemap(kanbanBoardIdMap, row.boardId);
          return {
            id: newId,
            workspaceId,
            boardId,
            boardWorkspaceId: workspaceId,
            name: row.name,
            color: row.color,
            position: row.position,
            wipLimit: row.wipLimit,
            isDone: row.isDone,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
          };
        });
        await createManyChunked(
          (chunk) => tx.kanbanColumn.createMany({ data: chunk }),
          inserts,
          500,
        );
        imported.kanbanColumns = inserts.length;
      }

      if (payload.data.kanbanCards) {
        // An assignee only survives the import when that operator is still a
        // member of the target workspace: the composite foreign key points at
        // WorkspaceMember, so a restore into a different workspace would
        // otherwise fail outright instead of simply losing the assignment.
        const members = await tx.workspaceMember.findMany({
          where: { workspaceId },
          select: { operatorId: true },
        });
        const memberIds = new Set(members.map((member) => member.operatorId));

        const inserts = payload.data.kanbanCards.map((row) => {
          const newId = crypto.randomUUID();
          kanbanCardIdMap.set(row.id, newId);
          const assigneeOperatorId =
            row.assigneeOperatorId !== null &&
            memberIds.has(row.assigneeOperatorId)
              ? row.assigneeOperatorId
              : null;
          return {
            id: newId,
            workspaceId,
            boardId: mustRemap(kanbanBoardIdMap, row.boardId),
            boardWorkspaceId: workspaceId,
            columnId: mustRemap(kanbanColumnIdMap, row.columnId),
            columnWorkspaceId: workspaceId,
            title: row.title,
            description: row.description,
            position: row.position,
            priority: row.priority,
            dueDate: row.dueDate,
            assigneeOperatorId,
            assigneeWorkspaceId:
              assigneeOperatorId !== null ? workspaceId : null,
            // The linked record is a soft reference to another section's row,
            // whose ids are not remapped by this import. It is preserved
            // verbatim; a link that no longer resolves renders as an inert
            // chip, which is the same degradation a deleted target produces.
            linkedType: row.linkedType,
            linkedId: row.linkedId,
            linkedLabel: row.linkedLabel,
            completedAt: row.completedAt,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
          };
        });
        await createManyChunked(
          (chunk) => tx.kanbanCard.createMany({ data: chunk }),
          inserts,
          500,
        );
        imported.kanbanCards = inserts.length;
      }

      if (payload.data.kanbanCardLabels) {
        // A label dropped by the skipDuplicates above has no entry in the map;
        // its assignments go with it rather than failing the whole restore.
        const inserts = payload.data.kanbanCardLabels
          .filter(
            (row) =>
              kanbanCardIdMap.has(row.cardId) &&
              kanbanLabelIdMap.has(row.labelId),
          )
          .map((row) => ({
            workspaceId,
            cardId: mustRemap(kanbanCardIdMap, row.cardId),
            cardWorkspaceId: workspaceId,
            labelId: mustRemap(kanbanLabelIdMap, row.labelId),
            labelWorkspaceId: workspaceId,
            appliedAt: row.appliedAt,
          }));
        await createManyChunked(
          (chunk) =>
            tx.kanbanCardLabel.createMany({
              data: chunk,
              skipDuplicates: true,
            }),
          inserts,
          500,
        );
        imported.kanbanCardLabels = inserts.length;
      }

      if (payload.data.kanbanChecklistItems) {
        const inserts = payload.data.kanbanChecklistItems.map((row) => ({
          id: crypto.randomUUID(),
          workspaceId,
          cardId: mustRemap(kanbanCardIdMap, row.cardId),
          cardWorkspaceId: workspaceId,
          text: row.text,
          isDone: row.isDone,
          position: row.position,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
        }));
        await createManyChunked(
          (chunk) => tx.kanbanChecklistItem.createMany({ data: chunk }),
          inserts,
          500,
        );
        imported.kanbanChecklistItems = inserts.length;
      }

      if (payload.data.kanbanComments) {
        const inserts = payload.data.kanbanComments.map((row) => ({
          id: crypto.randomUUID(),
          workspaceId,
          cardId: mustRemap(kanbanCardIdMap, row.cardId),
          cardWorkspaceId: workspaceId,
          // authorOperatorId has no foreign key and authorName is already
          // denormalized, so attribution survives a cross-workspace restore.
          authorOperatorId: row.authorOperatorId,
          authorName: row.authorName,
          body: row.body,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
        }));
        await createManyChunked(
          (chunk) => tx.kanbanComment.createMany({ data: chunk }),
          inserts,
          500,
        );
        imported.kanbanComments = inserts.length;
      }

      if (payload.data.channels) {
        const canonicalChannelIds = new Map<string, string>();
        for (const row of payload.data.channels) {
          const messageCategoryId = mustRemap(
            messageCategoryIdMap,
            row.messageCategoryId,
          );
          const normalizedName = normalizeLabelName(row.name);
          const canonicalKey = `${messageCategoryId}\0${normalizedName}`;
          const canonicalId = canonicalChannelIds.get(canonicalKey);
          if (canonicalId) {
            channelIdMap.set(row.id, canonicalId);
            continue;
          }
          const existing =
            mode === "merge"
              ? await tx.channel.findUnique({
                  where: {
                    messageCategoryId_normalizedName: {
                      messageCategoryId,
                      normalizedName,
                    },
                  },
                })
              : null;
          if (existing) {
            channelIdMap.set(row.id, existing.id);
            canonicalChannelIds.set(canonicalKey, existing.id);
            continue;
          }
          const newId = crypto.randomUUID();
          channelIdMap.set(row.id, newId);
          canonicalChannelIds.set(canonicalKey, newId);
          await tx.channel.create({
            data: {
              id: newId,
              workspaceId,
              messageCategoryId,
              messageCategoryWorkspaceId: workspaceId,
              name: row.name,
              normalizedName,
              createdAt: row.createdAt,
              updatedAt: row.updatedAt,
            },
          });
        }
        imported.channels = payload.data.channels.length;
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
          const id = crypto.randomUUID();
          alertIdMap.set(row.id, id);
          const alertCategoryId = remapOrNull(
            alertCategoryIdMap,
            row.alertCategoryId,
          );
          return {
            id,
            workspaceId,
            alertCategoryId,
            alertCategoryWorkspaceId:
              alertCategoryId !== null ? workspaceId : null,
            // Provenance follows the category: no category, no source. An
            // archive written before provenance existed carries none, and its
            // categories all came through ingest.
            categorySource:
              alertCategoryId === null
                ? null
                : (row.categorySource ?? AlertCategorySource.WEBHOOK),
            categoryConfidence:
              alertCategoryId === null
                ? null
                : (row.categoryConfidence ?? null),
            severity: row.severity,
            source: row.source,
            message: row.message,
            messageKey: row.messageKey ?? null,
            messageParams: row.messageParams ?? Prisma.DbNull,
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
          const id = crypto.randomUUID();
          messageIdMap.set(row.id, id);
          const channelId = mustRemap(channelIdMap, row.channelId);
          return {
            id,
            workspaceId,
            channelId,
            channelWorkspaceId: workspaceId,
            content: row.content,
            author: row.author,
            origin: row.origin,
            embeds: (row.embeds ?? null) as Prisma.InputJsonValue,
            avatarUrl: row.avatarUrl ?? null,
            tts: row.tts ?? false,
            flags: row.flags ?? 0,
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
            bodyTruncated: row.bodyTruncated ?? false,
            sourceSizeBytes:
              row.sourceSizeBytes !== null && row.sourceSizeBytes !== undefined
                ? BigInt(row.sourceSizeBytes)
                : null,
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

      if (sections.has("management")) {
        const referenceMaps: ManagementReferenceMaps = {
          alertIds: alertIdMap,
          bookmarkIds: bookmarkIdMap,
          channelIds: channelIdMap,
          contactIds: contactIdMap,
          dashboardIds: dashboardIdMap,
          kanbanBoardIds: kanbanBoardIdMap,
          kanbanCardIds: kanbanCardIdMap,
          kanbanColumnIds: kanbanColumnIdMap,
          kanbanLabelIds: kanbanLabelIdMap,
          logEntryIds: logEntryIdMap,
          mailAccountIds: mailAccountIdMap,
          mailItemIds: mailItemIdMap,
          mailTemplateIds: mailTemplateIdMap,
          messageIds: messageIdMap,
          reminderIds: reminderIdMap,
          serviceIds: serviceIdMap,
        };
        const generationIdMap = new Map<string, string>();
        const briefIdMap = new Map<string, string>();
        const decisionIdMap = new Map<string, string>();
        const receiptIdMap = new Map<string, string>();
        const receiptByCurrentRevision = new Map(
          (payload.data.decisionActionReceipts ?? []).map((receipt) => [
            `${receipt.decisionId}\u0000${receipt.actionRevision}`,
            receipt,
          ]),
        );

        if (payload.data.executiveBriefGenerations) {
          const inserts = payload.data.executiveBriefGenerations.map((row) => {
            const id = crypto.randomUUID();
            generationIdMap.set(row.id, id);
            return {
              id,
              workspaceId,
              period: row.period,
              status: "PUBLISHED" as const,
              sourceAgentRunId: null,
              sourceAgentRunWorkspaceId: null,
              sourceRunId: row.sourceRunId,
              sourceAgentId: row.sourceAgentId,
              sourceAgentName: row.sourceAgentName,
              snapshotVersion: row.snapshotVersion,
              snapshot: requiredJsonInput(row.snapshot),
              snapshotHash: row.snapshotHash,
              snapshotByteLength: row.snapshotByteLength,
              snapshotCapturedAt: row.snapshotCapturedAt,
              lastError: null,
              publishedAt: row.publishedAt,
              createdAt: row.createdAt,
              updatedAt: row.updatedAt,
            };
          });
          await createManyChunked(
            (chunk) => tx.executiveBriefGeneration.createMany({ data: chunk }),
            inserts,
            500,
          );
          imported.executiveBriefGenerations = inserts.length;
        }

        if (payload.data.executiveBriefs) {
          const inserts = payload.data.executiveBriefs.map((row) => {
            const id = crypto.randomUUID();
            briefIdMap.set(row.id, id);
            return {
              id,
              workspaceId,
              generationId: mustRemap(generationIdMap, row.generationId),
              generationWorkspaceId: workspaceId,
              period: row.period,
              windowStart: row.windowStart,
              windowEnd: row.windowEnd,
              snapshotAsOf: row.snapshotAsOf,
              headline: row.headline,
              summary: row.summary,
              highlights: requiredJsonInput(row.highlights),
              risks: requiredJsonInput(row.risks),
              opportunities: requiredJsonInput(row.opportunities),
              snapshotHash: row.snapshotHash,
              sourceRunId: row.sourceRunId,
              sourceAgentId: row.sourceAgentId,
              sourceAgentName: row.sourceAgentName,
              publishedAt: row.publishedAt,
              createdAt: row.createdAt,
            };
          });
          await createManyChunked(
            (chunk) => tx.executiveBrief.createMany({ data: chunk }),
            inserts,
            500,
          );
          imported.executiveBriefs = inserts.length;
        }

        if (payload.data.decisions) {
          const inserts = payload.data.decisions.map((row) => {
            const id = crypto.randomUUID();
            decisionIdMap.set(row.id, id);
            const parsedAction =
              row.actionType === null || row.actionPayload === null
                ? null
                : managementActionSchema.parse({
                    type: row.actionType,
                    payload: row.actionPayload,
                  });
            const remappedAction = parsedAction
              ? remapManagementAction(parsedAction, referenceMaps)
              : null;
            const currentReceipt = receiptByCurrentRevision.get(
              `${row.id}\u0000${row.actionRevision}`,
            );
            const remappedTarget = currentReceipt
              ? remapReceiptTarget(currentReceipt, referenceMaps)
              : null;
            const needsRebind =
              row.status !== "REJECTED" &&
              row.executionStatus !== "SUCCEEDED" &&
              remappedAction?.hasMissingReferences === true;
            const interrupted =
              row.status === "APPROVED" &&
              (row.executionStatus === "READY" ||
                row.executionStatus === "RUNNING") &&
              currentReceipt === undefined;
            const succeeded =
              currentReceipt !== undefined &&
              (row.executionStatus === "SUCCEEDED" ||
                (row.status === "APPROVED" &&
                  (row.executionStatus === "READY" ||
                    row.executionStatus === "RUNNING")));
            const executionStatus = interrupted
              ? "FAILED"
              : succeeded
                ? "SUCCEEDED"
                : needsRebind
                  ? "NEEDS_REBIND"
                  : row.executionStatus;
            const isSucceeded = executionStatus === "SUCCEEDED";
            const isFailed = executionStatus === "FAILED";
            const briefId = remapOrNull(briefIdMap, row.briefId);
            return {
              id,
              workspaceId,
              briefId,
              briefWorkspaceId: briefId === null ? null : workspaceId,
              origin: row.origin,
              title: row.title,
              context: row.context,
              recommendation: row.recommendation,
              evidenceRefs: requiredJsonInput(row.evidenceRefs),
              priority: row.priority,
              dueAt: row.dueAt,
              status: row.status,
              deferredUntil: row.deferredUntil,
              resolutionNote: row.resolutionNote,
              actionType: row.actionType,
              actionPayload:
                remappedAction === null
                  ? Prisma.DbNull
                  : requiredJsonInput(remappedAction.action.payload),
              actionRevision: row.actionRevision,
              executionStatus,
              executionAttempts: row.executionAttempts,
              executionLeaseToken: null,
              executionLeaseExpiresAt: null,
              lastExecutionErrorCode: interrupted
                ? "IMPORT_INTERRUPTED"
                : isFailed
                  ? row.lastExecutionErrorCode
                  : null,
              lastExecutionError: interrupted
                ? "Restore never resumes an interrupted decision action."
                : isFailed
                  ? row.lastExecutionError
                  : null,
              executedAt: isSucceeded
                ? (row.executedAt ?? currentReceipt?.committedAt ?? null)
                : null,
              resultType: isSucceeded
                ? (currentReceipt?.historicalTargetType ?? row.resultType)
                : null,
              resultId: isSucceeded
                ? (remappedTarget?.liveTargetId ??
                  currentReceipt?.historicalTargetId ??
                  row.resultId)
                : null,
              resultLabel: isSucceeded
                ? (currentReceipt?.historicalTargetLabel ?? row.resultLabel)
                : null,
              resultHref: isSucceeded
                ? (remappedTarget?.liveTargetHref ??
                  currentReceipt?.historicalTargetHref ??
                  row.resultHref)
                : null,
              createdByType: row.createdByType,
              createdById: row.createdById,
              createdByName: row.createdByName,
              resolvedByOperatorId: row.resolvedByOperatorId,
              resolvedByOperatorName: row.resolvedByOperatorName,
              resolvedAt: row.resolvedAt,
              version: row.version,
              createdAt: row.createdAt,
              updatedAt: row.updatedAt,
            };
          });
          await createManyChunked(
            (chunk) => tx.decision.createMany({ data: chunk }),
            inserts,
            500,
          );
          imported.decisions = inserts.length;
        }

        if (payload.data.decisionActionReceipts) {
          const inserts = payload.data.decisionActionReceipts.map((row) => {
            const id = crypto.randomUUID();
            receiptIdMap.set(row.id, id);
            const target = remapReceiptTarget(row, referenceMaps);
            return {
              id,
              workspaceId,
              decisionId: mustRemap(decisionIdMap, row.decisionId),
              decisionWorkspaceId: workspaceId,
              actionRevision: row.actionRevision,
              actionType: row.actionType,
              payloadHash: row.payloadHash,
              historicalTargetId: row.historicalTargetId,
              historicalTargetType: row.historicalTargetType,
              historicalTargetLabel: row.historicalTargetLabel,
              historicalTargetHref: row.historicalTargetHref,
              liveTargetId: target.liveTargetId,
              liveTargetHref: target.liveTargetHref,
              targetAvailability:
                target.liveTargetId === null
                  ? ("UNAVAILABLE" as const)
                  : ("AVAILABLE" as const),
              committedAt: row.committedAt,
              createdAt: row.createdAt,
            };
          });
          await createManyChunked(
            (chunk) => tx.decisionActionReceipt.createMany({ data: chunk }),
            inserts,
            500,
          );
          imported.decisionActionReceipts = inserts.length;
        }

        if (payload.data.decisionEvents) {
          const inserts = payload.data.decisionEvents.map((row) => ({
            id: crypto.randomUUID(),
            workspaceId,
            decisionId: mustRemap(decisionIdMap, row.decisionId),
            decisionWorkspaceId: workspaceId,
            receiptId: remapOrNull(receiptIdMap, row.receiptId),
            receiptWorkspaceId:
              row.receiptId === null || !receiptIdMap.has(row.receiptId)
                ? null
                : workspaceId,
            sequence: row.sequence,
            type: row.type,
            actorKind: row.actorKind,
            actorId: row.actorId,
            actorName: row.actorName,
            fromStatus: row.fromStatus,
            toStatus: row.toStatus,
            fromExecutionStatus: row.fromExecutionStatus,
            toExecutionStatus: row.toExecutionStatus,
            actionRevision: row.actionRevision,
            payloadHash: row.payloadHash,
            targetType: row.targetType,
            targetId:
              row.targetType === null || row.targetId === null
                ? row.targetId
                : (mapManagementLinkTarget(
                    row.targetType,
                    row.targetId,
                    referenceMaps,
                  ) ?? row.targetId),
            targetLabel: row.targetLabel,
            errorCode: row.errorCode,
            errorMessage: row.errorMessage,
            createdAt: row.createdAt,
          }));
          await createManyChunked(
            (chunk) => tx.decisionEvent.createMany({ data: chunk }),
            inserts,
            500,
          );
          imported.decisionEvents = inserts.length;
        }
      }

      return { mode, imported, skipped };
    },
    { timeout: env.BACKUP_IMPORT_TX_TIMEOUT_MS, maxWait: 10_000 },
  );
}
