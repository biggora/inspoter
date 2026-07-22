import { z } from "zod";
import { isMailLabelColor, type MailLabelColor } from "@/lib/mail-label-color";
import { VALIDATION_RU } from "@/lib/validation/error-map";
import { normalizeMailLabelDisplayName } from "@/lib/mail-label-normalization";

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

export const sendMailSchema = z
  .object({
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
    bodyText: z
      .string()
      .trim()
      .min(1, { error: () => VALIDATION_RU.mailSend.bodyRequired })
      .max(500_000, { error: () => VALIDATION_RU.mailSend.bodyTooLong }),
    bodyHtml: z
      .string()
      .min(1, { error: () => VALIDATION_RU.mailSend.bodyRequired })
      .max(500_000, { error: () => VALIDATION_RU.mailSend.bodyTooLong }),
    inReplyToId: z.string().optional(),
    forwardOfId: z.string().optional(),
    draftId: z.string().optional(),
  })
  .refine((input) => !(input.inReplyToId && input.forwardOfId), {
    error: () => VALIDATION_RU.mailSend.originalModeInvalid,
    path: ["forwardOfId"],
  });

export type SendMailInput = z.infer<typeof sendMailSchema>;

const draftRecipientListSchema = z
  .array(z.string().trim().max(320))
  .max(50, { error: () => VALIDATION_RU.mailSend.tooManyRecipients });

export const saveMailDraftSchema = z
  .object({
    draftId: z.string().optional(),
    accountId: z
      .string()
      .min(1, { error: () => VALIDATION_RU.mailSend.accountRequired }),
    to: draftRecipientListSchema.default([]),
    cc: draftRecipientListSchema.default([]),
    bcc: draftRecipientListSchema.default([]),
    subject: z.string().max(500, {
      error: () => VALIDATION_RU.mailSend.subjectTooLong,
    }),
    bodyText: z.string().max(500_000, {
      error: () => VALIDATION_RU.mailSend.bodyTooLong,
    }),
    bodyHtml: z.string().max(500_000, {
      error: () => VALIDATION_RU.mailSend.bodyTooLong,
    }),
    inReplyToId: z.string().optional(),
    forwardOfId: z.string().optional(),
  })
  .refine((input) => !(input.inReplyToId && input.forwardOfId), {
    error: () => VALIDATION_RU.mailSend.originalModeInvalid,
    path: ["forwardOfId"],
  });

export type SaveMailDraftInput = z.infer<typeof saveMailDraftSchema>;

// --- Inspoter labels and future-message rules (Q-15) ---

export const mailLabelColorSchema = z
  .string({ error: "LABEL_COLOR_INVALID" })
  .transform((value) => value.trim().toUpperCase())
  .refine(isMailLabelColor, { error: "LABEL_COLOR_INVALID" })
  .transform((value) => value as MailLabelColor);

const mailLabelNameSchema = z
  .string({ error: "LABEL_NAME_REQUIRED" })
  .transform(normalizeMailLabelDisplayName)
  .pipe(
    z
      .string()
      .min(1, { error: "LABEL_NAME_REQUIRED" })
      .max(40, { error: "LABEL_NAME_TOO_LONG" }),
  );

export const createMailLabelSchema = z
  .object({
    name: mailLabelNameSchema,
    color: mailLabelColorSchema,
  })
  .strict();

export type CreateMailLabelInput = z.infer<typeof createMailLabelSchema>;

export const listMailLabelsQuerySchema = z
  .object({
    accountId: z.string().trim().min(1).optional(),
    folderId: z.string().trim().min(1).optional(),
  })
  .strict()
  .refine((input) => Boolean(input.accountId) === Boolean(input.folderId), {
    error: "LABEL_COUNT_SCOPE_REQUIRED",
  });

export const updateMailLabelSchema = z
  .object({
    name: mailLabelNameSchema.optional(),
    color: mailLabelColorSchema.optional(),
    position: z
      .number({ error: "LABEL_POSITION_REQUIRED" })
      .int({ error: "LABEL_POSITION_INVALID" })
      .min(0, { error: "LABEL_POSITION_INVALID" })
      .optional(),
  })
  .strict()
  .refine(
    (input) =>
      input.name !== undefined ||
      input.color !== undefined ||
      input.position !== undefined,
    { error: "LABEL_UPDATE_REQUIRED" },
  );

