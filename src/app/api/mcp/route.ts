import { NextResponse, type NextRequest } from "next/server";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { authenticateApiToken } from "@/lib/mcp/auth";
import { buildMcpServer } from "@/lib/mcp/server";
import { checkRateLimit } from "@/lib/webhooks/ratelimit";

// MCP Streamable HTTP endpoint. Together with the webhook ingest routes this
// is the only session-cookie-free surface (NFR-SEC-001 exception): the bearer
// API token is the sole authority, and it carries the workspace, so no
// X-Inspoter-Workspace header is involved.
//
// Fail-closed order mirrors src/lib/webhooks/pipeline.ts: auth -> rate limit
// -> serve. The MCP server instance is built per request because tools/list
// is filtered by the token's scopes.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Plain `no-store`, matching the other token-authenticated public endpoints
// (/api/server-metrics, /api/webhooks/**) rather than jsonResponse()'s
// `private, no-store`, which exists for the workspace-header browser routes.
const NO_STORE = { "Cache-Control": "no-store" } as const;

function errorResponse(
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

export async function POST(request: NextRequest): Promise<Response> {
  const token = await authenticateApiToken(request);
  if (!token) {
    return errorResponse(
      401,
      "UNAUTHORIZED",
      "Missing, revoked, or insufficiently scoped API token",
      { "WWW-Authenticate": 'Bearer realm="inspoter-mcp"' },
    );
  }

  const rate = checkRateLimit(token.tokenId);
  if (!rate.allowed) {
    return errorResponse(
      429,
      "RATE_LIMITED",
      "Rate limit exceeded for this token",
      rate.retryAfterMs
        ? { "Retry-After": String(Math.ceil(rate.retryAfterMs / 1000)) }
        : {},
    );
  }

  const handler = createMcpHandler(() =>
    buildMcpServer({
      workspaceId: token.workspaceId,
      scopes: token.scopes,
      tokenName: token.tokenName,
    }),
  );

  try {
    const response = await handler.fetch(request);
    // handler.fetch() builds its own Response, so the cache directive is
    // applied to the copy rather than through jsonResponse().
    const headers = new Headers(response.headers);
    headers.set("Cache-Control", NO_STORE["Cache-Control"]);
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  } finally {
    await handler.close().catch(() => {});
  }
}

// Stateless serving: GET (SSE stream) and DELETE (session teardown) are 2025
// session operations this endpoint does not implement.
function methodNotAllowed(): NextResponse {
  return errorResponse(405, "METHOD_NOT_ALLOWED", "Method not allowed.");
}

export const GET = methodNotAllowed;
export const DELETE = methodNotAllowed;
