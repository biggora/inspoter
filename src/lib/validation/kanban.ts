import { z } from "zod";
import { VALIDATION_MESSAGES } from "@/lib/validation/error-map";
import { isLabelColor, type LabelColor } from "@/lib/label-color";
import { normalizeLabelDisplayName } from "@/lib/label-normalization";

// Zod schemas — single source of input validation for the Kanban section
// (ADR-011), shared by every /api/kanban/** route handler. Board, column,
// card, checklist and comment schemas emit prose from the base-language
// catalog because those messages surface directly as fieldErrors in the
// dialogs. The label schemas emit machine-readable codes instead, mirroring
// @/lib/validation/services — the label manager maps them to locale-aware
// text of its own.

const M = VALIDATION_MESSAGES.kanban;

const idSchema = z.string().min(1);

// --- Boards ---

export const kanbanBoardSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, { error: () => M.boardNameRequired })
      .max(60, { error: () => M.boardNameTooLong }),
  })
  .strict();

export const kanbanBoardUpdateSchema = kanbanBoardSchema;

export const kanbanBoardReorderSchema = z
  .object({
    order: z.array(idSchema).min(1, { error: () => M.orderRequired }),
  })
  .strict();

// --- Columns ---

// Columns reuse the label color encoding (preset name or #RRGGBB) so a column
// header and a label chip are tinted from the same palette.
const columnColorSchema = z
  .string()
  .transform((value) => value.trim().toUpperCase())
  .refine(isLabelColor, {
    error: () => VALIDATION_MESSAGES.generic.invalidValue,
  })
  .transform((value) => value as LabelColor);

const columnNameSchema = z
  .string()
  .trim()
  .min(1, { error: () => M.columnNameRequired })
  .max(40, { error: () => M.columnNameTooLong });

const wipLimitSchema = z
  .number()
  .int({ error: () => M.wipLimitOutOfRange })
  .min(1, { error: () => M.wipLimitOutOfRange })
  .max(999, { error: () => M.wipLimitOutOfRange });

export const kanbanColumnSchema = z
  .object({
    boardId: idSchema.refine(Boolean, { error: () => M.boardIdRequired }),
    name: columnNameSchema,
    color: columnColorSchema,
    wipLimit: wipLimitSchema.optional().nullable(),
    isDone: z.boolean().optional(),
  })
  .strict();

export const kanbanColumnUpdateSchema = z
  .object({
    name: columnNameSchema.optional(),
    color: columnColorSchema.optional(),
    wipLimit: wipLimitSchema.optional().nullable(),
    isDone: z.boolean().optional(),
  })
  .strict()
  .refine((input) => Object.keys(input).length > 0, {
    error: () => M.updateRequired,
  });

export const kanbanColumnReorderSchema = z
  .object({
    boardId: idSchema,
    order: z.array(idSchema).min(1, { error: () => M.orderRequired }),
  })
  .strict();

// --- Cards ---

export const KANBAN_PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;

export const KANBAN_LINK_TYPES = [
  "SERVER",
  "DOMAIN",
  "SERVICE",
  "ALERT",
  "HOSTING_ACCOUNT",
] as const;

const prioritySchema = z.enum(KANBAN_PRIORITIES, {
  error: () => M.priorityInvalid,
});

// Accepts an ISO-8601 string (what the date input and the API both send) and
// hands the service a Date, so nothing downstream re-parses user text.
const dueDateSchema = z.iso
  .datetime({ error: () => M.dueDateInvalid })
  .transform((value) => new Date(value));

const titleSchema = z
  .string()
  .trim()
  .min(1, { error: () => M.cardTitleRequired })
  .max(200, { error: () => M.cardTitleTooLong });

const descriptionSchema = z
  .string()
  .max(20_000, { error: () => M.descriptionTooLong });

const linkTypeSchema = z.enum(KANBAN_LINK_TYPES, {
  error: () => M.linkTypeInvalid,
});

// linkedType and linkedId travel together — the DB CHECK enforces the same
// pairing, and rejecting it here turns a 500 into a field error.
function linkPairIsComplete(input: {
  linkedType?: string | null;
  linkedId?: string | null;
}): boolean {
  const hasType = input.linkedType !== undefined && input.linkedType !== null;
  const hasId = input.linkedId !== undefined && input.linkedId !== null;
  return hasType === hasId;
}

const cardLinkFields = {
  linkedType: linkTypeSchema.optional().nullable(),
  linkedId: idSchema.optional().nullable(),
  linkedLabel: z.string().trim().max(200).optional().nullable(),
};

