import { z } from "zod";
import { isMailLabelColor, type MailLabelColor } from "@/lib/mail-label-color";
import {
  MAIL_FILTER_CONDITION_FIELDS,
  MAIL_FILTER_CONDITION_OPERATORS,
  MAIL_FILTER_MATCH_MODES,
  MAX_MAIL_FILTER_CONDITIONS,
  MAX_MAIL_FILTER_CONDITION_VALUE_LENGTH,
  isMailFilterConditionCombinationValid,
} from "@/lib/mail-filter-types";
import { VALIDATION_MESSAGES } from "@/lib/validation/error-map";
import { normalizeMailLabelDisplayName } from "@/lib/mail-label-normalization";

// Zod schemas for the mail accounts API (plan §4) — single source of input
// validation, shared by the /api/mail/accounts route handlers. Messages come
// from the base-language catalog because they surface directly as fieldErrors
// in the settings dialog.

// Bare hostname or IP: dot-separated labels of letters/digits/hyphens —
// no scheme, no slashes, no spaces, no ports (SSRF guard, plan §6).
const HOSTNAME_REGEX =
  /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*$/;

const hostSchema = z
  .string()
  .trim()
  .min(1, { error: () => VALIDATION_MESSAGES.mailAccount.hostRequired })
  .max(253, { error: () => VALIDATION_MESSAGES.mailAccount.hostTooLong })
  .regex(HOSTNAME_REGEX, {
    error: () => VALIDATION_MESSAGES.mailAccount.hostInvalidFormat,
  });

const portSchema = z
  .number({ error: () => VALIDATION_MESSAGES.mailAccount.portMustBeNumber })
  .int({ error: () => VALIDATION_MESSAGES.mailAccount.portMustBeInteger })
  .min(1, { error: () => VALIDATION_MESSAGES.mailAccount.portOutOfRange })
  .max(65535, { error: () => VALIDATION_MESSAGES.mailAccount.portOutOfRange });

const securitySchema = z.enum(["SSL", "STARTTLS"], {
  error: () => VALIDATION_MESSAGES.mailAccount.invalidSecurity,
});

export const createMailAccountSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, { error: () => VALIDATION_MESSAGES.mailAccount.nameRequired })
    .max(100, { error: () => VALIDATION_MESSAGES.mailAccount.nameTooLong }),
  email: z.email({ error: () => VALIDATION_MESSAGES.mailAccount.emailInvalid }),
  imapHost: hostSchema,
  imapPort: portSchema.default(993),
  imapSecurity: securitySchema.default("SSL"),
  smtpHost: hostSchema,
  smtpPort: portSchema.default(465),
  smtpSecurity: securitySchema.default("SSL"),
  username: z
    .string()
    .trim()
    .min(1, { error: () => VALIDATION_MESSAGES.mailAccount.usernameRequired }),
  password: z
    .string()
    .min(1, { error: () => VALIDATION_MESSAGES.mailAccount.passwordRequired }),
  mode: z.enum(["MOCK", "REAL"]).default("REAL"),
});

export type CreateMailAccountInput = z.infer<typeof createMailAccountSchema>;

// PATCH payload: every field optional; empty/absent password means "keep the
// stored one" (blank-means-keep, plan §6), so no min(1) on password here.
export const updateMailAccountSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, { error: () => VALIDATION_MESSAGES.mailAccount.nameRequired })
    .max(100, { error: () => VALIDATION_MESSAGES.mailAccount.nameTooLong })
    .optional(),
  email: z
    .email({ error: () => VALIDATION_MESSAGES.mailAccount.emailInvalid })
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
    .min(1, { error: () => VALIDATION_MESSAGES.mailAccount.usernameRequired })
    .optional(),
  password: z.string().optional(),
  isDefault: z.literal(true).optional(),
});

export type UpdateMailAccountInput = z.infer<typeof updateMailAccountSchema>;

// POST /api/mail/accounts/test takes the same raw connection input as create
// (nothing is persisted — a transient driver is built from it).
export const testMailAccountSchema = createMailAccountSchema;

export type TestMailAccountInput = z.infer<typeof testMailAccountSchema>;

// --- Mail item actions + send (plan §4, Phase 6) ---

export const patchMailItemSchema = z.object({
  isRead: z.boolean({
    error: () => VALIDATION_MESSAGES.mailItem.isReadMustBeBoolean,
  }),
});

export type PatchMailItemInput = z.infer<typeof patchMailItemSchema>;

