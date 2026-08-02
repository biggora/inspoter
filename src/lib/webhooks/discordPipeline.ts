import type { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/config/env";
import {
  DISCORD_ERROR,
  discordEmptyResponse,
  discordError,
  discordResponse,
  invalidFormBody,
  unauthorized,
} from "@/lib/discord/errors";
import { slackToDiscord } from "@/lib/discord/embeds";
import { toDiscordMessage, toDiscordWebhook } from "@/lib/discord/message";
import * as webhookTokensService from "@/lib/services/webhookTokens";
import {
  EMBED_TOTAL_LIMIT,
  exceedsEmbedBudget,
  executeWebhookSchema,
  hasDisplayableContent,
  slackWebhookSchema,
  type DiscordEmbed,
  type ExecuteWebhookPayload,
} from "@/lib/validation/discord";
import { idempotencyKeySchema } from "@/lib/validation/webhookTokens";
import { readBodyLimited } from "@/lib/webhooks/body";
import {
  createChannelMessage,
  touchToken,
  type ChannelWebhookToken,
} from "@/lib/webhooks/channelMessage";
import { checkRateLimit, type RateLimitResult } from "@/lib/webhooks/ratelimit";

// Discord Execute Webhook ingress (specs/discord-webhook-compatibility.md §2).
// Same fail-closed order as the other ingest pipelines (architecture.md §3.2):
// size -> parse -> auth -> ratelimit -> validate -> idempotency -> write.

const SUPPRESS_EMBEDS = 1 << 2;

type AuthenticatedWebhook = ChannelWebhookToken & {
  createdAt: Date;
  channelCreatedAt: Date | null;
};

// Stable per-webhook bucket id: Discord clients use it only to group limits.
function bucketId(webhookId: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < webhookId.length; index += 1) {
    hash ^= webhookId.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

function rateLimitHeaders(
  webhookId: string,
  rate: RateLimitResult,
): Record<string, string> {
  return {
    "X-RateLimit-Limit": String(rate.limit),
    "X-RateLimit-Remaining": String(Math.max(rate.remaining, 0)),
    "X-RateLimit-Reset": (rate.resetAtMs / 1000).toFixed(3),
    "X-RateLimit-Reset-After": (
      Math.max(rate.resetAtMs - Date.now(), 0) / 1000
    ).toFixed(3),
    "X-RateLimit-Bucket": bucketId(webhookId),
  };
}

function readBoolean(request: NextRequest, name: string): boolean {
  const raw = request.nextUrl.searchParams.get(name);
  return raw === "true" || raw === "1";
}

interface ParsedBody {
  payload: unknown;
  hasFiles: boolean;
}

// JSON or multipart/form-data. In multipart the message body lives in
// `payload_json`; file parts are counted (they satisfy the "not empty" rule)
// but never stored — see §8 of the spec.
async function parseBody(
  request: NextRequest,
): Promise<ParsedBody | { error: "too_large" } | { error: "unparseable" }> {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.toLowerCase().includes("multipart/form-data")) {
    const declared = request.headers.get("content-length");
    if (declared && Number(declared) > env.WEBHOOK_MAX_BODY_BYTES) {
      return { error: "too_large" };
    }
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return { error: "unparseable" };
    }
    let hasFiles = false;
    for (const [key, value] of form.entries()) {
      if (key !== "payload_json" && typeof value !== "string") hasFiles = true;
    }
    const raw = form.get("payload_json");
    if (typeof raw !== "string") {
      return { payload: {}, hasFiles };
    }
    try {
      return { payload: JSON.parse(raw), hasFiles };
    } catch {
      return { error: "unparseable" };
    }
  }

  const body = await readBodyLimited(request, env.WEBHOOK_MAX_BODY_BYTES);
  if (!body.ok) return { error: "too_large" };
  try {
    return { payload: JSON.parse(body.text), hasFiles: false };
  } catch {
    return { error: "unparseable" };
  }
}

async function authenticate(
  webhookId: string,
  secret: string,
): Promise<AuthenticatedWebhook | null> {
  return webhookTokensService.authenticateChannelWebhook(webhookId, secret);
}

interface WriteOutcome {
  response: NextResponse;
}

