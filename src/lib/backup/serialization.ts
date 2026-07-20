import { z } from "zod";
import {
  MailAccountKind,
  MailSecurity,
  MailSpecialUse,
  MailSyncStatus,
  MessageOrigin,
  MonitorType,
  OutgoingWebhookEvent,
  ProviderMode,
  ProviderOperationState,
  ProviderResourceType,
  ProviderType,
  ServiceStatus,
} from "@/generated/prisma/client";

// Versioned JSON payload sealed inside the .inspot-backup container (see
// ./format.ts). Per-model schemas mirror prisma/schema.prisma, minus
// workspaceId and composite shadow "*WorkspaceId" columns (recomputed at
// import) and minus at-rest secret ciphertext (replaced by decrypted
// secretData, re-encrypted at import time).

export const BACKUP_SECTIONS = [
  "bookmarks",
  "messages",
  "mail",
  "logs",
  "alerts",
  "services",
  "webhooks",
  "providers",
  "workspaceSettings",
] as const;

export type BackupSection = (typeof BACKUP_SECTIONS)[number];

export const SECTION_MODELS: Record<BackupSection, readonly string[]> = {
  bookmarks: ["categories", "bookmarks"],
  messages: ["messageCategories", "channels", "messages"],
  mail: ["mailAccounts", "mailFolders", "mailItems", "mailAttachments"],
  logs: ["logEntries"],
  alerts: ["alertCategories", "alerts"],
  services: ["services", "serviceChecks"],
  webhooks: ["webhookTokens", "outgoingWebhooks"],
  providers: ["providerResourceBindings", "providerCredentials"],
  workspaceSettings: [], // lives in manifest.workspace, not manifest.data
};

export const BACKUP_SCHEMA_VERSION = 1;

const isoDate = z.string().datetime();
const bigintString = z.string().regex(/^\d+$/);

const categorySchema = z.object({
  id: z.string(),
  name: z.string(),
  position: z.number().int(),
  parentCategoryId: z.string().nullable(),
  createdAt: isoDate,
  updatedAt: isoDate,
});

const bookmarkSchema = z.object({
  id: z.string(),
  categoryId: z.string(),
  name: z.string(),
  url: z.string(),
  icon: z.string().nullable(),
  color: z.string().nullable(),
  description: z.string().nullable(),
  position: z.number().int(),
  createdAt: isoDate,
  updatedAt: isoDate,
});

const messageCategorySchema = z.object({
  id: z.string(),
  name: z.string(),
  createdAt: isoDate,
  updatedAt: isoDate,
});

const channelSchema = z.object({
  id: z.string(),
  messageCategoryId: z.string(),
  name: z.string(),
  createdAt: isoDate,
  updatedAt: isoDate,
});

const messageSchema = z.object({
  id: z.string(),
  channelId: z.string(),
  content: z.string(),
  author: z.string().nullable(),
  origin: z.enum(MessageOrigin),
  createdAt: isoDate,
});

const mailAccountSchema = z.object({
  id: z.string(),
  kind: z.enum(MailAccountKind),
  mode: z.enum(ProviderMode),
  name: z.string(),
  email: z.string(),
  imapHost: z.string().nullable(),
  imapPort: z.number().int().nullable(),
  imapSecurity: z.enum(MailSecurity).nullable(),
  smtpHost: z.string().nullable(),
  smtpPort: z.number().int().nullable(),
  smtpSecurity: z.enum(MailSecurity).nullable(),
  username: z.string().nullable(),
  // Decrypted password payload; null for WEBHOOK-kind accounts, which have no
  // credentials (MailAccount.encryptedData is nullable in the schema).
  secretData: z.record(z.string(), z.unknown()).nullable(),
  maskedHint: z.string().nullable(),
  isValid: z.boolean().nullable(),
  lastCheckedAt: isoDate.nullable(),
  isActive: z.boolean(),
  syncStatus: z.enum(MailSyncStatus),
  syncError: z.string().nullable(),
  lastSyncAt: isoDate.nullable(),
  nextSyncAt: isoDate.nullable(),
  syncLeaseExpiresAt: isoDate.nullable(),
  syncIntervalSeconds: z.number().int(),
  createdAt: isoDate,
  updatedAt: isoDate,
});

