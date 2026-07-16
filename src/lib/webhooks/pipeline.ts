import crypto from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { env } from "@/lib/config/env";
import { getWebhookSchema } from "@/lib/validation/webhooks";
import { checkRateLimit } from "@/lib/webhooks/ratelimit";
import {
  checkIdempotency,
  recordIdempotency,
} from "@/lib/webhooks/idempotency";
import {
  dispatch,
  UnsupportedWebhookTypeError,
  ChannelNotFoundWebhookError,
} from "@/lib/webhooks/dispatch";

// Ordered webhook ingest pipeline (architecture.md §3.2, fail-closed):
// size -> parse -> auth -> ratelimit -> type -> zod -> idempotency -> dispatch.
// The only unauthenticated-by-session route (NFR-SEC-001 exception).

type WebhookErrorCode =
  | "UNAUTHORIZED"
  | "RATE_LIMITED"
  | "UNSUPPORTED_TYPE"
  | "VALIDATION_FAILED"
  | "PAYLOAD_TOO_LARGE"
  | "UNPARSEABLE";

interface WebhookErrorDetail {
  path: string;
  issue: string;
}

function errorResponse(
  status: number,
  code: WebhookErrorCode,
  message: string,
  details?: WebhookErrorDetail[],
): NextResponse {
  return NextResponse.json(
    { error: { code, message, ...(details ? { details } : {}) } },
    { status },
  );
}

// Reads the request body while enforcing WEBHOOK_MAX_BODY_BYTES, checking
// Content-Length up front and also capping the actual stream read so a
// lying/absent header can't bypass the limit (architecture.md §3.6).
async function readBodyLimited(
  request: NextRequest,
  maxBytes: number,
): Promise<{ ok: true; text: string } | { ok: false }> {
  const contentLength = request.headers.get("content-length");
  if (contentLength && Number(contentLength) > maxBytes) {
    return { ok: false };
  }

  const reader = request.body?.getReader();
  if (!reader) return { ok: true, text: "" };

  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => {});
        return { ok: false };
      }
      chunks.push(value);
    }
  }

  return { ok: true, text: Buffer.concat(chunks).toString("utf-8") };
}

export async function processWebhook(
  request: NextRequest,
  type: string,
): Promise<NextResponse> {
  // 1. Body size check
  const bodyResult = await readBodyLimited(request, env.WEBHOOK_MAX_BODY_BYTES);
  if (!bodyResult.ok) {
    return errorResponse(
      413,
      "PAYLOAD_TOO_LARGE",
      "Request body exceeds the maximum allowed size",
    );
  }

  // 2. Parse JSON
  let payload: unknown;
  try {
    payload = JSON.parse(bodyResult.text);
  } catch {
    return errorResponse(400, "UNPARSEABLE", "Request body is not valid JSON");
  }

  // 3. Bearer token auth
  const authHeader = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(authHeader);
  if (!match) {
    return errorResponse(
      401,
      "UNAUTHORIZED",
      "Missing or malformed Authorization header",
    );
  }
  const tokenHash = crypto.createHash("sha256").update(match[1]).digest("hex");
  const token = await db.webhookToken.findUnique({ where: { tokenHash } });
  if (!token || token.revokedAt) {
    return errorResponse(401, "UNAUTHORIZED", "Invalid or revoked token");
  }
  db.webhookToken
    .update({ where: { id: token.id }, data: { lastUsedAt: new Date() } })
    .catch(() => {});

  // 4. Rate limit
  const rate = checkRateLimit(token.id);
  if (!rate.allowed) {
    const res = errorResponse(
      429,
      "RATE_LIMITED",
      "Rate limit exceeded for this token",
    );
    if (rate.retryAfterMs) {
      res.headers.set(
        "Retry-After",
        String(Math.ceil(rate.retryAfterMs / 1000)),
      );
    }
    return res;
  }

  // 5. Type validation
  const schema = getWebhookSchema(type);
  if (!schema) {
    return errorResponse(
      400,
      "UNSUPPORTED_TYPE",
      `Unsupported webhook type: ${type}`,
    );
  }

  // 6. Zod schema validation
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    const details = parsed.error.issues.map((issue) => ({
      path: issue.path.join(".") || "(root)",
      issue: issue.message,
    }));
    return errorResponse(
      400,
      "VALIDATION_FAILED",
      "Payload failed validation",
      details,
    );
  }

  // 7. Idempotency check
  const idempotencyKey = request.headers.get("idempotency-key");
  if (idempotencyKey) {
    const existing = await checkIdempotency(token.id, idempotencyKey);
    if (existing.duplicate) {
      return NextResponse.json({ id: existing.targetId }, { status: 200 });
    }
  }

  // 8. Dispatch to service
  let result: { id: string };
  try {
    result = await dispatch(type, parsed.data, token.workspaceId);
  } catch (error) {
    if (error instanceof UnsupportedWebhookTypeError) {
      return errorResponse(400, "UNSUPPORTED_TYPE", error.message);
    }
    if (error instanceof ChannelNotFoundWebhookError) {
      return errorResponse(400, "VALIDATION_FAILED", error.message);
    }
    throw error;
  }

  if (idempotencyKey) {
    // Race-safe by DB constraint (@@unique([tokenId, key])): if a concurrent
    // request with the same key already recorded first, this insert fails
    // and we simply leave it unrecorded — the entry created above still
    // stands, matching AC-WH-010's at-least-once fallback under races.
    await recordIdempotency(
      token.id,
      token.workspaceId,
      idempotencyKey,
      type,
      result.id,
    ).catch(() => {});
  }

  return NextResponse.json({ id: result.id }, { status: 201 });
}
