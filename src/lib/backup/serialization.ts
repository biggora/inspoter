import { z } from "zod";
import {
  AlertCategorySource,
  CalendarLinkTargetType,
  DecisionActionType,
  DecisionActorKind,
  DecisionEventType,
  DecisionExecutionStatus,
  DecisionOrigin,
  DecisionPriority,
  DecisionStatus,
  DecisionTargetAvailability,
  DashboardWidgetKind,
  ExecutiveBriefPeriod,
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
  ReminderKind,
  ReminderOccurrenceStatus,
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
  "calendar",
  "messages",
  "mail",
  "logs",
  "alerts",
  "services",
  "webhooks",
  "providers",
  "management",
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
  calendar: [
    "calendarEvents",
    "calendarEventExceptions",
    "reminders",
    "reminderOccurrences",
    "calendarLinks",
  ],
  messages: ["messageCategories", "channels", "messages"],
  mail: [
    "mailTemplateTags",
    "mailTemplates",
    "mailTemplateTagLinks",
    "mailAccounts",
    "mailFolders",
    "mailItems",
    "mailAttachments",
  ],
  logs: ["logEntries"],
  alerts: ["alertCategories", "alerts"],
  services: ["services", "serviceChecks"],
  webhooks: ["webhookTokens", "outgoingWebhooks"],
  providers: ["providerResourceBindings", "providerCredentials"],
  management: [
    "executiveBriefGenerations",
    "executiveBriefs",
    "decisions",
    "decisionEvents",
    "decisionActionReceipts",
  ],
  workspaceSettings: [], // lives in manifest.workspace, not manifest.data
};

export const BACKUP_SCHEMA_VERSION = 1;

const isoDate = z.string().datetime();
const bigintString = z.string().regex(/^\d+$/);
const jsonValueSchema = z.unknown().refine((value) => value !== null);

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

const calendarEventSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  location: z.string().nullable(),
  color: z.string(),
  startAt: isoDate,
  endAt: isoDate,
  allDay: z.boolean(),
  timeZone: z.string(),
  recurrence: z.unknown().nullable(),
  isActive: z.boolean(),
  createdAt: isoDate,
  updatedAt: isoDate,
});

const calendarEventExceptionSchema = z.object({
  id: z.string(),
  calendarEventId: z.string(),
  originalStartAt: isoDate,
  replacementStartAt: isoDate.nullable(),
  replacementEndAt: isoDate.nullable(),
  isCancelled: z.boolean(),
  createdAt: isoDate,
  updatedAt: isoDate,
});

const reminderSchema = z.object({
  id: z.string(),
  calendarEventId: z.string().nullable(),
  kind: z.enum(ReminderKind),
  title: z.string(),
  description: z.string().nullable(),
  dueAt: isoDate.nullable(),
  offsetMinutes: z.number().int().nullable(),
  timeZone: z.string(),
  recurrence: z.unknown().nullable(),
  nextTriggerAt: isoDate.nullable(),
  isActive: z.boolean(),
  amount: z.string().nullable(),
  currency: z.string().nullable(),
  payee: z.string().nullable(),
  paymentReference: z.string().nullable(),
  paymentUrl: z.string().nullable(),
  createdAt: isoDate,
  updatedAt: isoDate,
});

const reminderOccurrenceSchema = z.object({
  id: z.string(),
  reminderId: z.string(),
  scheduledFor: isoDate,
  triggerAt: isoDate,
  status: z.enum(ReminderOccurrenceStatus),
  snoozedUntil: isoDate.nullable(),
  resolvedAt: isoDate.nullable(),
  createdAt: isoDate,
  updatedAt: isoDate,
});

const calendarLinkSchema = z.object({
  id: z.string(),
  calendarEventId: z.string().nullable(),
  reminderId: z.string().nullable(),
  targetType: z.enum(CalendarLinkTargetType),
  targetId: z.string(),
  targetContext: z.unknown().nullable(),
  targetLabel: z.string(),
  targetHref: z.string().nullable(),
  position: z.number().int(),
  createdAt: isoDate,
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

const mailTemplateSchema = z.object({
  id: z.string(),
  name: z.string(),
  subject: z.string(),
  bodyText: z.string(),
  bodyHtml: z.string(),
  starred: z.boolean(),
  createdAt: isoDate,
  updatedAt: isoDate,
});

const mailTemplateTagSchema = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string(),
  createdAt: isoDate,
  updatedAt: isoDate,
});