const mailFolderSchema = z.object({
  id: z.string(),
  accountId: z.string(),
  path: z.string(),
  name: z.string(),
  delimiter: z.string().nullable(),
  specialUse: z.enum(MailSpecialUse),
  position: z.number().int(),
  uidValidity: bigintString.nullable(),
  lastSeenUid: bigintString.nullable(),
  lastSyncAt: isoDate.nullable(),
  createdAt: isoDate,
  updatedAt: isoDate,
});

const mailItemSchema = z.object({
  id: z.string(),
  accountId: z.string(),
  folderId: z.string(),
  uid: bigintString.nullable(),
  messageId: z.string().nullable(),
  fromAddress: z.string(),
  fromName: z.string().nullable(),
  toRecipients: z.unknown().nullable(),
  ccRecipients: z.unknown().nullable(),
  bccRecipients: z.unknown().nullable(),
  replyToAddress: z.string().nullable(),
  subject: z.string(),
  bodyText: z.string(),
  bodyHtml: z.string().nullable(),
  snippet: z.string().nullable(),
  isRead: z.boolean(),
  isAnswered: z.boolean(),
  isFlagged: z.boolean(),
  hasAttachments: z.boolean(),
  receivedAt: isoDate,
  createdAt: isoDate,
});

const mailAttachmentSchema = z.object({
  id: z.string(),
  mailItemId: z.string(),
  partId: z.string().nullable(),
  filename: z.string(),
  contentType: z.string(),
  sizeBytes: z.number().int(),
  contentId: z.string().nullable(),
  isInline: z.boolean(),
  content: z.string().nullable(), // base64
  fetchedAt: isoDate.nullable(),
  createdAt: isoDate,
});

const logEntrySchema = z.object({
  id: z.string(),
  level: z.string(),
  source: z.string(),
  message: z.string(),
  timestamp: isoDate,
  createdAt: isoDate,
});

const alertCategorySchema = z.object({
  id: z.string(),
  name: z.string(),
  createdAt: isoDate,
  updatedAt: isoDate,
});

const alertSchema = z.object({
  id: z.string(),
  alertCategoryId: z.string().nullable(),
  severity: z.string(),
  source: z.string(),
  message: z.string(),
  timestamp: isoDate,
  createdAt: isoDate,
});

const serviceSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  monitorType: z.enum(MonitorType),
  url: z.string().nullable(),
  host: z.string().nullable(),
  port: z.number().int().nullable(),
  expectedStatusCodes: z.string().nullable(),
  intervalSeconds: z.number().int(),
  timeoutMs: z.number().int(),
  retries: z.number().int(),
  isActive: z.boolean(),
  currentStatus: z.enum(ServiceStatus),
  consecutiveFailures: z.number().int(),
  lastCheckedAt: isoDate.nullable(),
  lastResponseTimeMs: z.number().int().nullable(),
  lastMessage: z.string().nullable(),
  nextCheckAt: isoDate,
  createdAt: isoDate,
  updatedAt: isoDate,
});

const serviceCheckSchema = z.object({
  id: z.string(),
  serviceId: z.string(),
  status: z.enum(ServiceStatus),
  responseTimeMs: z.number().int().nullable(),
  message: z.string().nullable(),
  checkedAt: isoDate,
  createdAt: isoDate,
});

const webhookTokenSchema = z.object({
  id: z.string(),
  channelId: z.string().nullable(),
  name: z.string(),
  tokenHash: z.string(),
  tokenPrefix: z.string(),
  createdAt: isoDate,
  revokedAt: isoDate.nullable(),
  lastUsedAt: isoDate.nullable(),
});

const outgoingWebhookSchema = z.object({
  id: z.string(),
  name: z.string(),
  url: z.string(),
  events: z.array(z.enum(OutgoingWebhookEvent)),
  isActive: z.boolean(),
  // Decrypted signing secret; every OutgoingWebhook has one (encryptedData is
  // non-nullable in the schema).
  secretData: z.record(z.string(), z.unknown()),
  secretPrefix: z.string(),
  createdAt: isoDate,
  updatedAt: isoDate,
});

