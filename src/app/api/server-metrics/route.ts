import { type NextRequest, NextResponse } from "next/server";
import { validateMetricsPayload } from "@/lib/validation/server-metrics";
import { checkRateLimit } from "@/lib/server-metrics/ratelimit";
import {
  authenticateAgentToken,
  processMetricsIngestion,
  type IngestionResult,
} from "@/lib/services/serverMetrics";

const MAX_BODY_BYTES = 16 * 1024;
const NO_STORE = { "Cache-Control": "no-store" } as const;

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

  const tokenContext = await authenticateAgentToken(secret);
  if (!tokenContext) {
    return metricsResponse(
      { error: "UNAUTHORIZED", message: "Invalid, expired, or revoked token" },
      401,
    );
  }

  const rateCheck = checkRateLimit(tokenContext.tokenId);
  if (!rateCheck.allowed) {
    const retryAfter = Math.max(
      1,
      Math.ceil((rateCheck.retryAfterMs ?? 1000) / 1000),
    );
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
        TOKEN_ALREADY_BOUND: 409,
        PROVIDER_INVENTORY_UNAVAILABLE: 503,
      };
      const status = statusMap[code] ?? 500;
      return metricsResponse({ error: code, message: error.message }, status);
    }
    throw error;
  }

  return metricsResponse(
    {
      code: result.code,
      tokenState: result.tokenState,
      localServerId: result.localServerId,
    },
    result.status,
  );
}
