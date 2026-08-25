import type { OutgoingWebhookEvent } from "@/generated/prisma/client";

// Renders an outgoing-webhook event as the HTML Telegram accepts.
//
// This is the counterpart of src/lib/discord/embeds.ts, and it deliberately
// repeats that module's per-event switch rather than sharing one: the two
// clamps are structurally different — Telegram allows 4096 characters for the
// whole message, Discord allows 256 for a title, 4096 for a description and
// 1024 per field — so a shared spec would have to be trimmed twice anyway, and
// would fight both formats while doing it.

export const TELEGRAM_MESSAGE_MAX = 4_096;

// Telegram's HTML parse mode needs exactly these three escaped; escaping more
// would show the entities literally.
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function text(value: unknown): string | undefined {
  if (typeof value === "string") return value.trim() || undefined;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return undefined;
}

function line(label: string, value: unknown): string | null {
  const rendered = text(value);
  return rendered ? `${escapeHtml(label)}: ${escapeHtml(rendered)}` : null;
}

interface MessageSpec {
  title: string;
  body?: string;
  lines: string[];
}

function specFor(
  event: OutgoingWebhookEvent,
  data: Record<string, unknown>,
): MessageSpec {
  switch (event) {
    case "AGENT_RUN_COMPLETED":
      return {
        title: text(data.agentName) ?? "Agent run",
        body: text(data.summary) ?? text(data.error),
        lines: [
          line("Status", data.status),
          line("Steps", data.steps),
          line("Tools", data.toolCalls),
          line("Tokens", data.totalTokens),
        ].filter((entry): entry is string => entry !== null),
      };
    case "ALERT_CREATED":
      return {
        title: text(data.category) ?? "Alert",
        body: text(data.message),
        lines: [
          line("Severity", data.severity),
          line("Source", data.source),
        ].filter((entry): entry is string => entry !== null),
      };
    case "SERVICE_STATUS":
      return {
        title: text(data.name) ?? text(data.serviceName) ?? "Service",
        body: text(data.message) ?? text(data.url),
        lines: [line("Status", data.status)].filter(
          (entry): entry is string => entry !== null,
        ),
      };
    case "MESSAGE_CREATED":
      return {
        title: text(data.channelName) ?? "Message",
        body: text(data.content),
        lines: [line("Author", data.author)].filter(
          (entry): entry is string => entry !== null,
        ),
      };
    case "LOG_CREATED":
      return {
        title: text(data.source) ?? "Log entry",
        body: text(data.message),
        lines: [line("Level", data.level)].filter(
          (entry): entry is string => entry !== null,
        ),
      };
    case "MAIL_RECEIVED":
      return {
        title: text(data.subject) ?? "Mail",
        body: text(data.preview) ?? text(data.body),
        lines: [line("From", data.from)].filter(
          (entry): entry is string => entry !== null,
        ),
      };
    case "KANBAN_CARD_CREATED":
    case "KANBAN_CARD_MOVED":
    case "KANBAN_CARD_COMPLETED":
      return {
        title: text(data.title) ?? "Kanban card",
        body: text(data.linkedLabel),
        lines: [
          line("Priority", data.priority),
          line("Assignee", data.assignee),
        ].filter((entry): entry is string => entry !== null),
      };
    default:
      return { title: String(event), lines: [] };
  }
}

/**
 * The `text` field of a sendMessage call. Clamped once at the end rather than
 * per part: the limit is on the whole message, and cutting the report to fit a
 * per-field budget would lose the part an operator actually reads.
 */
export function eventToTelegramMessage(
  event: OutgoingWebhookEvent,
  data: Record<string, unknown>,
): string {
  if (data.test === true) {
    const message = text(data.message);
    return clamp(
      `<b>Inspoter test delivery</b>${message ? `\n${escapeHtml(message)}` : ""}`,
    );
  }

  const spec = specFor(event, data);
  const parts = [`<b>${escapeHtml(spec.title)}</b>`];
  if (spec.body) parts.push(escapeHtml(spec.body));
  if (spec.lines.length) parts.push(spec.lines.join("\n"));
  parts.push(`<i>Inspoter · ${escapeHtml(event)}</i>`);
  return clamp(parts.join("\n\n"));
}

function clamp(value: string): string {
  return value.length <= TELEGRAM_MESSAGE_MAX
    ? value
    : `${value.slice(0, TELEGRAM_MESSAGE_MAX - 1)}…`;
}
