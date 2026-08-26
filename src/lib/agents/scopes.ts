import {
  MCP_SCOPES,
  hasScope,
  isMcpScope,
  parseScopes,
  type McpScope,
} from "@/lib/mcp/scopes";

// These permissions deliberately do not enter MCP_SCOPES. MCP scopes are
// bearer-token permissions and therefore define the public protocol surface;
// agent-only scopes only exist inside an AgentRun snapshot.
export const AGENT_ONLY_SCOPES = [
  "management:read",
  "management:write",
] as const;

const AGENT_ONLY_SCOPE_SET: ReadonlySet<string> = new Set(AGENT_ONLY_SCOPES);

export const AGENT_SCOPES = [...MCP_SCOPES, ...AGENT_ONLY_SCOPES] as const;

export type AgentOnlyScope = (typeof AGENT_ONLY_SCOPES)[number];
export type AgentScope = McpScope | AgentOnlyScope;

export function isAgentScope(value: string): value is AgentScope {
  return isMcpScope(value) || AGENT_ONLY_SCOPE_SET.has(value);
}

export function parseAgentScopes(values: readonly string[]): AgentScope[] {
  return values.filter(isAgentScope);
}

export function hasAgentScope(
  scopes: readonly AgentScope[],
  required: AgentScope,
): boolean {
  return isMcpScope(required)
    ? hasScope(scopes.filter(isMcpScope), required)
    : scopes.includes(required);
}

export function toMcpScopes(scopes: readonly AgentScope[]): McpScope[] {
  return parseScopes(scopes);
}
