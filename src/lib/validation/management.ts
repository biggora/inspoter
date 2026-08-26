import { z } from "zod";

const idSchema = z.string().trim().min(1).max(191);
const titleSchema = z.string().trim().min(1).max(200);
const optionalText = (max: number) =>
  z.string().trim().max(max).nullable().optional();

const createKanbanCardActionSchema = z
  .object({
    type: z.literal("CREATE_KANBAN_CARD"),
    payload: z
      .object({
        columnId: idSchema,
        title: titleSchema,
        description: z.string().max(5_000).nullable().optional(),
        priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional(),
        dueDate: z.iso.datetime().nullable().optional(),
        assigneeOperatorId: idSchema.nullable().optional(),
        labelIds: z.array(idSchema).max(20).optional(),
      })
      .strict(),
  })
  .strict();

const createReminderActionSchema = z
  .object({
    type: z.literal("CREATE_REMINDER"),
    payload: z
      .object({
        title: titleSchema,
        description: z.string().max(5_000).nullable().optional(),
        dueAt: z.iso.datetime(),
        links: z
          .array(
            z
              .object({
                targetType: z.enum([
                  "DASHBOARD",
                  "BOOKMARK",
                  "KANBAN_BOARD",
                  "KANBAN_CARD",
                  "NOTE",
                  "AGENT",
                  "AGENT_RUN",
                  "AGENT_CONVERSATION",
                  "DOMAIN",
                  "SERVER",
                  "SERVICE",
                  "MAIL_ITEM",
                  "MAIL_TEMPLATE",
                  "CONTACT",
                  "MESSAGE_CHANNEL",
                  "MESSAGE",
                  "ACTIVITY",
                  "LOG",
                  "ALERT",
                  "EXTERNAL_URL",
                ]),
                targetId: idSchema,
                targetLabel: z.string().trim().min(1).max(200),
                targetHref: z.string().trim().max(2_000).nullable().optional(),
              })
              .strict(),
          )
          .max(20)
          .optional(),
      })
      .strict(),
  })
  .strict();

const createNoteActionSchema = z
  .object({
    type: z.literal("CREATE_NOTE"),
    payload: z
      .object({
        title: titleSchema,
        content: z.string().max(20_000).default(""),
        folderId: idSchema.nullable().optional(),
      })
      .strict(),
  })
  .strict();

const mailAddressSchema = z.email().max(320);

const createMailDraftActionSchema = z
  .object({
    type: z.literal("CREATE_MAIL_DRAFT"),
    payload: z
      .object({
        accountId: idSchema,
        to: z.array(mailAddressSchema).max(20).default([]),
        cc: z.array(mailAddressSchema).max(20).default([]),
        bcc: z.array(mailAddressSchema).max(20).default([]),
        subject: z.string().max(998).default(""),
        bodyText: z.string().max(102_400).default(""),
        bodyHtml: z.string().max(102_400).default(""),
        inReplyToId: idSchema.nullable().optional(),
        forwardOfId: idSchema.nullable().optional(),
      })
      .strict()
      .superRefine((value, ctx) => {
        if (value.to.length + value.cc.length + value.bcc.length > 40) {
          ctx.addIssue({
            code: "custom",
            path: ["to"],
            message: "A draft may contain at most 40 recipients.",
          });
        }
      }),
  })
  .strict();

export const managementActionSchema = z.discriminatedUnion("type", [
  createKanbanCardActionSchema,
  createReminderActionSchema,
  createNoteActionSchema,
  createMailDraftActionSchema,
]);

export const createDecisionSchema = z
  .object({
    title: titleSchema,
    context: optionalText(4_000),
    recommendation: optionalText(2_000),
    priority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).default("MEDIUM"),
    dueAt: z.iso.datetime().nullable().optional(),
    action: managementActionSchema.nullable().optional(),
  })
  .strict();

export const updateDecisionSchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    title: titleSchema.optional(),
    context: optionalText(4_000),
    recommendation: optionalText(2_000),
    priority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).optional(),
    dueAt: z.iso.datetime().nullable().optional(),
    action: managementActionSchema.nullable().optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.title !== undefined ||
      value.context !== undefined ||
      value.recommendation !== undefined ||
      value.priority !== undefined ||
      value.dueAt !== undefined ||
      value.action !== undefined,
    { message: "At least one decision field must be changed." },
  );

export const decisionTransitionSchema = z.discriminatedUnion("transition", [
  z
    .object({
      transition: z.literal("APPROVE"),
      expectedVersion: z.number().int().positive(),
      note: z.string().trim().max(2_000).nullable().optional(),
    })
    .strict(),
  z
    .object({
      transition: z.literal("REJECT"),
      expectedVersion: z.number().int().positive(),
      note: z.string().trim().max(2_000).nullable().optional(),
    })
    .strict(),
  z
    .object({
      transition: z.literal("DEFER"),
      expectedVersion: z.number().int().positive(),
      deferredUntil: z.iso.datetime(),
      note: z.string().trim().max(2_000).nullable().optional(),
    })
    .strict(),
]);

export const retryDecisionSchema = z
  .object({ expectedVersion: z.number().int().positive() })
  .strict();

export const rebindDecisionSchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    action: managementActionSchema,
  })
  .strict();

export const executiveSnapshotQuerySchema = z
  .object({ period: z.enum(["DAILY", "WEEKLY"]).default("DAILY") })
  .strict();

const briefItemSchema = z
  .object({
    title: titleSchema,
    detail: z.string().trim().min(1).max(1_000),
    evidenceRefs: z
      .array(z.string().trim().min(1).max(300))
      .max(20)
      .default([]),
  })
  .strict();

export const publishExecutiveBriefSchema = z
  .object({
    generationId: idSchema,
    snapshotSha256: z.string().regex(/^[a-f0-9]{64}$/),
    headline: titleSchema,
    summary: z.string().trim().min(1).max(4_000),
    highlights: z.array(briefItemSchema).max(20).default([]),
    risks: z.array(briefItemSchema).max(20).default([]),
    opportunities: z.array(briefItemSchema).max(20).default([]),
    decisions: z
      .array(
        createDecisionSchema.extend({
          evidenceRefs: z
            .array(z.string().trim().min(1).max(300))
            .max(20)
            .default([]),
        }),
      )
      .max(20)
      .default([]),
  })
  .strict();

export type ManagementAction = z.infer<typeof managementActionSchema>;
export type CreateDecisionInput = z.infer<typeof createDecisionSchema>;
export type UpdateDecisionInput = z.infer<typeof updateDecisionSchema>;
export type DecisionTransitionInput = z.infer<typeof decisionTransitionSchema>;
export type RebindDecisionInput = z.infer<typeof rebindDecisionSchema>;
export type PublishExecutiveBriefInput = z.infer<
  typeof publishExecutiveBriefSchema
>;
