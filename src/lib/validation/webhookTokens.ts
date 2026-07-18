import { z } from "zod";

// Legacy workspace-wide token management keeps its original permissive wire
// contract for backwards compatibility.
export const createWebhookTokenSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
});

export const createChannelWebhookSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(80),
  })
  .strict();

export const channelWebhookPayloadSchema = z
  .object({
    content: z.string().trim().min(1, "content is required").max(4_000),
    author: z.string().trim().min(1).max(80).optional(),
  })
  .strict();

export const idempotencyKeySchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[\x20-\x7e]+$/, "Idempotency-Key must be printable ASCII");

export type CreateWebhookTokenInput = z.infer<typeof createWebhookTokenSchema>;
export type ChannelWebhookPayload = z.infer<typeof channelWebhookPayloadSchema>;
