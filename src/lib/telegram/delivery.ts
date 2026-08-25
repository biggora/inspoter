import type { OutgoingWebhookEvent } from "@/generated/prisma/client";
import { eventToTelegramMessage } from "@/lib/telegram/message";

// Wire details of the Telegram Bot API, kept out of
// src/lib/services/outgoingWebhooks.ts the same way src/lib/discord/delivery.ts
// is.

/**
 * Slower than the Discord ladder and much slower than the generic one: a
 * Telegram bot that is blocked or rate-limited stays that way for a while, and
 * hammering it is the fastest route to a longer block.
 */
export const TELEGRAM_BACKOFF_MS = [
  5_000, 30_000, 120_000, 600_000, 3_600_000,
] as const;

export const TELEGRAM_API_BASE = "https://api.telegram.org";
export const TELEGRAM_TIMEOUT_MS = 10_000;

export interface TelegramRequest {
  url: string;
  body: string;
  headers: Record<string, string>;
  timeoutMs: number;
}

export function buildTelegramRequest(input: {
  apiBase: string;
  botToken: string;
  chatId: string;
  event: OutgoingWebhookEvent;
  data: Record<string, unknown>;
}): TelegramRequest {
  return {
    // The token is a path segment, which is why it can never live in the
    // plaintext `url` column — see the 20260827120000 migration header.
    url: `${input.apiBase.replace(/\/+$/, "")}/bot${input.botToken}/sendMessage`,
    body: JSON.stringify({
      chat_id: input.chatId,
      text: eventToTelegramMessage(input.event, input.data),
      parse_mode: "HTML",
      disable_web_page_preview: true,
    }),
    headers: { "Content-Type": "application/json" },
    timeoutMs: TELEGRAM_TIMEOUT_MS,
  };
}

export interface TelegramOutcome {
  ok: boolean;
  /** Retrying will not help: a wrong chat, a blocked bot, a bad token. */
  permanent: boolean;
  retryAfterMs: number | null;
  message: string | null;
}

interface TelegramResponseBody {
  ok?: unknown;
  error_code?: unknown;
  description?: unknown;
  parameters?: { retry_after?: unknown };
}

/**
 * Classifies an answer from the Bot API.
 *
 * The body is parsed for every response, successful-looking or not: Telegram
 * reports some failures as HTTP 200 with `{"ok": false}`, so trusting the
 * status alone would record a delivery that never arrived.
 */
export function classifyTelegramResponse(
  status: number,
  rawBody: string,
): TelegramOutcome {
  let parsed: TelegramResponseBody | null = null;
  try {
    parsed = JSON.parse(rawBody) as TelegramResponseBody;
  } catch {
    // A non-JSON body from a proxy in front of the API; the status decides.
  }

  if (status >= 200 && status < 300 && parsed?.ok === true) {
    return { ok: true, permanent: false, retryAfterMs: null, message: null };
  }

  const code =
    typeof parsed?.error_code === "number" ? parsed.error_code : status;
  const description =
    typeof parsed?.description === "string" ? parsed.description : null;
  const retryAfter = parsed?.parameters?.retry_after;
  const retryAfterMs =
    typeof retryAfter === "number" && retryAfter >= 0
      ? Math.ceil(retryAfter * 1_000)
      : null;

  return {
    ok: false,
    // 401/403/404 and a malformed 400 are the receiver's configuration, not a
    // transient fault; 429 and 5xx are worth another attempt.
    permanent: code !== 429 && code >= 400 && code < 500,
    retryAfterMs: code === 429 ? retryAfterMs : null,
    message: description
      ? `Telegram ${code}: ${description}`
      : `HTTP ${status}`,
  };
}

/**
 * Removes the bot token from anything on its way to storage.
 *
 * The token is in the request path, and proxies echo paths back in error
 * bodies — without this it would land in WebhookDelivery.lastError and render
 * on the deliveries screen.
 */
export function redactTelegramToken(
  value: string,
  botToken: string | null,
): string {
  const withoutToken = botToken ? value.split(botToken).join("***") : value;
  // Belt and braces: catch a token this webhook does not own, echoed by a
  // shared proxy, using the Bot API's own path shape.
  return withoutToken.replace(/\/bot\d+:[A-Za-z0-9_-]{20,}/g, "/bot***");
}