async function writeMessage(
  request: NextRequest,
  webhook: AuthenticatedWebhook,
  payload: ExecuteWebhookPayload,
  headers: Record<string, string>,
  defaultWait: boolean,
): Promise<WriteOutcome> {
  const rawIdempotencyKey = request.headers.get("idempotency-key");
  const parsedKey =
    rawIdempotencyKey === null
      ? null
      : idempotencyKeySchema.safeParse(rawIdempotencyKey);
  if (parsedKey && !parsedKey.success) {
    return { response: invalidFormBody(parsedKey.error.issues, headers) };
  }

  const flags = payload.flags ?? 0;
  const embeds: DiscordEmbed[] =
    flags & SUPPRESS_EMBEDS ? [] : (payload.embeds ?? []);

  const created = await createChannelMessage(
    webhook,
    {
      content: payload.content ?? "",
      author: payload.username,
      embeds,
      avatarUrl: payload.avatar_url,
      tts: payload.tts ?? false,
      flags,
    },
    parsedKey ? parsedKey.data : null,
  );
  await touchToken(webhook.id);

  const wait = request.nextUrl.searchParams.has("wait")
    ? readBoolean(request, "wait")
    : defaultWait;
  if (!wait) {
    return { response: discordEmptyResponse(204, headers) };
  }

  return {
    response: discordResponse(
      toDiscordMessage(
        {
          id: created.id,
          channelId: webhook.channelId,
          content: payload.content ?? "",
          author: payload.username ?? webhook.name,
          avatarUrl: payload.avatar_url ?? null,
          tts: payload.tts ?? false,
          flags,
          embeds,
          createdAt: created.createdAt,
        },
        webhook,
      ),
      200,
      headers,
    ),
  };
}

type BodyTranslator = (
  raw: unknown,
) => { ok: true; payload: unknown } | { ok: false; response: NextResponse };

async function process(
  request: NextRequest,
  webhookId: string,
  secret: string,
  options: { defaultWait: boolean; translate?: BodyTranslator },
): Promise<NextResponse> {
  const parsed = await parseBody(request);
  if ("error" in parsed) {
    return parsed.error === "too_large"
      ? discordError(
          413,
          DISCORD_ERROR.REQUEST_ENTITY_TOO_LARGE,
          "Request entity too large",
        )
      : discordError(400, DISCORD_ERROR.GENERAL, "400: Bad Request");
  }

  const webhook = await authenticate(webhookId, secret);
  if (!webhook) return unauthorized();

  const rate = checkRateLimit(webhook.id);
  const headers = rateLimitHeaders(webhook.id, rate);
  if (!rate.allowed) {
    const retryAfter = Math.max(rate.retryAfterMs ?? 0, 0) / 1000;
    return discordResponse(
      {
        message: "You are being rate limited.",
        retry_after: Number(retryAfter.toFixed(3)),
        global: false,
        code: 0,
      },
      429,
      {
        ...headers,
        "Retry-After": String(Math.ceil(retryAfter)),
        "X-RateLimit-Scope": "user",
        "X-RateLimit-Global": "false",
      },
    );
  }

  let raw: unknown = parsed.payload;
  if (options.translate) {
    const translated = options.translate(raw);
    if (!translated.ok) return translated.response;
    raw = translated.payload;
  }

  const validated = executeWebhookSchema.safeParse(raw);
  if (!validated.success) {
    return invalidFormBody(validated.error.issues, headers);
  }
  if (exceedsEmbedBudget(validated.data)) {
    return discordError(
      400,
      DISCORD_ERROR.INVALID_FORM_BODY,
      "Invalid Form Body",
      {
        embeds: {
          _errors: [
            {
              code: "BASE_TYPE_MAX_LENGTH",
              message: `Embeds must not exceed ${EMBED_TOTAL_LIMIT} characters in total.`,
            },
          ],
        },
      },
      headers,
    );
  }
  if (!hasDisplayableContent(validated.data, parsed.hasFiles)) {
    return discordError(
      400,
      DISCORD_ERROR.CANNOT_SEND_EMPTY_MESSAGE,
      "Cannot send an empty message",
      undefined,
      headers,
    );
  }

  const outcome = await writeMessage(
    request,
    webhook,
    validated.data,
    headers,
    options.defaultWait,
  );
  return outcome.response;
}

export async function executeDiscordWebhook(
  request: NextRequest,
  webhookId: string,
  secret: string,
): Promise<NextResponse> {
  return process(request, webhookId, secret, { defaultWait: false });
}

// Slack-compatible suffix: same write path, Slack body translated to the
// Discord shape first, and wait defaults to true exactly as Discord's does.
export async function executeSlackWebhook(
  request: NextRequest,
  webhookId: string,
  secret: string,
): Promise<NextResponse> {
  return process(request, webhookId, secret, {
    defaultWait: true,
    translate: (raw) => {
      const parsed = slackWebhookSchema.safeParse(raw);
      if (!parsed.success) {
        return { ok: false, response: invalidFormBody(parsed.error.issues) };
      }
      return { ok: true, payload: slackToDiscord(parsed.data) };
    },
  });
}

export async function getDiscordWebhook(
  request: NextRequest,
  webhookId: string,
  secret: string,
): Promise<NextResponse> {
  const webhook = await authenticate(webhookId, secret);
  if (!webhook) return unauthorized();

  const url = new URL(
    `/api/discord/webhooks/${webhook.id}/${secret}`,
    request.nextUrl.origin,
  ).toString();
  return discordResponse(toDiscordWebhook(webhook, secret, url), 200);
}

export function unknownWebhookSuffix(): NextResponse {
  return discordError(404, DISCORD_ERROR.UNKNOWN_WEBHOOK, "Unknown Webhook");
}
