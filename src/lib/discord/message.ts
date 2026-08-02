import { toSnowflake } from "@/lib/discord/snowflake";
import type { DiscordEmbed } from "@/lib/validation/discord";

// Discord Message / Webhook objects (specs/discord-webhook-compatibility.md
// §3.4-§3.5). Fields Inspoter has no equivalent for are emitted as null or as
// empty arrays so a stock Discord client can still parse the response.

export interface DiscordMessageSource {
  id: string;
  channelId: string;
  content: string;
  author: string | null;
  avatarUrl: string | null;
  tts: boolean;
  flags: number;
  embeds: DiscordEmbed[];
  createdAt: Date;
}

export interface DiscordWebhookSource {
  id: string;
  name: string;
  channelId: string;
  createdAt: Date;
  // Null only if the channel row vanished between auth and render; the
  // snowflake then falls back to its hash-only form.
  channelCreatedAt: Date | null;
}

export function toDiscordMessage(
  message: DiscordMessageSource,
  webhook: DiscordWebhookSource,
): Record<string, unknown> {
  const webhookId = toSnowflake(webhook.id, webhook.createdAt);
  return {
    id: toSnowflake(message.id, message.createdAt),
    type: 0,
    channel_id: toSnowflake(message.channelId, webhook.channelCreatedAt),
    webhook_id: webhookId,
    author: {
      id: webhookId,
      username: message.author ?? webhook.name,
      avatar: null,
      discriminator: "0000",
      bot: true,
    },
    content: message.content,
    timestamp: message.createdAt.toISOString(),
    edited_timestamp: null,
    tts: message.tts,
    mention_everyone: false,
    mentions: [],
    mention_roles: [],
    attachments: [],
    embeds: message.embeds,
    pinned: false,
    flags: message.flags,
  };
}

export function toDiscordWebhook(
  webhook: DiscordWebhookSource,
  token: string,
  url: string,
): Record<string, unknown> {
  return {
    id: toSnowflake(webhook.id, webhook.createdAt),
    type: 1, // Incoming Webhook
    name: webhook.name,
    avatar: null,
    channel_id: toSnowflake(webhook.channelId, webhook.channelCreatedAt),
    guild_id: null,
    application_id: null,
    token,
    url,
  };
}
