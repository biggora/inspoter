import { z } from "zod";
import { VALIDATION_MESSAGES } from "@/lib/validation/error-map";
import {
  OutgoingWebhookEvent,
  OutgoingWebhookFormat,
} from "@/generated/prisma/client";

// UI-facing (settings > outgoing webhooks form) — these messages surface as
// fieldErrors there. Mirrors src/lib/validation/webhookTokens.ts.

export const OUTGOING_WEBHOOK_EVENTS = [
  OutgoingWebhookEvent.ALERT_CREATED,
  OutgoingWebhookEvent.SERVICE_STATUS,
  OutgoingWebhookEvent.MESSAGE_CREATED,
  OutgoingWebhookEvent.LOG_CREATED,
  OutgoingWebhookEvent.MAIL_RECEIVED,
] as const;

const eventSchema = z.enum(OutgoingWebhookEvent, {
  error: () => VALIDATION_MESSAGES.outgoingWebhook.eventInvalid,
});

export const createOutgoingWebhookSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, { error: () => VALIDATION_MESSAGES.outgoingWebhook.nameRequired })
      .max(80, {
        error: () => VALIDATION_MESSAGES.outgoingWebhook.nameTooLong,
      }),
    url: z
      .string()
      .trim()
      .min(1, { error: () => VALIDATION_MESSAGES.outgoingWebhook.urlRequired })
      .refine((value) => /^https:\/\//i.test(value), {
        error: () => VALIDATION_MESSAGES.outgoingWebhook.urlInvalid,
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
        { error: () => VALIDATION_MESSAGES.outgoingWebhook.urlInvalid },
      ),
    events: z.array(eventSchema).min(1, {
      error: () => VALIDATION_MESSAGES.outgoingWebhook.eventsRequired,
    }),
    isActive: z.boolean().default(true),
    // Wire format (specs/discord-webhook-compatibility.md §6-§7). Optional so
    // the pre-Discord request body still validates unchanged.
    format: z
      .enum(OutgoingWebhookFormat, {
        error: () => VALIDATION_MESSAGES.outgoingWebhook.formatInvalid,
      })
      .optional(),
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
