import crypto from "node:crypto";
import { db } from "@/lib/db";
import { parseScopes, type McpScope } from "@/lib/mcp/scopes";

// MCP bearer authentication. Mirrors authenticateMetricsToken()
// (src/lib/services/serverMetrics.ts): sha256 of the presented secret against
// the stored hash, universal tokens only (channelId === null). The extra rule
// here is that the token must carry at least one MCP scope — a plain ingest
// token issued before MCP existed has none and is rejected outright.

export interface McpTokenContext {
  tokenId: string;
  // The operator-chosen token name, used to attribute what the token writes
  // (message author, Activity journal entry).
  tokenName: string;
  workspaceId: string;
  scopes: McpScope[];
}

export async function authenticateApiToken(
  request: Request,
): Promise<McpTokenContext | null> {
  const authHeader = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(authHeader);
  if (!match) return null;

  const tokenHash = crypto
    .createHash("sha256")
    .update(match[1].trim())
    .digest("hex");

  const token = await db.webhookToken.findUnique({ where: { tokenHash } });
  if (!token) return null;
  if (token.revokedAt) return null;
  if (token.channelId !== null) return null;

  const scopes = parseScopes(token.scopes);
  if (scopes.length === 0) return null;

  db.webhookToken
    .update({ where: { id: token.id }, data: { lastUsedAt: new Date() } })
    .catch(() => {});

  return {
    tokenId: token.id,
    tokenName: token.name,
    workspaceId: token.workspaceId,
    scopes,
  };
}
