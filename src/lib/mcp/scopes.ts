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
  "contacts:read",
  // Covers importing a vCard, which can create many contacts at once — the
  // same class of action as creating them one by one, so it stays inside the
  // single write scope.
  "contacts:write",
  "servers:read",
  "services:read",
  // Covers running a check on demand and deleting a service. A deleted service
  // takes its check history with it, but the monitor itself is a handful of
  // settings the operator can retype — nothing irreplaceable is lost the way it
  // is with a mail account or a message channel — so it stays inside the single
  // write scope.
  "services:write",
  "logs:read",
  // Read-only journal: it is written by the services that perform the actions,
  // never by a caller, so there is no write half to grant.
  "activity:read",
  "notes:read",
  // Covers creating, editing and deleting a single note. Deleting a folder is
  // absent for the same reason a board delete is: it takes content the caller
  // never saw.
  "notes:write",
  // Read-only on purpose. A DNS change reaches the public internet through a
  // provider credential — the same class of blast radius as a server power
  // action, which likewise has no write counterpart.
  "domains:read",
  "kanban:read",
  // Covers creating and moving cards. Moving a card into a terminal column
  // emits the completed webhook, so an agent with this scope can trigger
  // outbound notifications — the same class of side effect mail:write has.
  "kanban:write",
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
