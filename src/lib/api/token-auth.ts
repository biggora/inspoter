import { NextResponse } from "next/server";
import { authenticateApiToken, type McpTokenContext } from "@/lib/mcp/auth";
import { hasScope, type McpScope } from "@/lib/mcp/scopes";
import { checkRateLimit } from "@/lib/webhooks/ratelimit";
import { recordActivity } from "@/lib/services/activity";

// Bearer-token authorization for the /api/v1/** agent surface. Together with
// /api/mcp and the webhook ingest routes this is a session-cookie-free surface
// (NFR-SEC-001 exception): the token is the sole authority and it carries the
// workspace, so the X-Inspoter-Workspace header plays no part here.
//
// Fail-closed order mirrors src/app/api/mcp/route.ts: authenticate -> scope
// -> rate limit -> serve. Responses use the same `{ error: { code, message } }`
// envelope and plain `no-store` as the other token endpoints, rather than
// jsonResponse()'s `private, no-store` + Vary, which exists for the
// workspace-header browser routes.

const NO_STORE = { "Cache-Control": "no-store" } as const;

export function apiErrorResponse(
  status: number,
  code: string,
  message: string,
  headers: Record<string, string> = {},
): NextResponse {
  return NextResponse.json(
    { error: { code, message } },
    { status, headers: { ...NO_STORE, ...headers } },
  );
}

export function apiJsonResponse<T>(
  data: T,
  init: { status?: number; headers?: Record<string, string> } = {},
): NextResponse {
  return NextResponse.json(data, {
    status: init.status ?? 200,
    headers: { ...NO_STORE, ...(init.headers ?? {}) },
  });
}

// A foreign-workspace id is indistinguishable from a missing one, by design.
export function apiNotFound(resource: string): NextResponse {
  return apiErrorResponse(404, "NOT_FOUND", `${resource} not found.`);
}

// Returns the authenticated token context, or the response to send back.
// Callers do `if (auth instanceof NextResponse) return auth;`.
export async function requireApiToken(
  request: Request,
  scope: McpScope,
): Promise<McpTokenContext | NextResponse> {
  const token = await authenticateApiToken(request);
  if (!token) {
    return apiErrorResponse(
      401,
      "UNAUTHORIZED",
      "Missing, revoked, or insufficiently scoped API token",
      { "WWW-Authenticate": 'Bearer realm="inspoter-api"' },
    );
  }

  if (!hasScope(token.scopes, scope)) {
    return apiErrorResponse(
      403,
      "FORBIDDEN",
      `This token is missing the ${scope} scope`,
    );
  }

  const rate = checkRateLimit(token.tokenId);
  if (!rate.allowed) {
    return apiErrorResponse(
      429,
      "RATE_LIMITED",
      "Rate limit exceeded for this token",
      rate.retryAfterMs
        ? { "Retry-After": String(Math.ceil(rate.retryAfterMs / 1000)) }
        : {},
    );
  }

  return token;
}

// Journals what a token changed, so the Activity page shows agent-made edits
// next to operator-made ones. Activity.operatorId is a plain string with no
// foreign key to Operator, so the token's own id and name stand in for one.
export function recordTokenActivity(
  token: McpTokenContext,
  input: {
    action: string;
    entityType: string;
    entityId?: string;
    entityLabel?: string;
  },
): void {
  void recordActivity(token.workspaceId, {
    operatorId: token.tokenId,
    operatorName: token.tokenName,
    ...input,
  });
}

// Validation failures answer with the same envelope, carrying the zod issues
// so a caller can point at the offending field.
export function apiValidationError(issues: unknown): NextResponse {
  return NextResponse.json(
    {
      error: {
        code: "VALIDATION_FAILED",
        message: "Request body failed validation",
        issues,
      },
    },
    { status: 400, headers: NO_STORE },
  );
}