const mailTemplateTagLinkSchema = z.object({
  templateId: z.string(),
  tagId: z.string(),
  appliedAt: isoDate,
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

// Management archives intentionally contain published history only. Agent
// configuration and runs are operational state, not restoreable history.
const executiveBriefGenerationSchema = z.object({
  id: z.string(),
  period: z.enum(ExecutiveBriefPeriod),
  status: z.literal("PUBLISHED"),
  sourceRunId: z.string(),
  sourceAgentId: z.string(),
  sourceAgentName: z.string(),
  snapshotVersion: z.number().int().positive(),
  snapshot: jsonValueSchema,
  snapshotHash: z.string(),
  snapshotByteLength: z.number().int().nonnegative(),
  snapshotCapturedAt: isoDate,
  publishedAt: isoDate,
  createdAt: isoDate,
  updatedAt: isoDate,
});

const executiveBriefSchema = z.object({
  id: z.string(),
  generationId: z.string(),
  period: z.enum(ExecutiveBriefPeriod),
  windowStart: isoDate,
  windowEnd: isoDate,
  snapshotAsOf: isoDate,
  headline: z.string(),
  summary: z.string(),
  highlights: jsonValueSchema,
  risks: jsonValueSchema,
  opportunities: jsonValueSchema,
  snapshotHash: z.string(),
  sourceRunId: z.string(),
  sourceAgentId: z.string(),
  sourceAgentName: z.string(),
  publishedAt: isoDate,
  createdAt: isoDate,
});

const decisionSchema = z.object({
  id: z.string(),
  briefId: z.string().nullable(),
  origin: z.enum(DecisionOrigin),
  title: z.string(),
  context: z.string().nullable(),
  recommendation: z.string().nullable(),
  evidenceRefs: jsonValueSchema,
  priority: z.enum(DecisionPriority),
  dueAt: isoDate.nullable(),
  status: z.enum(DecisionStatus),
  deferredUntil: isoDate.nullable(),
  resolutionNote: z.string().nullable(),
  actionType: z.enum(DecisionActionType).nullable(),
  actionPayload: z.unknown().nullable(),
  actionRevision: z.number().int().nonnegative(),
  executionStatus: z.enum(DecisionExecutionStatus),
  executionAttempts: z.number().int().nonnegative(),
  lastExecutionErrorCode: z.string().nullable(),
  lastExecutionError: z.string().nullable(),
  executedAt: isoDate.nullable(),
  resultType: z.string().nullable(),
  resultId: z.string().nullable(),
  resultLabel: z.string().nullable(),
  resultHref: z.string().nullable(),
  createdByType: z.enum(DecisionActorKind),
  createdById: z.string(),
  createdByName: z.string(),
  resolvedByOperatorId: z.string().nullable(),
  resolvedByOperatorName: z.string().nullable(),
  resolvedAt: isoDate.nullable(),
  version: z.number().int().positive(),
  createdAt: isoDate,
  updatedAt: isoDate,
});

const decisionActionReceiptSchema = z.object({
  id: z.string(),
  decisionId: z.string(),
  actionRevision: z.number().int().positive(),
  actionType: z.enum(DecisionActionType),
  payloadHash: z.string().regex(/^[a-f0-9]{64}$/),
  historicalTargetId: z.string(),
  historicalTargetType: z.string(),
  historicalTargetLabel: z.string(),
  historicalTargetHref: z.string().nullable(),
  liveTargetId: z.string().nullable(),
  liveTargetHref: z.string().nullable(),
  targetAvailability: z.enum(DecisionTargetAvailability),
  committedAt: isoDate,
  createdAt: isoDate,
});

const decisionEventSchema = z.object({
  id: z.string(),
  decisionId: z.string(),
  receiptId: z.string().nullable(),
  sequence: z.number().int().positive(),
  type: z.enum(DecisionEventType),
  actorKind: z.enum(DecisionActorKind),
  actorId: z.string(),
  actorName: z.string(),
  fromStatus: z.enum(DecisionStatus).nullable(),
  toStatus: z.enum(DecisionStatus).nullable(),
  fromExecutionStatus: z.enum(DecisionExecutionStatus).nullable(),
  toExecutionStatus: z.enum(DecisionExecutionStatus).nullable(),
  actionRevision: z.number().int().nonnegative(),
  payloadHash: z.string().nullable(),
  targetType: z.string().nullable(),
  targetId: z.string().nullable(),
  targetLabel: z.string().nullable(),
  errorCode: z.string().nullable(),
  errorMessage: z.string().nullable(),
  createdAt: isoDate,
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
    timeZone: z.string().default("UTC"),
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
  calendarEvents: z.array(calendarEventSchema).optional(),
  calendarEventExceptions: z.array(calendarEventExceptionSchema).optional(),
  reminders: z.array(reminderSchema).optional(),
  reminderOccurrences: z.array(reminderOccurrenceSchema).optional(),
  calendarLinks: z.array(calendarLinkSchema).optional(),
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
  mailTemplates: z.array(mailTemplateSchema).optional(),
  mailTemplateTags: z.array(mailTemplateTagSchema).optional(),
  mailTemplateTagLinks: z.array(mailTemplateTagLinkSchema).optional(),
  logEntries: z.array(logEntrySchema).optional(),
  alertCategories: z.array(alertCategorySchema).optional(),
  alerts: z.array(alertSchema).optional(),
  services: z.array(serviceSchema).optional(),
  serviceChecks: z.array(serviceCheckSchema).optional(),
  webhookTokens: z.array(webhookTokenSchema).optional(),
  outgoingWebhooks: z.array(outgoingWebhookSchema).optional(),
  providerResourceBindings: z.array(providerResourceBindingSchema).optional(),
  providerCredentials: z.array(providerCredentialSchema).optional(),
  executiveBriefGenerations: z.array(executiveBriefGenerationSchema).optional(),
  executiveBriefs: z.array(executiveBriefSchema).optional(),
  decisions: z.array(decisionSchema).optional(),
  decisionEvents: z.array(decisionEventSchema).optional(),
  decisionActionReceipts: z.array(decisionActionReceiptSchema).optional(),
});

export const backupPayloadSchema = z
  .object({
    manifest: manifestSchema,
    data: dataSchema,
  })
  .superRefine(({ data }, ctx) => {
    const generations = new Set(
      (data.executiveBriefGenerations ?? []).map((row) => row.id),
    );
    const briefs = new Set((data.executiveBriefs ?? []).map((row) => row.id));
    const decisions = new Map(
      (data.decisions ?? []).map((row) => [row.id, row]),
    );
    const receipts = new Map(
      (data.decisionActionReceipts ?? []).map((row) => [row.id, row]),
    );
    const receiptRevisions = new Set<string>();
    const eventSequences = new Set<string>();

    for (const row of data.executiveBriefs ?? []) {
      if (!generations.has(row.generationId)) {
        ctx.addIssue({
          code: "custom",
          message: "Executive brief references a missing generation.",
        });
      }
    }
    for (const row of data.decisions ?? []) {
      const hasAction = row.actionType !== null && row.actionPayload !== null;
      if (hasAction !== row.actionRevision > 0) {
        ctx.addIssue({
          code: "custom",
          message: "Decision action is invalid.",
        });
      }
      if (row.briefId !== null && !briefs.has(row.briefId)) {
        ctx.addIssue({
          code: "custom",
          message: "Decision references a missing brief.",
        });
      }
      if (
        row.executionStatus === "SUCCEEDED" &&
        (row.executedAt === null ||
          row.resultType === null ||
          row.resultId === null ||
          row.resultLabel === null)
      ) {
        ctx.addIssue({
          code: "custom",
          message: "Succeeded decision is invalid.",
        });
      }
      if (row.executionStatus === "FAILED" && row.lastExecutionError === null) {
        ctx.addIssue({
          code: "custom",
          message: "Failed decision is invalid.",
        });
      }
    }
    for (const row of data.decisionActionReceipts ?? []) {
      const decision = decisions.get(row.decisionId);
      const key = `${row.decisionId}\u0000${row.actionRevision}`;
      if (
        decision === undefined ||
        row.actionRevision > decision.actionRevision ||
        receiptRevisions.has(key) ||
        (row.targetAvailability === "AVAILABLE" && row.liveTargetId === null) ||
        (row.targetAvailability === "UNAVAILABLE" &&
          (row.liveTargetId !== null || row.liveTargetHref !== null))
      ) {
        ctx.addIssue({
          code: "custom",
          message: "Decision receipt is invalid.",
        });
      }
      receiptRevisions.add(key);
    }
    for (const row of data.decisions ?? []) {
      if (row.executionStatus !== "SUCCEEDED") continue;
      const receipt = (data.decisionActionReceipts ?? []).find(
        (candidate) =>
          candidate.decisionId === row.id &&
          candidate.actionRevision === row.actionRevision,
      );
      if (
        receipt === undefined ||
        receipt.historicalTargetType !== row.resultType ||
        receipt.historicalTargetId !== row.resultId ||
        receipt.historicalTargetLabel !== row.resultLabel
      ) {
        ctx.addIssue({
          code: "custom",
          message: "Succeeded decision receipt is inconsistent.",
        });
      }
    }
    for (const row of data.decisionEvents ?? []) {
      const sequenceKey = `${row.decisionId}\u0000${row.sequence}`;
      const receipt =
        row.receiptId === null ? null : receipts.get(row.receiptId);
      if (
        !decisions.has(row.decisionId) ||
        eventSequences.has(sequenceKey) ||
        (row.receiptId !== null &&
          (receipt === null ||
            receipt === undefined ||
            receipt.decisionId !== row.decisionId))
      ) {
        ctx.addIssue({ code: "custom", message: "Decision event is invalid." });
      }
      eventSequences.add(sequenceKey);
    }
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
export type BackupMailTemplateRecord = z.infer<typeof mailTemplateSchema>;
export type BackupMailTemplateTagRecord = z.infer<typeof mailTemplateTagSchema>;
export type BackupMailTemplateTagLinkRecord = z.infer<
  typeof mailTemplateTagLinkSchema
>;
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
export type BackupExecutiveBriefGenerationRecord = z.infer<
  typeof executiveBriefGenerationSchema
>;
export type BackupExecutiveBriefRecord = z.infer<typeof executiveBriefSchema>;
export type BackupDecisionRecord = z.infer<typeof decisionSchema>;
export type BackupDecisionActionReceiptRecord = z.infer<
  typeof decisionActionReceiptSchema
>;
export type BackupDecisionEventRecord = z.infer<typeof decisionEventSchema>;
