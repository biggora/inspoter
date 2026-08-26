import type { AgentScope } from "@/lib/agents/scopes";

export function findMissingHistoricalScopes(
  historicalScopes: readonly AgentScope[],
  nextScopes: readonly AgentScope[],
): AgentScope[] {
  const available = new Set(nextScopes);
  return historicalScopes.filter((scope) => !available.has(scope));
}
