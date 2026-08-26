import { z } from "zod";
import { AGENT_RUN_TASK_MAX } from "@/lib/validation/agents";

export const AGENT_CONVERSATION_TITLE_MAX = 120;

const message = z.string().trim().min(1).max(AGENT_RUN_TASK_MAX);

export const conversationCreateSchema = z
  .object({
    agentId: z.string().trim().min(1),
    message,
  })
  .strict();

export const conversationMessageSchema = z.object({ message }).strict();

export const conversationUpdateSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(1)
      .max(AGENT_CONVERSATION_TITLE_MAX)
      .optional(),
    archived: z.boolean().optional(),
    agentId: z.string().trim().min(1).optional(),
    acknowledgeScopeDowngrade: z.boolean().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0);

export const conversationListQuerySchema = z
  .object({
    archived: z.enum(["true", "false"]).optional(),
    cursor: z.string().trim().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(50).optional(),
  })
  .strict();
