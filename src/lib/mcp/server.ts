import { McpServer } from "@modelcontextprotocol/server";
import packageJson from "../../../package.json";
import { hasScope, type McpScope } from "@/lib/mcp/scopes";
import type { McpToolContext, McpToolDefinition } from "@/lib/mcp/tool";
import { mailTools } from "@/lib/mcp/tools/mail";
import { alertTools } from "@/lib/mcp/tools/alerts";
import { bookmarkTools } from "@/lib/mcp/tools/bookmarks";
import { kanbanTools } from "@/lib/mcp/tools/kanban";
import { messageTools } from "@/lib/mcp/tools/messages";
import { contactTools } from "@/lib/mcp/tools/contacts";
import { serverTools } from "@/lib/mcp/tools/servers";
import { serviceTools } from "@/lib/mcp/tools/services";
import { logTools } from "@/lib/mcp/tools/logs";
import { noteTools } from "@/lib/mcp/tools/notes";
import { activityTools } from "@/lib/mcp/tools/activity";
import { domainTools } from "@/lib/mcp/tools/domains";

// The MCP server is built per request from the presenting token's scopes, so
// `tools/list` only ever advertises what that token may actually call. A tool
// the token has no scope for is never registered — there is no runtime scope
// check inside a handler to forget.

export const MCP_SERVER_NAME = "inspoter";
export const MCP_SERVER_VERSION = packageJson.version;

export const ALL_TOOLS: readonly McpToolDefinition[] = [
  ...mailTools,
  ...alertTools,
  ...bookmarkTools,
  ...kanbanTools,
  ...messageTools,
  ...contactTools,
  ...serverTools,
  ...serviceTools,
  ...logTools,
  ...noteTools,
  ...activityTools,
  ...domainTools,
];

export function selectTools(scopes: readonly McpScope[]): McpToolDefinition[] {
  return ALL_TOOLS.filter((tool) => hasScope(scopes, tool.scope));
}

// The catalogue is static, so the lookup index is built once. Used by callers
// that resolve a tool by the name a model asked for rather than by scope.
const TOOLS_BY_NAME: ReadonlyMap<string, McpToolDefinition> = new Map(
  ALL_TOOLS.map((tool) => [tool.name, tool]),
);

export function findTool(name: string): McpToolDefinition | undefined {
  return TOOLS_BY_NAME.get(name);
}

export function buildMcpServer(ctx: McpToolContext): McpServer {
  const server = new McpServer(
    { name: MCP_SERVER_NAME, version: MCP_SERVER_VERSION },
    { capabilities: { tools: {} } },
  );
  for (const tool of selectTools(ctx.scopes)) {
    tool.register(server, ctx);
  }
  return server;
}