export const kanbanCardSchema = z
  .object({
    columnId: idSchema.refine(Boolean, { error: () => M.columnIdRequired }),
    title: titleSchema,
    description: descriptionSchema.optional().nullable(),
    priority: prioritySchema.optional(),
    dueDate: dueDateSchema.optional().nullable(),
    assigneeOperatorId: idSchema.optional().nullable(),
    labelIds: z.array(idSchema).optional(),
    ...cardLinkFields,
  })
  .strict()
  .refine(linkPairIsComplete, { error: () => M.linkIncomplete });

export const kanbanCardUpdateSchema = z
  .object({
    title: titleSchema.optional(),
    description: descriptionSchema.optional().nullable(),
    priority: prioritySchema.optional(),
    dueDate: dueDateSchema.optional().nullable(),
    assigneeOperatorId: idSchema.optional().nullable(),
    ...cardLinkFields,
  })
  .strict()
  .refine((input) => Object.keys(input).length > 0, {
    error: () => M.updateRequired,
  })
  .refine(linkPairIsComplete, { error: () => M.linkIncomplete });

// Drag-and-drop contract, shaped exactly like bookmarkReorderSchema: a drop
// touches the source column and the destination column, and nothing else, so
// the client can post the post-drop card order of both and the server rewrites
// only those two.
export const kanbanCardMoveSchema = z
  .object({
    boardId: idSchema,
    columns: z
      .array(
        z.object({
          columnId: idSchema,
          cardIds: z.array(idSchema),
        }),
      )
      .min(1, { error: () => M.orderRequired })
      .max(2, { error: () => M.moveColumnsInvalid }),
  })
  .strict();

export const kanbanCardLabelsSchema = z
  .object({
    labelIds: z.array(idSchema),
  })
  .strict();

// --- Checklist ---

const checklistTextSchema = z
  .string()
  .trim()
  .min(1, { error: () => M.checklistTextRequired })
  .max(200, { error: () => M.checklistTextTooLong });

export const kanbanChecklistItemSchema = z
  .object({ text: checklistTextSchema })
  .strict();

export const kanbanChecklistItemUpdateSchema = z
  .object({
    text: checklistTextSchema.optional(),
    isDone: z.boolean().optional(),
  })
  .strict()
  .refine((input) => Object.keys(input).length > 0, {
    error: () => M.updateRequired,
  });

// --- Comments ---

export const kanbanCommentSchema = z
  .object({
    body: z
      .string()
      .trim()
      .min(1, { error: () => M.commentBodyRequired })
      .max(5000, { error: () => M.commentBodyTooLong }),
  })
  .strict();

// --- Labels ---
// Machine-readable codes, same contract as createServiceLabelSchema.

const labelColorSchema = z
  .string({ error: "LABEL_COLOR_INVALID" })
  .transform((value) => value.trim().toUpperCase())
  .refine(isLabelColor, { error: "LABEL_COLOR_INVALID" })
  .transform((value) => value as LabelColor);

const labelNameSchema = z
  .string({ error: "LABEL_NAME_REQUIRED" })
  .transform(normalizeLabelDisplayName)
  .pipe(
    z
      .string()
      .min(1, { error: "LABEL_NAME_REQUIRED" })
      .max(40, { error: "LABEL_NAME_TOO_LONG" }),
  );

export const createKanbanLabelSchema = z
  .object({ name: labelNameSchema, color: labelColorSchema })
  .strict();

export const updateKanbanLabelSchema = z
  .object({
    name: labelNameSchema.optional(),
    color: labelColorSchema.optional(),
  })
  .strict()
  .refine((input) => input.name !== undefined || input.color !== undefined, {
    error: "LABEL_UPDATE_REQUIRED",
  });

export type KanbanBoardInput = z.infer<typeof kanbanBoardSchema>;
export type KanbanBoardReorderInput = z.infer<typeof kanbanBoardReorderSchema>;
export type KanbanColumnInput = z.infer<typeof kanbanColumnSchema>;
export type KanbanColumnUpdateInput = z.infer<typeof kanbanColumnUpdateSchema>;
export type KanbanColumnReorderInput = z.infer<
  typeof kanbanColumnReorderSchema
>;
export type KanbanCardInput = z.infer<typeof kanbanCardSchema>;
export type KanbanCardUpdateInput = z.infer<typeof kanbanCardUpdateSchema>;
export type KanbanCardMoveInput = z.infer<typeof kanbanCardMoveSchema>;
export type KanbanCardLabelsInput = z.infer<typeof kanbanCardLabelsSchema>;
export type KanbanChecklistItemInput = z.infer<
  typeof kanbanChecklistItemSchema
>;
export type KanbanChecklistItemUpdateInput = z.infer<
  typeof kanbanChecklistItemUpdateSchema
>;
export type KanbanCommentInput = z.infer<typeof kanbanCommentSchema>;
export type CreateKanbanLabelInput = z.infer<typeof createKanbanLabelSchema>;
export type UpdateKanbanLabelInput = z.infer<typeof updateKanbanLabelSchema>;
