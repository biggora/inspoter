import type { OutgoingWebhookEvent } from "@/generated/prisma/client";
import type {
  DiscordEmbed,
  SlackWebhookPayload,
} from "@/lib/validation/discord";

// Event → embed mapping for the DISCORD_EXECUTE egress format
// (specs/discord-webhook-compatibility.md §6), plus the Slack-attachment
// translation used by the /slack ingress suffix (§2.7).

const COLOR = {
  blurple: 0x5865f2,
  green: 0x57f287,
  yellow: 0xfee75c,
  red: 0xed4245,
  grey: 0x4f545c,
} as const;

function text(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return undefined;
}

function clamp(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

function field(
  name: string,
  value: unknown,
  inline = true,
): { name: string; value: string; inline: boolean } | null {
  const rendered = text(value);
  return rendered ? { name, value: clamp(rendered, 1024), inline } : null;
}

function severityColor(value: unknown): number {
  const severity = text(value)?.toLowerCase();
  if (severity === "critical" || severity === "error") return COLOR.red;
  if (severity === "warning" || severity === "warn") return COLOR.yellow;
  return COLOR.blurple;
}

function statusColor(value: unknown): number {
  const status = text(value)?.toLowerCase();
  if (status === "up" || status === "ok") return COLOR.green;
  if (status === "down" || status === "error") return COLOR.red;
  if (status === "degraded") return COLOR.yellow;
  return COLOR.grey;
}

function levelColor(value: unknown): number {
  const level = text(value)?.toLowerCase();
  if (level === "error" || level === "fatal") return COLOR.red;
  if (level === "warn" || level === "warning") return COLOR.yellow;
  return COLOR.grey;
}

interface EmbedSpec {
  title: string;
  description?: string;
  color: number;
  fields: Array<{ name: string; value: string; inline: boolean }>;
}

function specFor(
  event: OutgoingWebhookEvent,
  data: Record<string, unknown>,
): EmbedSpec {
  switch (event) {
    case "ALERT_CREATED":
      return {
        title: text(data.category) ?? "Alert",
        description: text(data.message),
        color: severityColor(data.severity),
        fields: [
          field("severity", data.severity),
          field("source", data.source),
        ].filter((entry) => entry !== null),
      };
    case "SERVICE_STATUS":
      return {
        title: text(data.name) ?? text(data.serviceName) ?? "Service",
        description: text(data.message) ?? text(data.url),
        color: statusColor(data.status),
        fields: [
          field("status", data.status),
          field("latency", data.latencyMs ?? data.latency),
        ].filter((entry) => entry !== null),
      };
    case "MESSAGE_CREATED":
      return {
        title: text(data.channelName) ?? text(data.channelId) ?? "Message",
        description: text(data.content),
        color: COLOR.blurple,
        fields: [
          field("author", data.author),
          field("origin", data.origin),
        ].filter((entry) => entry !== null),
      };
    case "LOG_CREATED":
      return {
        title: text(data.source) ?? "Log",
        description: text(data.message),
        color: levelColor(data.level),
        fields: [field("level", data.level)].filter((entry) => entry !== null),
      };
    case "MAIL_RECEIVED":
      return {
        title: text(data.subject) ?? "Mail",
        description: text(data.body) ?? text(data.snippet),
        color: COLOR.blurple,
        fields: [field("from", data.sender ?? data.fromAddress)].filter(
          (entry) => entry !== null,
        ),
      };
    default:
      return {
        title: String(event),
        description: undefined,
        color: COLOR.blurple,
        fields: [],
      };
  }
}

export function eventToEmbed(
  event: OutgoingWebhookEvent,
  data: Record<string, unknown>,
  timestamp: Date,
): DiscordEmbed {
  // A test delivery reuses ALERT_CREATED with a synthetic payload; give it a
  // recognisable card instead of an "Alert" with no body.
  if (data.test === true) {
    return {
      title: "Inspoter test delivery",
      description: text(data.message),
      color: COLOR.blurple,
      footer: { text: "Inspoter" },
      timestamp: timestamp.toISOString(),
    };
  }

  const spec = specFor(event, data);
  return {
    title: clamp(spec.title, 256),
    ...(spec.description ? { description: clamp(spec.description, 4096) } : {}),
    color: spec.color,
    ...(spec.fields.length ? { fields: spec.fields } : {}),
    footer: { text: `Inspoter · ${event}` },
    timestamp: timestamp.toISOString(),
  };
}

// --- Slack attachments → embeds (ingress /slack suffix) ---

// Slack ships colors as "#RRGGBB" or one of good/warning/danger.
function slackColor(value: string | undefined): number | undefined {
  if (!value) return undefined;
  if (value === "good") return COLOR.green;
  if (value === "warning") return COLOR.yellow;
  if (value === "danger") return COLOR.red;
  const hex = value.startsWith("#") ? value.slice(1) : value;
  if (!/^[0-9a-f]{6}$/i.test(hex)) return undefined;
  return Number.parseInt(hex, 16);
}

export function slackToDiscord(payload: SlackWebhookPayload): {
  content?: string;
  username?: string;
  avatar_url?: string;
  embeds: DiscordEmbed[];
} {
  const embeds: DiscordEmbed[] = (payload.attachments ?? [])
    .slice(0, 10)
    .map((attachment) => {
      const description = [attachment.pretext, attachment.text]
        .filter(Boolean)
        .join("\n\n");
      const ts =
        typeof attachment.ts === "number"
          ? new Date(attachment.ts * 1000).toISOString()
          : undefined;
      return {
        ...(attachment.title ? { title: clamp(attachment.title, 256) } : {}),
        ...(attachment.title_link ? { url: attachment.title_link } : {}),
        ...(description ? { description: clamp(description, 4096) } : {}),
        ...(slackColor(attachment.color) !== undefined
          ? { color: slackColor(attachment.color) }
          : {}),
        ...(attachment.author_name
          ? {
              author: {
                name: clamp(attachment.author_name, 256),
                ...(attachment.author_link
                  ? { url: attachment.author_link }
                  : {}),
              },
            }
          : {}),
        ...(attachment.footer
          ? { footer: { text: clamp(attachment.footer, 2048) } }
          : {}),
        ...(ts ? { timestamp: ts } : {}),
        ...(attachment.fields?.length
          ? {
              fields: attachment.fields.slice(0, 25).map((entry) => ({
                name: clamp(entry.title ?? "—", 256),
                value: clamp(entry.value ?? "—", 1024),
                inline: entry.short ?? false,
              })),
            }
          : {}),
      };
    });

  return {
    ...(payload.text ? { content: clamp(payload.text, 2000) } : {}),
    ...(payload.username ? { username: clamp(payload.username, 80) } : {}),
    ...(payload.icon_url ? { avatar_url: payload.icon_url } : {}),
    embeds,
  };
}
