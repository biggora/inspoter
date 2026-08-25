import { z } from "zod";
import { VALIDATION_MESSAGES } from "@/lib/validation/error-map";
import {
  OutgoingWebhookEvent,
  OutgoingWebhookFormat,
} from "@/generated/prisma/client";

// UI-facing (settings > outgoing webhooks form) — these messages surface as
// fieldErrors there. Mirrors src/lib/validation/webhookTokens.ts.

export const OUTGOING_WEBHOOK_EVENTS = [
  OutgoingWebhookEvent.AGENT_RUN_COMPLETED,
  OutgoingWebhookEvent.ALERT_CREATED,
  OutgoingWebhookEvent.SERVICE_STATUS,
  OutgoingWebhookEvent.MESSAGE_CREATED,
  OutgoingWebhookEvent.LOG_CREATED,
  OutgoingWebhookEvent.MAIL_RECEIVED,
  OutgoingWebhookEvent.KANBAN_CARD_CREATED,
  OutgoingWebhookEvent.KANBAN_CARD_MOVED,
  OutgoingWebhookEvent.KANBAN_CARD_COMPLETED,
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
    // Telegram derives its own target from this base plus the bot token, so
    // the field is optional there and defaults to the public API host.
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
    // TELEGRAM_BOT only. The token is write-only: it goes straight into the
    // AES-256-GCM payload and is never read back, exactly like the HMAC
    // secret.
    botToken: z
      .string()
      .trim()
      .min(10, {
        error: () => VALIDATION_MESSAGES.outgoingWebhook.botTokenInvalid,
      })
      .max(200)
      .optional(),
    // Plain addressing: a numeric id or an @channelusername.
    targetChatId: z
      .string()
      .trim()
      .min(1, {
        error: () => VALIDATION_MESSAGES.outgoingWebhook.chatIdRequired,
      })
      .max(120)
      .optional(),
  })
  .strict()
  .refine(
    (input) =>
      input.format !== "TELEGRAM_BOT" ||
      (Boolean(input.botToken) && Boolean(input.targetChatId)),
    { error: () => VALIDATION_MESSAGES.outgoingWebhook.telegramFieldsRequired },
  );

// Partial update: every field optional, but if events is present it must be
// non-empty (superRefine mirrors the create constraint).
// `.partial()` cannot be applied to a refined schema, so the update shape is
// built from the same object and re-refined: on an update the operator may
// leave the token alone, so only the chat id is required when switching in.
export const updateOutgoingWebhookSchema = z
  .object({
    ...createOutgoingWebhookSchema.def.shape,
  })
  .partial()
  .strict();

export type CreateOutgoingWebhookInput = z.infer<
  typeof createOutgoingWebhookSchema
>;
export type UpdateOutgoingWebhookInput = z.infer<
  typeof updateOutgoingWebhookSchema
>;
