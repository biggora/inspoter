import { z } from "zod";
import { VALIDATION_RU } from "@/lib/validation/error-map";

// Zod schemas for the mail accounts API (plan §4) — single source of input
// validation, shared by the /api/mail/accounts route handlers. Messages are
// Russian because they surface directly as fieldErrors in the settings dialog.

// Bare hostname or IP: dot-separated labels of letters/digits/hyphens —
// no scheme, no slashes, no spaces, no ports (SSRF guard, plan §6).
const HOSTNAME_REGEX =
  /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*$/;

const hostSchema = z
  .string()
  .trim()
  .min(1, { error: () => VALIDATION_RU.mailAccount.hostRequired })
  .max(253, { error: () => VALIDATION_RU.mailAccount.hostTooLong })
  .regex(HOSTNAME_REGEX, {
    error: () => VALIDATION_RU.mailAccount.hostInvalidFormat,
  });

const portSchema = z
  .number({ error: () => VALIDATION_RU.mailAccount.portMustBeNumber })
  .int({ error: () => VALIDATION_RU.mailAccount.portMustBeInteger })
  .min(1, { error: () => VALIDATION_RU.mailAccount.portOutOfRange })
  .max(65535, { error: () => VALIDATION_RU.mailAccount.portOutOfRange });

const securitySchema = z.enum(["SSL", "STARTTLS"], {
  error: () => VALIDATION_RU.mailAccount.invalidSecurity,
});

export const createMailAccountSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, { error: () => VALIDATION_RU.mailAccount.nameRequired })
    .max(100, { error: () => VALIDATION_RU.mailAccount.nameTooLong }),
  email: z.email({ error: () => VALIDATION_RU.mailAccount.emailInvalid }),
  imapHost: hostSchema,
  imapPort: portSchema.default(993),
  imapSecurity: securitySchema.default("SSL"),
  smtpHost: hostSchema,
  smtpPort: portSchema.default(465),
  smtpSecurity: securitySchema.default("SSL"),
  username: z
    .string()
    .trim()
    .min(1, { error: () => VALIDATION_RU.mailAccount.usernameRequired }),
  password: z
    .string()
    .min(1, { error: () => VALIDATION_RU.mailAccount.passwordRequired }),
  mode: z.enum(["MOCK", "REAL"]).default("REAL"),
});

export type CreateMailAccountInput = z.infer<typeof createMailAccountSchema>;

// PATCH payload: every field optional; empty/absent password means "keep the
// stored one" (blank-means-keep, plan §6), so no min(1) on password here.
export const updateMailAccountSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, { error: () => VALIDATION_RU.mailAccount.nameRequired })
    .max(100, { error: () => VALIDATION_RU.mailAccount.nameTooLong })
    .optional(),
  email: z
    .email({ error: () => VALIDATION_RU.mailAccount.emailInvalid })
    .optional(),
  imapHost: hostSchema.optional(),
  imapPort: portSchema.optional(),
  imapSecurity: securitySchema.optional(),
  smtpHost: hostSchema.optional(),
  smtpPort: portSchema.optional(),
  smtpSecurity: securitySchema.optional(),
  username: z
    .string()
    .trim()
    .min(1, { error: () => VALIDATION_RU.mailAccount.usernameRequired })
    .optional(),
  password: z.string().optional(),
});

export type UpdateMailAccountInput = z.infer<typeof updateMailAccountSchema>;

// POST /api/mail/accounts/test takes the same raw connection input as create
// (nothing is persisted — a transient driver is built from it).
export const testMailAccountSchema = createMailAccountSchema;

export type TestMailAccountInput = z.infer<typeof testMailAccountSchema>;

// --- Mail item actions + send (plan §4, Phase 6) ---

export const patchMailItemSchema = z.object({
  isRead: z.boolean({
    error: () => VALIDATION_RU.mailItem.isReadMustBeBoolean,
  }),
});

export type PatchMailItemInput = z.infer<typeof patchMailItemSchema>;

export const moveMailItemSchema = z.object({
  targetFolderId: z
    .string()
    .min(1, { error: () => VALIDATION_RU.mailItem.targetFolderRequired }),
});

export type MoveMailItemInput = z.infer<typeof moveMailItemSchema>;

const recipientListSchema = z
  .array(z.email({ error: () => VALIDATION_RU.mailSend.recipientEmailInvalid }))
  .max(50, { error: () => VALIDATION_RU.mailSend.tooManyRecipients });

export const sendMailSchema = z.object({
  accountId: z
    .string()
    .min(1, { error: () => VALIDATION_RU.mailSend.accountRequired }),
  to: recipientListSchema.min(1, {
    error: () => VALIDATION_RU.mailSend.atLeastOneRecipientRequired,
  }),
  cc: recipientListSchema.default([]),
  bcc: recipientListSchema.default([]),
  subject: z
    .string()
    .min(1, { error: () => VALIDATION_RU.mailSend.subjectRequired })
    .max(500, { error: () => VALIDATION_RU.mailSend.subjectTooLong }),
  body: z
    .string()
    .min(1, { error: () => VALIDATION_RU.mailSend.bodyRequired })
    .max(500_000, { error: () => VALIDATION_RU.mailSend.bodyTooLong }),
  inReplyToId: z.string().optional(),
});

export type SendMailInput = z.infer<typeof sendMailSchema>;
