import { z } from "zod";
import {
  AlertCategorySource,
  DashboardWidgetKind,
  KanbanLinkType,
  KanbanPriority,
  MailAccountKind,
  MailSecurity,
  MailSpecialUse,
  MailSyncStatus,
  MessageOrigin,
  MonitorType,
  OutgoingWebhookEvent,
  OutgoingWebhookFormat,
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
  "contacts",
  "dashboards",
  "kanban",
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
  contacts: [
    "contactLabels",
    "contacts",
    "contactFields",
    "contactAddresses",
    "contactLabelAssignments",
  ],
  dashboards: ["dashboards", "dashboardWidgets"],
  // Insertion order matters on import: a card needs its board and column, an
  // assignment needs both its card and its label.
  kanban: [
    "kanbanBoards",
    "kanbanColumns",
    "kanbanLabels",
    "kanbanCards",
    "kanbanCardLabels",
    "kanbanChecklistItems",
    "kanbanComments",
  ],
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

// A dashboard widget's `config` is a per-kind options object validated by
// WIDGET_CONFIG_SCHEMAS on the way in. The archive keeps it as opaque JSON on
// purpose: re-validating it here would make a backup unrestorable the moment a
// widget kind's schema tightens, and a config that no longer parses degrades to
// the kind's defaults when the dashboard renders.
// Contacts. The photo is carried as base64 rather than left behind: it is the
// one part of a contact that cannot be retyped, and an archive that silently
// dropped it would look complete while being lossy.
const contactLabelSchema = z.object({
  id: z.string(),
  name: z.string(),
  normalizedName: z.string(),
  color: z.string(),
  position: z.number().int(),
  createdAt: isoDate,
  updatedAt: isoDate,
});

const contactSchema = z.object({
  id: z.string(),
  prefix: z.string().nullable(),
  firstName: z.string().nullable(),
  middleName: z.string().nullable(),
  lastName: z.string().nullable(),
  suffix: z.string().nullable(),
  phoneticFirst: z.string().nullable(),
  phoneticMiddle: z.string().nullable(),
  phoneticLast: z.string().nullable(),
  nickname: z.string().nullable(),
  fileAs: z.string().nullable(),
  organization: z.string().nullable(),
  jobTitle: z.string().nullable(),
  department: z.string().nullable(),
  birthday: z.string().nullable(),
  notes: z.string().nullable(),
  starred: z.boolean(),
  photoBase64: z.string().nullable(),
  photoContentType: z.string().nullable(),
  createdAt: isoDate,
  updatedAt: isoDate,
});

const contactFieldSchema = z.object({
  id: z.string(),
  contactId: z.string(),
  kind: z.enum(["EMAIL", "PHONE", "URL", "IM", "EVENT", "RELATION", "CUSTOM"]),
  label: z.string().nullable(),
  value: z.string(),
  normalizedValue: z.string().nullable(),
  isPrimary: z.boolean(),
  position: z.number().int(),
  createdAt: isoDate,
});

const contactAddressSchema = z.object({
  id: z.string(),
  contactId: z.string(),
  label: z.string().nullable(),
  poBox: z.string().nullable(),
  extended: z.string().nullable(),
  street: z.string().nullable(),
  city: z.string().nullable(),
  region: z.string().nullable(),
  postalCode: z.string().nullable(),
  country: z.string().nullable(),
  formatted: z.string().nullable(),
  position: z.number().int(),
  createdAt: isoDate,
});

const contactLabelAssignmentSchema = z.object({
  contactId: z.string(),
  labelId: z.string(),
  appliedAt: isoDate,
});

const dashboardSchema = z.object({
  id: z.string(),
  name: z.string(),
  position: z.number().int(),
  isDefault: z.boolean(),
  createdAt: isoDate,
  updatedAt: isoDate,
});

const dashboardWidgetSchema = z.object({
  id: z.string(),
  dashboardId: z.string(),
  kind: z.enum(DashboardWidgetKind),
  x: z.number().int(),
  y: z.number().int(),
  w: z.number().int(),
  h: z.number().int(),
  config: z.unknown(),
  createdAt: isoDate,
  updatedAt: isoDate,
});

// The assignee is stored as a bare operator id, not a membership: the import
// only restores it when that operator is still a member of the target
// workspace (see restoreKanban), so a cross-workspace restore drops the
// assignment rather than failing the composite foreign key.
const kanbanBoardSchema = z.object({
  id: z.string(),
  name: z.string(),
  position: z.number().int(),
  createdAt: isoDate,
  updatedAt: isoDate,
});

const kanbanColumnSchema = z.object({
  id: z.string(),
  boardId: z.string(),
  name: z.string(),
  color: z.string(),
  position: z.number().int(),
  wipLimit: z.number().int().nullable(),
  isDone: z.boolean(),
  createdAt: isoDate,
  updatedAt: isoDate,
});

const kanbanCardSchema = z.object({
  id: z.string(),
  boardId: z.string(),
  columnId: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  position: z.number().int(),
  priority: z.enum(KanbanPriority),
  dueDate: isoDate.nullable(),
  assigneeOperatorId: z.string().nullable(),
  linkedType: z.enum(KanbanLinkType).nullable(),
  linkedId: z.string().nullable(),
  linkedLabel: z.string().nullable(),
  completedAt: isoDate.nullable(),
  createdAt: isoDate,
  updatedAt: isoDate,
});

const kanbanLabelSchema = z.object({
  id: z.string(),
  name: z.string(),
  normalizedName: z.string(),
  color: z.string(),
  createdAt: isoDate,
  updatedAt: isoDate,
});

const kanbanCardLabelSchema = z.object({
  cardId: z.string(),
  labelId: z.string(),
  appliedAt: isoDate,
});

const kanbanChecklistItemSchema = z.object({
  id: z.string(),
  cardId: z.string(),
  text: z.string(),
  isDone: z.boolean(),
  position: z.number().int(),
  createdAt: isoDate,
  updatedAt: isoDate,
});

const kanbanCommentSchema = z.object({
  id: z.string(),
  cardId: z.string(),
  authorOperatorId: z.string(),
  authorName: z.string(),
  body: z.string(),
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
  // Discord Execute Webhook extras. Optional: archives written before Discord
  // compatibility existed carry none of them and restore with the defaults.
  embeds: z.unknown().nullable().optional(),
  avatarUrl: z.string().nullable().optional(),
  tts: z.boolean().optional(),
  flags: z.number().int().optional(),
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
  // Default keeps v1 archives produced before workspace mailbox selection
  // compatible with the same format version.
  isDefault: z.boolean().default(false),
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
  bodyTruncated: z.boolean().optional(),
  sourceSizeBytes: bigintString.nullable().optional(),
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
  details: z.string().nullable().optional(),
  timestamp: isoDate,
  createdAt: isoDate,
});

// normalizedName is deliberately absent: it is derived from `name` and is
// recomputed at import, so an archive can never carry a stale encoding.
const alertCategorySchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable().optional(),
  // Optional for the same reason as categorySource below: archives written
  // before system categories were marked have no key, and their categories
  // restore as ordinary operator-owned ones.
  systemKey: z.string().nullable().optional(),
  createdAt: isoDate,
  updatedAt: isoDate,
});

