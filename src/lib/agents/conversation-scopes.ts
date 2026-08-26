import type { McpScope } from "@/lib/mcp/scopes";

export function findMissingHistoricalScopes(
  historicalScopes: readonly McpScope[],
  nextScopes: readonly McpScope[],
): McpScope[] {
  const available = new Set(nextScopes);
  return historicalScopes.filter((scope) => !available.has(scope));
}
