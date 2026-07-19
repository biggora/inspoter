import { z } from "zod";

// Per-type webhook payload schemas (architecture.md §3.2 step G, AC-WH-002).
// Single source of input validation for the webhook pipeline. Only `log` is
// registered in Slice 4 — mail/message/alert are added in Slices 5-7.
//
// TODO(i18n): messages here stay English — they surface in JSON API
// responses to external/third-party callers hitting /api/webhooks/[type]
// (Bearer-token authenticated, no session and no Russian dashboard UI in the
// loop at all), not the dashboard UI. This migration's Phase C deliberately
// doesn't touch API error-message consistency for third-party payloads; this
// is an intentional carve-out, not an oversight.

const logSchema = z.object({
  level: z.string().trim().min(1, "level is required"),
  source: z.string().trim().min(1, "source is required"),
  message: z.string().trim().min(1, "message is required"),
  timestamp: z.string().datetime().optional(),
});

const alertSchema = z.object({
  category: z.string().trim().min(1, "category is required"),
  severity: z.string().trim().min(1, "severity is required"),
  source: z.string().trim().min(1, "source is required"),
  message: z.string().trim().min(1, "message is required"),
  timestamp: z.string().datetime().optional(),
});

const mailSchema = z.object({
  sender: z.string().trim().min(1, "sender is required"),
  subject: z.string().trim().min(1, "subject is required"),
  body: z.string().min(1, "body is required"),
  receivedAt: z.string().datetime().optional(),
});

const messageSchema = z.object({
  channelId: z.string().trim().min(1, "channelId is required"),
  content: z.string().min(1, "content is required"),
  author: z.string().optional(),
});

const schemas: Record<string, z.ZodTypeAny> = {
  log: logSchema,
  alert: alertSchema,
  mail: mailSchema,
  message: messageSchema,
};

export function getWebhookSchema(type: string): z.ZodTypeAny | null {
  return schemas[type] ?? null;
}

export const SUPPORTED_TYPES = Object.keys(schemas);
export type LogWebhookPayload = z.infer<typeof logSchema>;
export type AlertWebhookPayload = z.infer<typeof alertSchema>;
export type MailWebhookPayload = z.infer<typeof mailSchema>;
export type MessageWebhookPayload = z.infer<typeof messageSchema>;