export const moveMailItemSchema = z.object({
  targetFolderId: z
    .string()
    .min(1, { error: () => VALIDATION_MESSAGES.mailItem.targetFolderRequired }),
});

export type MoveMailItemInput = z.infer<typeof moveMailItemSchema>;

const recipientListSchema = z
  .array(
    z.email({
      error: () => VALIDATION_MESSAGES.mailSend.recipientEmailInvalid,
    }),
  )
  .max(50, { error: () => VALIDATION_MESSAGES.mailSend.tooManyRecipients });

export const sendMailSchema = z
  .object({
    accountId: z
      .string()
      .min(1, { error: () => VALIDATION_MESSAGES.mailSend.accountRequired }),
    to: recipientListSchema.min(1, {
      error: () => VALIDATION_MESSAGES.mailSend.atLeastOneRecipientRequired,
    }),
    cc: recipientListSchema.default([]),
    bcc: recipientListSchema.default([]),
    subject: z
      .string()
      .min(1, { error: () => VALIDATION_MESSAGES.mailSend.subjectRequired })
      .max(500, { error: () => VALIDATION_MESSAGES.mailSend.subjectTooLong }),
    bodyText: z
      .string()
      .trim()
      .min(1, { error: () => VALIDATION_MESSAGES.mailSend.bodyRequired })
      .max(500_000, { error: () => VALIDATION_MESSAGES.mailSend.bodyTooLong }),
    bodyHtml: z
      .string()
      .min(1, { error: () => VALIDATION_MESSAGES.mailSend.bodyRequired })
      .max(500_000, { error: () => VALIDATION_MESSAGES.mailSend.bodyTooLong }),
    inReplyToId: z.string().optional(),
    forwardOfId: z.string().optional(),
    draftId: z.string().optional(),
  })
  .refine((input) => !(input.inReplyToId && input.forwardOfId), {
    error: () => VALIDATION_MESSAGES.mailSend.originalModeInvalid,
    path: ["forwardOfId"],
  });

export type SendMailInput = z.infer<typeof sendMailSchema>;

const draftRecipientListSchema = z
  .array(z.string().trim().max(320))
  .max(50, { error: () => VALIDATION_MESSAGES.mailSend.tooManyRecipients });

export const saveMailDraftSchema = z
  .object({
    draftId: z.string().optional(),
    accountId: z
      .string()
      .min(1, { error: () => VALIDATION_MESSAGES.mailSend.accountRequired }),
    to: draftRecipientListSchema.default([]),
    cc: draftRecipientListSchema.default([]),
    bcc: draftRecipientListSchema.default([]),
    subject: z.string().max(500, {
      error: () => VALIDATION_MESSAGES.mailSend.subjectTooLong,
    }),
    bodyText: z.string().max(500_000, {
      error: () => VALIDATION_MESSAGES.mailSend.bodyTooLong,
    }),
    bodyHtml: z.string().max(500_000, {
      error: () => VALIDATION_MESSAGES.mailSend.bodyTooLong,
    }),
    inReplyToId: z.string().optional(),
    forwardOfId: z.string().optional(),
  })
  .refine((input) => !(input.inReplyToId && input.forwardOfId), {
    error: () => VALIDATION_MESSAGES.mailSend.originalModeInvalid,
    path: ["forwardOfId"],
  });

export type SaveMailDraftInput = z.infer<typeof saveMailDraftSchema>;

// --- Reusable workspace mail templates ---

const mailTemplateTagIdsSchema = z
  .array(z.string().min(1))
  .max(20)
  .refine((ids) => new Set(ids).size === ids.length, {
    error: "Template tags must be unique.",
  });

const mailTemplateContentSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    subject: z.string().max(500),
    bodyText: z.string().max(500_000),
    bodyHtml: z.string().max(500_000),
    starred: z.boolean().default(false),
    tagIds: mailTemplateTagIdsSchema.default([]),
  })
  .refine(
    (input) =>
      input.subject.trim().length > 0 || input.bodyText.trim().length > 0,
    { error: "A template subject or body is required.", path: ["bodyText"] },
  );

export const createMailTemplateSchema = mailTemplateContentSchema.strict();

export const updateMailTemplateSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    subject: z.string().max(500).optional(),
    bodyText: z.string().max(500_000).optional(),
    bodyHtml: z.string().max(500_000).optional(),
    starred: z.boolean().optional(),
    tagIds: mailTemplateTagIdsSchema.optional(),
  })
  .strict()
  .refine((input) => Object.keys(input).length > 0, {
    error: "At least one template field must be updated.",
  });