// categorySource/categoryConfidence are optional: archives written before
// alert provenance existed have neither, and import fills the source in.
// messageKey/messageParams are optional on the same grounds — an older archive
// restores with the English `message` alone, which is exactly what the UI falls
// back to.
const alertSchema = z.object({
  id: z.string(),
  alertCategoryId: z.string().nullable(),
  categorySource: z.enum(AlertCategorySource).nullable().optional(),
  categoryConfidence: z.number().nullable().optional(),
  severity: z.string(),
  source: z.string(),
  message: z.string(),
  messageKey: z.string().nullable().optional(),
  messageParams: z
    .record(z.string(), z.union([z.string(), z.number()]))
    .nullable()
    .optional(),
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
  // non-nullable in the schema). For DISCORD_EVENTS it also carries the Ed25519
  // private key, so the key pair survives an export/import round-trip.
  secretData: z.record(z.string(), z.unknown()),
  secretPrefix: z.string(),
  // Optional: archives written before Discord compatibility existed have
  // neither field and import as an INSPOT webhook with no key pair.
  format: z.enum(OutgoingWebhookFormat).optional(),
  publicKey: z.string().nullable().optional(),
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
  contactLabels: z.array(contactLabelSchema).optional(),
  contacts: z.array(contactSchema).optional(),
  contactFields: z.array(contactFieldSchema).optional(),
  contactAddresses: z.array(contactAddressSchema).optional(),
  contactLabelAssignments: z.array(contactLabelAssignmentSchema).optional(),
  dashboards: z.array(dashboardSchema).optional(),
  dashboardWidgets: z.array(dashboardWidgetSchema).optional(),
  kanbanBoards: z.array(kanbanBoardSchema).optional(),
  kanbanColumns: z.array(kanbanColumnSchema).optional(),
  kanbanLabels: z.array(kanbanLabelSchema).optional(),
  kanbanCards: z.array(kanbanCardSchema).optional(),
  kanbanCardLabels: z.array(kanbanCardLabelSchema).optional(),
  kanbanChecklistItems: z.array(kanbanChecklistItemSchema).optional(),
  kanbanComments: z.array(kanbanCommentSchema).optional(),
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
export type BackupContactLabelRecord = z.infer<typeof contactLabelSchema>;
export type BackupContactRecord = z.infer<typeof contactSchema>;
export type BackupContactFieldRecord = z.infer<typeof contactFieldSchema>;
export type BackupContactAddressRecord = z.infer<typeof contactAddressSchema>;
export type BackupContactLabelAssignmentRecord = z.infer<
  typeof contactLabelAssignmentSchema
>;
export type BackupDashboardRecord = z.infer<typeof dashboardSchema>;
export type BackupDashboardWidgetRecord = z.infer<typeof dashboardWidgetSchema>;
export type BackupKanbanBoardRecord = z.infer<typeof kanbanBoardSchema>;
export type BackupKanbanColumnRecord = z.infer<typeof kanbanColumnSchema>;
export type BackupKanbanLabelRecord = z.infer<typeof kanbanLabelSchema>;
export type BackupKanbanCardRecord = z.infer<typeof kanbanCardSchema>;
export type BackupKanbanCardLabelRecord = z.infer<typeof kanbanCardLabelSchema>;
export type BackupKanbanChecklistItemRecord = z.infer<
  typeof kanbanChecklistItemSchema
>;
export type BackupKanbanCommentRecord = z.infer<typeof kanbanCommentSchema>;
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