export type UpdateMailLabelInput = z.infer<typeof updateMailLabelSchema>;

export const listMailQuerySchema = z
  .object({
    cursor: z.string().min(1).optional(),
    from: z.string().optional(),
    query: z.string().optional(),
    sort: z.enum(["asc", "desc"]).optional(),
    accountId: z.string().trim().min(1).optional(),
    folderId: z.string().trim().min(1).optional(),
    labelId: z.string().trim().min(1).optional(),
    unread: z.enum(["0", "1"]).optional(),
  })
  .strict();

export type ListMailQueryInput = z.infer<typeof listMailQuerySchema>;

const mailFilterRuleNameSchema = z
  .string()
  .trim()
  .min(1, { error: "RULE_NAME_REQUIRED" })
  .max(80, { error: "RULE_NAME_TOO_LONG" });

const mailFilterSenderSchema = z
  .string()
  .transform((value) => value.normalize("NFKC").trim())
  .pipe(z.string().max(320, { error: "SENDER_TOO_LONG" }))
  .nullable();

const mailFilterSubjectSchema = z
  .string()
  .transform((value) => value.normalize("NFKC").trim())
  .pipe(z.string().max(200, { error: "SUBJECT_FILTER_TOO_LONG" }))
  .nullable();

function hasMailFilterPredicate(input: {
  fromAddress?: string | null;
  subjectContains?: string | null;
}): boolean {
  return Boolean(input.fromAddress || input.subjectContains);
}

export const createMailFilterRuleSchema = z
  .object({
    accountId: z.string().trim().min(1, { error: "ACCOUNT_REQUIRED" }),
    labelId: z.string().trim().min(1, { error: "LABEL_REQUIRED" }),
    name: mailFilterRuleNameSchema,
    fromAddress: mailFilterSenderSchema.optional(),
    subjectContains: mailFilterSubjectSchema.optional(),
    applyToExistingMail: z.boolean().optional(),
  })
  .strict()
  .refine(hasMailFilterPredicate, { error: "RULE_PREDICATE_REQUIRED" });

export const createExactSenderRuleSchema = createMailFilterRuleSchema;

export type CreateMailFilterRuleInput = z.infer<
  typeof createMailFilterRuleSchema
>;

export type CreateExactSenderRuleInput = z.infer<
  typeof createExactSenderRuleSchema
>;

export const updateMailFilterRuleSchema = z
  .object({
    labelId: z.string().trim().min(1, { error: "LABEL_REQUIRED" }).optional(),
    name: mailFilterRuleNameSchema.optional(),
    fromAddress: mailFilterSenderSchema.optional(),
    subjectContains: mailFilterSubjectSchema.optional(),
    isActive: z.boolean().optional(),
    position: z
      .number({ error: "RULE_POSITION_REQUIRED" })
      .int({ error: "RULE_POSITION_INVALID" })
      .min(0, { error: "RULE_POSITION_INVALID" })
      .optional(),
  })
  .strict()
  .refine((input) => Object.keys(input).length > 0, {
    error: "RULE_UPDATE_REQUIRED",
  })
  .refine(
    (input) => {
      const hasFrom = Object.hasOwn(input, "fromAddress");
      const hasSubject = Object.hasOwn(input, "subjectContains");
      return !hasFrom || !hasSubject || hasMailFilterPredicate(input);
    },
    { error: "RULE_PREDICATE_REQUIRED" },
  );

export type UpdateMailFilterRuleInput = z.infer<
  typeof updateMailFilterRuleSchema
>;

export const listExactSenderRulesQuerySchema = z
  .object({
    accountId: z.string().trim().min(1, { error: "ACCOUNT_REQUIRED" }),
  })
  .strict();

export const listMailFilterRulesQuerySchema = listExactSenderRulesQuerySchema;
