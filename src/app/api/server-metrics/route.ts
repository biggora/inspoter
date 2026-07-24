import { type NextRequest, NextResponse } from "next/server";
import { validateMetricsPayload } from "@/lib/validation/server-metrics";
import { checkRateLimit } from "@/lib/server-metrics/ratelimit";
import { env } from "@/lib/config/env";
import {
  authenticateMetricsToken,
  processMetricsIngestion,
  type IngestionResult,
} from "@/lib/services/serverMetrics";

const MAX_BODY_BYTES = 16 * 1024;
const NO_STORE = { "Cache-Control": "no-store" } as const;
// Per-token ceiling on top of the per-token+IP window: bounds how much a
// single token can be hammered from many spoofed x-forwarded-for values,
// while staying generous enough for a token shared across many real
// servers (each gets its own per-IP window under this ceiling).
const TOKEN_CEILING_MULTIPLIER = 25;

function metricsResponse(
  body: Record<string, unknown>,
  status: number,
): NextResponse {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

export async function POST(request: NextRequest) {
  const contentLength = request.headers.get("content-length");
  if (contentLength && parseInt(contentLength, 10) > MAX_BODY_BYTES) {
    return metricsResponse(
      { error: "PAYLOAD_TOO_LARGE", message: "Body exceeds 16 KiB" },
      413,
    );
  }

  const bearer = request.headers.get("authorization");
  if (!bearer?.startsWith("Bearer ")) {
    return metricsResponse(
      { error: "UNAUTHORIZED", message: "Missing bearer token" },
      401,
    );
  }
  const secret = bearer.slice(7);

  const tokenContext = await authenticateMetricsToken(secret);
  if (!tokenContext) {
    return metricsResponse(
      { error: "UNAUTHORIZED", message: "Invalid, expired, or revoked token" },
      401,
    );
  }

  const forwardedFor = request.headers.get("x-forwarded-for");
  const clientIp = forwardedFor?.split(",")[0]?.trim() || "direct";
  const perIpCheck = checkRateLimit(`${tokenContext.tokenId}:${clientIp}`);
  const perTokenCheck = checkRateLimit(tokenContext.tokenId, {
    limit: env.SERVER_METRICS_RATE_LIMIT * TOKEN_CEILING_MULTIPLIER,
  });
  if (!perIpCheck.allowed || !perTokenCheck.allowed) {
    const retryAfterMs =
      Math.max(perIpCheck.retryAfterMs ?? 0, perTokenCheck.retryAfterMs ?? 0) ||
      1000;
    const retryAfter = Math.max(1, Math.ceil(retryAfterMs / 1000));
    const resp = metricsResponse(
      { error: "RATE_LIMITED", message: "Token submission limit exceeded" },
      429,
    );
    resp.headers.set("Retry-After", String(retryAfter));
    return resp;
  }

  let rawBody: unknown;
  try {
    const text = await request.text();
    if (text.length > MAX_BODY_BYTES) {
      return metricsResponse(
        { error: "PAYLOAD_TOO_LARGE", message: "Body exceeds 16 KiB" },
        413,
      );
    }
    rawBody = JSON.parse(text);
  } catch {
    return metricsResponse(
      { error: "INVALID_PAYLOAD", message: "Invalid JSON" },
      400,
    );
  }

  const validation = validateMetricsPayload(rawBody);
  if (!validation.success) {
    const status =
      validation.error.code === "UNSUPPORTED_SCHEMA_VERSION"
        ? 422
        : validation.error.code === "CLOCK_SKEW_FUTURE"
          ? 422
          : 400;
    return metricsResponse(
      { error: validation.error.code, message: validation.error.message },
      status,
    );
  }

  let result: IngestionResult;
  try {
    result = await processMetricsIngestion(tokenContext, validation.data);
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      typeof (error as { code: unknown }).code === "string"
    ) {
      const code = (error as { code: string }).code;
      const statusMap: Record<string, number> = {
        UNAUTHORIZED: 401,
        SERVER_MATCH_AMBIGUOUS: 409,
        ADDRESS_CONFLICT: 409,
        PROVIDER_INVENTORY_UNAVAILABLE: 503,
      };
      const status = statusMap[code] ?? 500;
      return metricsResponse({ error: code, message: error.message }, status);
    }
    throw error;
  }

  return metricsResponse(
    { code: result.code, localServerId: result.localServerId },
    result.status,
  );
}
