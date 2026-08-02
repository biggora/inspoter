import { z } from "zod";

// Wire contract of the token-authenticated /api/v1/messages/** surface.
// Messages stay English: the caller is an external agent or script reading a
// JSON body, not the Russian dashboard UI — the same carve-out already applied
// to the channel webhook payload in src/lib/validation/webhookTokens.ts.
//
// Every schema is `.strict()`, so a typo in a field name is rejected instead
// of silently ignored.

const name = z.string().trim().min(1, "name is required").max(120);

export const categoryNameSchema = z.object({ name }).strict();

export const createChannelSchema = z
  .object({ categoryId: z.string().min(1, "categoryId is required"), name })
  .strict();

export const channelNameSchema = z.object({ name }).strict();

export const sendMessageSchema = z
  .object({
    content: z.string().trim().min(1, "content is required").max(4_000),
    author: z.string().trim().min(1).max(80).optional(),
  })
  .strict();

export const createWebhookSchema = z
  .object({ name: z.string().trim().min(1, "name is required").max(80) })
  .strict();
