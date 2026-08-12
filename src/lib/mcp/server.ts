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
];

export function selectTools(scopes: readonly McpScope[]): McpToolDefinition[] {
  return ALL_TOOLS.filter((tool) => hasScope(scopes, tool.scope));
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
