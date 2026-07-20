import { z } from "zod";
import { VALIDATION_RU } from "@/lib/validation/error-map";
import { OutgoingWebhookEvent } from "@/generated/prisma/client";

// UI-facing (settings > outgoing webhooks form) — Russian messages surface as
// fieldErrors there. Mirrors src/lib/validation/webhookTokens.ts.

export const OUTGOING_WEBHOOK_EVENTS = [
  OutgoingWebhookEvent.ALERT_CREATED,
  OutgoingWebhookEvent.SERVICE_STATUS,
  OutgoingWebhookEvent.MESSAGE_CREATED,
  OutgoingWebhookEvent.LOG_CREATED,
  OutgoingWebhookEvent.MAIL_RECEIVED,
] as const;

const eventSchema = z.enum(OutgoingWebhookEvent, {
  error: () => VALIDATION_RU.outgoingWebhook.eventInvalid,
});

export const createOutgoingWebhookSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, { error: () => VALIDATION_RU.outgoingWebhook.nameRequired })
      .max(80, { error: () => VALIDATION_RU.outgoingWebhook.nameTooLong }),
    url: z
      .string()
      .trim()
      .min(1, { error: () => VALIDATION_RU.outgoingWebhook.urlRequired })
      .refine((value) => /^https:\/\//i.test(value), {
        error: () => VALIDATION_RU.outgoingWebhook.urlInvalid,
      })
      .refine(
        (value) => {
          try {
            new URL(value);
            return true;
          } catch {
            return false;
          }
        },
        { error: () => VALIDATION_RU.outgoingWebhook.urlInvalid },
      ),
    events: z
      .array(eventSchema)
      .min(1, { error: () => VALIDATION_RU.outgoingWebhook.eventsRequired }),
    isActive: z.boolean().default(true),
  })
  .strict();

// Partial update: every field optional, but if events is present it must be
// non-empty (superRefine mirrors the create constraint).
export const updateOutgoingWebhookSchema = createOutgoingWebhookSchema
  .partial()
  .strict();

export type CreateOutgoingWebhookInput = z.infer<
  typeof createOutgoingWebhookSchema
>;
export type UpdateOutgoingWebhookInput = z.infer<
  typeof updateOutgoingWebhookSchema
>;
