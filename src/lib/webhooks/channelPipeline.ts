import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/config/env";
import * as webhookTokensService from "@/lib/services/webhookTokens";
import {
  channelWebhookPayloadSchema,
  idempotencyKeySchema,
} from "@/lib/validation/webhookTokens";
import { readBodyLimited } from "@/lib/webhooks/body";
import {
  createChannelMessage,
  touchToken,
} from "@/lib/webhooks/channelMessage";
import { checkRateLimit } from "@/lib/webhooks/ratelimit";

const RESPONSE_HEADERS = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
} as const;

function json(data: unknown, status: number, headers?: HeadersInit) {
  return NextResponse.json(data, {
    status,
    headers: {
      ...RESPONSE_HEADERS,
      ...Object.fromEntries(new Headers(headers)),
    },
  });
}

export async function processChannelWebhook(
  request: NextRequest,
  webhookId: string,
  secret: string,
): Promise<NextResponse> {
  const body = await readBodyLimited(request, env.WEBHOOK_MAX_BODY_BYTES);
  if (!body.ok) {
    return json({ error: "Request body is too large." }, 413);
  }

  let payload: unknown;
  try {
    payload = JSON.parse(body.text);
  } catch {
    return json({ error: "Request body is not valid JSON." }, 400);
  }

  const token = await webhookTokensService.authenticateChannelWebhook(
    webhookId,
    secret,
  );
  if (!token) return json({ error: "Invalid or revoked webhook." }, 401);

  const rate = checkRateLimit(token.id);
  if (!rate.allowed) {
    return json({ error: "Rate limit exceeded." }, 429, {
      "Retry-After": String(Math.ceil((rate.retryAfterMs ?? 0) / 1000)),
    });
  }

  const parsed = channelWebhookPayloadSchema.safeParse(payload);
  if (!parsed.success) {
    return json({ error: parsed.error.issues }, 400);
  }

  const rawIdempotencyKey = request.headers.get("idempotency-key");
  const parsedIdempotencyKey =
    rawIdempotencyKey === null
      ? null
      : idempotencyKeySchema.safeParse(rawIdempotencyKey);
  if (parsedIdempotencyKey && !parsedIdempotencyKey.success) {
    return json({ error: parsedIdempotencyKey.error.issues }, 400);
  }

  const result = await createChannelMessage(
    token,
    parsed.data,
    parsedIdempotencyKey ? parsedIdempotencyKey.data : null,
  );
  await touchToken(token.id);
  return json({ id: result.id }, result.replay ? 200 : 201);
}
