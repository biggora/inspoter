import { z } from "zod";
import { VALIDATION_RU } from "@/lib/validation/error-map";

// Legacy workspace-wide token management keeps its original permissive wire
// contract for backwards compatibility. This schema is UI-facing (used by
// the workspace settings webhook-tokens dialog), so messages are Russian.
export const createWebhookTokenSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, { error: () => VALIDATION_RU.webhookToken.nameRequired }),
});

// UI-facing (channel settings dialog's "create channel webhook" form) —
// Russian messages surface as fieldErrors there.
export const createChannelWebhookSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, { error: () => VALIDATION_RU.webhookToken.nameRequired })
      .max(80),
  })
  .strict();

// TODO(i18n): the two schemas below stay English — they validate the
// inbound POST body of an external channel-webhook call (an outside
// service/script hitting the channel's webhook URL directly), not a form
// submission from the Russian dashboard UI. They surface only in a JSON API
// response to that external caller. This migration's Phase C deliberately
// doesn't touch API error-message consistency for third-party payloads; see
// the equivalent carve-out already applied in src/lib/validation/webhooks.ts.
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