export const listMailTemplatesQuerySchema = z
  .object({
    query: z.string().trim().max(500).optional(),
    tagId: z.string().min(1).optional(),
    starred: z
      .enum(["true", "false"])
      .transform((value) => value === "true")
      .optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(24),
  })
  .strict();

export type CreateMailTemplateInput = z.infer<typeof createMailTemplateSchema>;
export type UpdateMailTemplateInput = z.infer<typeof updateMailTemplateSchema>;
export type ListMailTemplatesQuery = z.infer<
  typeof listMailTemplatesQuerySchema
>;

// --- Inspoter labels and future-message rules (Q-15) ---

export const mailLabelColorSchema = z
  .string({ error: "LABEL_COLOR_INVALID" })
  .transform((value) => value.trim().toUpperCase())
  .refine(isMailLabelColor, { error: "LABEL_COLOR_INVALID" })
  .transform((value) => value as MailLabelColor);

export const createMailTemplateTagSchema = z
  .object({
    name: z.string().trim().min(1).max(40),
    color: mailLabelColorSchema,
  })
  .strict();

export const updateMailTemplateTagSchema = z
  .object({
    name: z.string().trim().min(1).max(40).optional(),
    color: mailLabelColorSchema.optional(),
  })
  .strict()
  .refine((input) => Object.keys(input).length > 0, {
    error: "At least one tag field must be updated.",
  });

export type CreateMailTemplateTagInput = z.infer<
  typeof createMailTemplateTagSchema
>;
export type UpdateMailTemplateTagInput = z.infer<
  typeof updateMailTemplateTagSchema
>;

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
  conditions?: readonly unknown[];
}): boolean {
  return Boolean(
    input.conditions?.length || input.fromAddress || input.subjectContains,
  );
}

export const mailFilterConditionSchema = z
  .object({
    field: z.enum(MAIL_FILTER_CONDITION_FIELDS),
    operator: z.enum(MAIL_FILTER_CONDITION_OPERATORS),
    value: z
      .string()
      .transform((value) => value.normalize("NFKC").trim())
      .pipe(
        z
          .string()
          .min(1, { error: "RULE_CONDITION_VALUE_REQUIRED" })
          .max(MAX_MAIL_FILTER_CONDITION_VALUE_LENGTH, {
            error: "RULE_CONDITION_VALUE_TOO_LONG",
          }),
      ),
    isNegated: z.boolean(),
  })
  .strict()
  .superRefine((condition, context) => {
    if (
      !isMailFilterConditionCombinationValid(
        condition.field,
        condition.operator,
      )
    ) {
      context.addIssue({
        code: "custom",
        path: ["operator"],
        message: "RULE_CONDITION_OPERATOR_INVALID",
      });
    }
    if (
      condition.field === "HAS_ATTACHMENT" &&
      condition.value.toLocaleLowerCase("en-US") !== "true" &&
      condition.value.toLocaleLowerCase("en-US") !== "false"
    ) {
      context.addIssue({
        code: "custom",
        path: ["value"],
        message: "RULE_CONDITION_VALUE_INVALID",
      });
    }
  });

const mailFilterConditionsSchema = z
  .array(mailFilterConditionSchema)
  .min(1, { error: "RULE_PREDICATE_REQUIRED" })
  .max(MAX_MAIL_FILTER_CONDITIONS, { error: "RULE_TOO_MANY_CONDITIONS" });

export const createMailFilterRuleSchema = z
  .object({
    accountId: z.string().trim().min(1, { error: "ACCOUNT_REQUIRED" }),
    labelId: z.string().trim().min(1, { error: "LABEL_REQUIRED" }),
    name: mailFilterRuleNameSchema,
    matchMode: z.enum(MAIL_FILTER_MATCH_MODES).optional(),
    conditions: mailFilterConditionsSchema.optional(),
    fromAddress: mailFilterSenderSchema.optional(),
    subjectContains: mailFilterSubjectSchema.optional(),
    setRead: z.boolean().nullable().optional(),
    moveToFolderId: z.string().trim().min(1).nullable().optional(),
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
    matchMode: z.enum(MAIL_FILTER_MATCH_MODES).optional(),
    conditions: mailFilterConditionsSchema.optional(),
    fromAddress: mailFilterSenderSchema.optional(),
    subjectContains: mailFilterSubjectSchema.optional(),
    setRead: z.boolean().nullable().optional(),
    moveToFolderId: z.string().trim().min(1).nullable().optional(),
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
