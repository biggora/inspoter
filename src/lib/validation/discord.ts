import { z } from "zod";

// Discord Execute Webhook payload (specs/discord-webhook-compatibility.md §2.3,
// §3.1). Non-strict on purpose: Discord ignores unknown keys, so accepting them
// is part of the compatibility contract.
//
// Messages are inline literals — they surface only in the JSON body returned
// to an external sender hitting the public Discord route, never in the
// dashboard. Same carve-out as src/lib/validation/webhooks.ts.

export const EMBED_TOTAL_LIMIT = 6000;

const embedFooterSchema = z.object({
  text: z.string().max(2048, "Must be 2048 or fewer in length."),
  icon_url: z.string().max(2048).optional(),
  proxy_icon_url: z.string().max(2048).optional(),
});

const embedMediaSchema = z.object({
  url: z.string().max(2048).optional(),
  proxy_url: z.string().max(2048).optional(),
  height: z.number().int().optional(),
  width: z.number().int().optional(),
});

const embedAuthorSchema = z.object({
  name: z.string().max(256, "Must be 256 or fewer in length."),
  url: z.string().max(2048).optional(),
  icon_url: z.string().max(2048).optional(),
  proxy_icon_url: z.string().max(2048).optional(),
});

const embedProviderSchema = z.object({
  name: z.string().max(256).optional(),
  url: z.string().max(2048).optional(),
});

const embedFieldSchema = z.object({
  name: z.string().max(256, "Must be 256 or fewer in length."),
  value: z.string().max(1024, "Must be 1024 or fewer in length."),
  inline: z.boolean().optional(),
});

export const discordEmbedSchema = z.object({
  title: z.string().max(256, "Must be 256 or fewer in length.").optional(),
  type: z.string().max(32).optional(),
  description: z
    .string()
    .max(4096, "Must be 4096 or fewer in length.")
    .optional(),
  url: z.string().max(2048).optional(),
  timestamp: z.string().optional(),
  color: z.number().int().min(0).max(0xffffff).optional(),
  footer: embedFooterSchema.optional(),
  image: embedMediaSchema.optional(),
  thumbnail: embedMediaSchema.optional(),
  video: embedMediaSchema.optional(),
  provider: embedProviderSchema.optional(),
  author: embedAuthorSchema.optional(),
  fields: z
    .array(embedFieldSchema)
    .max(25, "Must be 25 or fewer in length.")
    .optional(),
});

export type DiscordEmbed = z.infer<typeof discordEmbedSchema>;

export const allowedMentionsSchema = z.object({
  parse: z.array(z.enum(["roles", "users", "everyone"])).optional(),
  roles: z.array(z.string()).max(100).optional(),
  users: z.array(z.string()).max(100).optional(),
  replied_user: z.boolean().optional(),
});

// Sum of every character Discord counts toward the 6000-per-request budget.
export function embedCharacterCount(embeds: readonly DiscordEmbed[]): number {
  let total = 0;
  for (const embed of embeds) {
    total += embed.title?.length ?? 0;
    total += embed.description?.length ?? 0;
    total += embed.footer?.text.length ?? 0;
    total += embed.author?.name.length ?? 0;
    for (const field of embed.fields ?? []) {
      total += field.name.length + field.value.length;
    }
  }
  return total;
}

export const executeWebhookSchema = z.object({
  content: z.string().max(2000, "Must be 2000 or fewer in length.").optional(),
  username: z.string().max(80, "Must be 80 or fewer in length.").optional(),
  avatar_url: z.string().max(2048).optional(),
  tts: z.boolean().optional(),
  embeds: z
    .array(discordEmbedSchema)
    .max(10, "Must be 10 or fewer in length.")
    .optional(),
  allowed_mentions: allowedMentionsSchema.optional(),
  flags: z.number().int().min(0).optional(),
  // Accepted and validated for shape, then ignored — see the limitations table
  // in specs/discord-webhook-compatibility.md §8.
  attachments: z.array(z.unknown()).max(10).optional(),
  components: z.array(z.unknown()).max(40).optional(),
  thread_name: z.string().max(100).optional(),
  applied_tags: z.array(z.string()).max(5).optional(),
  poll: z.unknown().optional(),
});

export type ExecuteWebhookPayload = z.infer<typeof executeWebhookSchema>;

// The 6000-character budget spans every embed of the request, so it can't live
// inside a per-embed schema. Kept as a separate check (rather than a refine) so
// the pipeline can attach it to the `embeds` path of the Discord error tree.
export function exceedsEmbedBudget(payload: ExecuteWebhookPayload): boolean {
  return embedCharacterCount(payload.embeds ?? []) > EMBED_TOTAL_LIMIT;
}

// Discord rejects a request that carries nothing displayable. Checked outside
// the schema so the caller can answer with 50006 instead of 50035.
export function hasDisplayableContent(
  payload: ExecuteWebhookPayload,
  hasFiles = false,
): boolean {
  return Boolean(
    payload.content?.trim() ||
    payload.embeds?.length ||
    payload.components?.length ||
    payload.poll !== undefined ||
    hasFiles,
  );
}

// --- Slack-compatible suffix (specs/discord-webhook-compatibility.md §2.7) ---

const slackFieldSchema = z.object({
  title: z.string().optional(),
  value: z.string().optional(),
  short: z.boolean().optional(),
});

const slackAttachmentSchema = z.object({
  title: z.string().optional(),
  title_link: z.string().optional(),
  text: z.string().optional(),
  pretext: z.string().optional(),
  color: z.string().optional(),
  author_name: z.string().optional(),
  author_link: z.string().optional(),
  footer: z.string().optional(),
  ts: z.union([z.number(), z.string()]).optional(),
  fields: z.array(slackFieldSchema).optional(),
});

export const slackWebhookSchema = z.object({
  text: z.string().optional(),
  username: z.string().optional(),
  icon_url: z.string().optional(),
  attachments: z.array(slackAttachmentSchema).optional(),
});

export type SlackWebhookPayload = z.infer<typeof slackWebhookSchema>;