const providerResourceBindingSchema = z.object({
  id: z.string(),
  provider: z.string(),
  accountKey: z.string(),
  resourceType: z.enum(ProviderResourceType),
  mode: z.enum(ProviderMode),
  remoteId: z.string(),
  displayName: z.string(),
  operationState: z.enum(ProviderOperationState),
  operationId: z.string().nullable(),
  operationKind: z.string().nullable(),
  operationIntent: z.unknown().nullable(),
  operationStartedAt: isoDate.nullable(),
  operationLeaseExpiresAt: isoDate.nullable(),
  lastReconciledAt: isoDate.nullable(),
  version: z.number().int(),
  createdAt: isoDate,
  updatedAt: isoDate,
});

const providerCredentialSchema = z.object({
  id: z.string(),
  provider: z.enum(ProviderType),
  label: z.string(),
  // Decrypted credential payload; every ProviderCredential has one
  // (encryptedData is non-nullable in the schema).
  secretData: z.record(z.string(), z.unknown()),
  maskedHint: z.string(),
  allowInsecure: z.boolean(),
  isValid: z.boolean().nullable(),
  lastCheckedAt: isoDate.nullable(),
  createdAt: isoDate,
  updatedAt: isoDate,
});

const manifestSchema = z.object({
  schemaVersion: z.literal(BACKUP_SCHEMA_VERSION),
  exportedAt: isoDate,
  appVersion: z.string(),
  workspace: z.object({
    id: z.string(),
    name: z.string(),
    slug: z.string(),
    hiddenSections: z.array(z.string()),
  }),
  sections: z.array(z.enum(BACKUP_SECTIONS)),
  counts: z.record(z.string(), z.number().int()),
});

const dataSchema = z.object({
  categories: z.array(categorySchema).optional(),
  bookmarks: z.array(bookmarkSchema).optional(),
  messageCategories: z.array(messageCategorySchema).optional(),
  channels: z.array(channelSchema).optional(),
  messages: z.array(messageSchema).optional(),
  mailAccounts: z.array(mailAccountSchema).optional(),
  mailFolders: z.array(mailFolderSchema).optional(),
  mailItems: z.array(mailItemSchema).optional(),
  mailAttachments: z.array(mailAttachmentSchema).optional(),
  logEntries: z.array(logEntrySchema).optional(),
  alertCategories: z.array(alertCategorySchema).optional(),
  alerts: z.array(alertSchema).optional(),
  services: z.array(serviceSchema).optional(),
  serviceChecks: z.array(serviceCheckSchema).optional(),
  webhookTokens: z.array(webhookTokenSchema).optional(),
  outgoingWebhooks: z.array(outgoingWebhookSchema).optional(),
  providerResourceBindings: z.array(providerResourceBindingSchema).optional(),
  providerCredentials: z.array(providerCredentialSchema).optional(),
});

export const backupPayloadSchema = z.object({
  manifest: manifestSchema,
  data: dataSchema,
});

export type BackupPayloadV1 = z.infer<typeof backupPayloadSchema>;
export type BackupManifest = z.infer<typeof manifestSchema>;
export type BackupData = z.infer<typeof dataSchema>;
export type BackupCategoryRecord = z.infer<typeof categorySchema>;
export type BackupBookmarkRecord = z.infer<typeof bookmarkSchema>;
export type BackupMessageCategoryRecord = z.infer<typeof messageCategorySchema>;
export type BackupChannelRecord = z.infer<typeof channelSchema>;
export type BackupMessageRecord = z.infer<typeof messageSchema>;
export type BackupMailAccountRecord = z.infer<typeof mailAccountSchema>;
export type BackupMailFolderRecord = z.infer<typeof mailFolderSchema>;
export type BackupMailItemRecord = z.infer<typeof mailItemSchema>;
export type BackupMailAttachmentRecord = z.infer<typeof mailAttachmentSchema>;
export type BackupLogEntryRecord = z.infer<typeof logEntrySchema>;
export type BackupAlertCategoryRecord = z.infer<typeof alertCategorySchema>;
export type BackupAlertRecord = z.infer<typeof alertSchema>;
export type BackupServiceRecord = z.infer<typeof serviceSchema>;
export type BackupServiceCheckRecord = z.infer<typeof serviceCheckSchema>;
export type BackupWebhookTokenRecord = z.infer<typeof webhookTokenSchema>;
export type BackupOutgoingWebhookRecord = z.infer<typeof outgoingWebhookSchema>;
export type BackupProviderResourceBindingRecord = z.infer<
  typeof providerResourceBindingSchema
>;
export type BackupProviderCredentialRecord = z.infer<
  typeof providerCredentialSchema
>;
