import { z } from "zod";
import * as logsService from "@/lib/services/logs";
import { defineTool, type McpToolDefinition } from "@/lib/mcp/tool";

export const logTools: McpToolDefinition[] = [
  defineTool({
    name: "logs_search",
    scope: "logs:read",
    title: "Search logs",
    description:
      "Search the workspace's log entries. `query` matches the message. Results are newest-first unless sort is overridden.",
    inputSchema: z.object({
      query: z.string().optional(),
      level: z.string().optional().describe("e.g. debug, info, warn, error"),
      source: z.string().optional(),
      sort: z.enum(["asc", "desc"]).optional(),
      pageSize: z.number().int().min(1).max(100).optional(),
      cursor: z.string().optional(),
    }),
    readOnly: true,
    handler: (args, ctx) => logsService.list(ctx.workspaceId, args),
  }),
];
