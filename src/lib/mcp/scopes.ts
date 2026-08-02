// MCP permission scopes. Stored on WebhookToken.scopes; a token with an empty
// array is an ingest-only webhook token and cannot reach /api/mcp at all.
// Read and write are separate so an operator can hand an agent a token that
// can search mail but never send it.

export const MCP_SCOPES = [
  "mail:read",
  "mail:write",
  "alerts:read",
  "alerts:write",
  "bookmarks:read",
  "bookmarks:write",
  "messages:read",
  // Covers channel webhook management too: issuing a channel webhook hands the
  // caller a secret URL, which is the same class of irreversible action as
  // mail:write's send, so it stays inside the single write scope.
  "messages:write",
  "servers:read",
  "services:read",
  "logs:read",
] as const;

export type McpScope = (typeof MCP_SCOPES)[number];

const SCOPE_SET: ReadonlySet<string> = new Set(MCP_SCOPES);

export function isMcpScope(value: string): value is McpScope {
  return SCOPE_SET.has(value);
}

// Persisted scopes are plain strings (Prisma String[]), so unknown values from
// an older or newer deployment are dropped rather than trusted.
export function parseScopes(values: readonly string[]): McpScope[] {
  return values.filter(isMcpScope);
}

export function hasScope(
  granted: readonly McpScope[],
  required: McpScope,
): boolean {
  return granted.includes(required);
}
