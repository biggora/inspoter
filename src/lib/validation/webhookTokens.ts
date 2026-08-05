import { z } from "zod";
import { VALIDATION_MESSAGES } from "@/lib/validation/error-map";
import { MCP_SCOPES } from "@/lib/mcp/scopes";

// Legacy workspace-wide token management keeps its original permissive wire
// contract for backwards compatibility. This schema is UI-facing (used by
// the workspace settings webhook-tokens dialog), so messages come from the
// base-language catalog. `scopes` is optional and defaults to [] so the
// pre-MCP request body still validates unchanged.
const mcpScopesSchema = z.array(z.enum(MCP_SCOPES));

export const createWebhookTokenSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, { error: () => VALIDATION_MESSAGES.webhookToken.nameRequired }),
  scopes: mcpScopesSchema.default([]),
});

export const updateWebhookTokenScopesSchema = z
  .object({ scopes: mcpScopesSchema })
  .strict();

// UI-facing (channel settings dialog's "create channel webhook" form) —
// these messages surface as fieldErrors there.
export const createChannelWebhookSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, { error: () => VALIDATION_MESSAGES.webhookToken.nameRequired })
      .max(80),
  })
  .strict();

// The two schemas below carry their own inline literals rather than catalog
// entries: they validate the inbound POST body of an external channel-webhook
// call (an outside service/script hitting the channel's webhook URL directly),
// not a form submission from the dashboard, and their wording is part of that
// public wire contract. Same carve-out as src/lib/validation/webhooks.ts.
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
export type UpdateWebhookTokenScopesInput = z.infer<
  typeof updateWebhookTokenScopesSchema
>;
export type ChannelWebhookPayload = z.infer<typeof channelWebhookPayloadSchema>;
