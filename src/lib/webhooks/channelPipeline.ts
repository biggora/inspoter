import { NextResponse, type NextRequest } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { env } from "@/lib/config/env";
import { db } from "@/lib/db";
import * as webhookTokensService from "@/lib/services/webhookTokens";
import {
  channelWebhookPayloadSchema,
  idempotencyKeySchema,
  type ChannelWebhookPayload,
} from "@/lib/validation/webhookTokens";
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

async function readBodyLimited(
  request: NextRequest,
  maxBytes: number,
): Promise<{ ok: true; text: string } | { ok: false }> {
  const contentLength = request.headers.get("content-length");
  if (contentLength && Number(contentLength) > maxBytes) return { ok: false };

  const reader = request.body?.getReader();
  if (!reader) return { ok: true, text: "" };

  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      return { ok: false };
    }
    chunks.push(value);
  }
  return { ok: true, text: Buffer.concat(chunks).toString("utf8") };
}

async function createDelivery(
  token: {
    id: string;
    workspaceId: string;
    channelId: string;
    name: string;
  },
  payload: ChannelWebhookPayload,
  idempotencyKey: string | null,
): Promise<{ id: string; replay: boolean }> {
  const author = payload.author ?? token.name;
  if (!idempotencyKey) {
    const message = await db.message.create({
      data: {
        workspaceId: token.workspaceId,
        channelId: token.channelId,
        channelWorkspaceId: token.workspaceId,
        content: payload.content,
        author,
        origin: "WEBHOOK",
      },
      select: { id: true },
    });
    return { id: message.id, replay: false };
  }

  try {
    return await db.$transaction(async (tx) => {
      const existing = await tx.idempotencyKey.findUnique({
        where: { tokenId_key: { tokenId: token.id, key: idempotencyKey } },
        select: { targetId: true },
      });
      if (existing) return { id: existing.targetId, replay: true };

      const message = await tx.message.create({
        data: {
          workspaceId: token.workspaceId,
          channelId: token.channelId,
          channelWorkspaceId: token.workspaceId,
          content: payload.content,
          author,
          origin: "WEBHOOK",
        },
        select: { id: true },
      });
      await tx.idempotencyKey.create({
        data: {
          workspaceId: token.workspaceId,
          tokenId: token.id,
          tokenWorkspaceId: token.workspaceId,
          key: idempotencyKey,
          targetType: "channel-message",
          targetId: message.id,
        },
      });
      return { id: message.id, replay: false };
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const winner = await db.idempotencyKey.findUnique({
        where: { tokenId_key: { tokenId: token.id, key: idempotencyKey } },
        select: { targetId: true },
      });
      if (winner) return { id: winner.targetId, replay: true };
    }
    throw error;
  }
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

  const result = await createDelivery(
    token,
    parsed.data,
    parsedIdempotencyKey ? parsedIdempotencyKey.data : null,
  );
  await db.webhookToken
    .update({ where: { id: token.id }, data: { lastUsedAt: new Date() } })
    .catch(() => {});
  return json({ id: result.id }, result.replay ? 200 : 201);
}
