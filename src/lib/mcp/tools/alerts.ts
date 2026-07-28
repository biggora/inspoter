import { z } from "zod";
import * as alertsService from "@/lib/services/alerts";
import { defineTool, type McpToolDefinition } from "@/lib/mcp/tool";
import { McpResourceNotFoundError } from "@/lib/mcp/errors";

export const alertTools: McpToolDefinition[] = [
  defineTool({
    name: "alerts_search",
    scope: "alerts:read",
    title: "Search alerts",
    description:
      "Search workspace alerts. `query` matches the alert message. Results are newest-first unless sort is overridden.",
    inputSchema: z.object({
      query: z.string().optional(),
      categoryId: z.string().optional(),
      severity: z.string().optional().describe("e.g. info, warning, critical"),
      sort: z.enum(["asc", "desc"]).optional(),
      pageSize: z.number().int().min(1).max(100).optional(),
      cursor: z.string().optional(),
    }),
    readOnly: true,
    handler: (args, ctx) => alertsService.list(ctx.workspaceId, args),
  }),

  defineTool({
    name: "alerts_get",
    scope: "alerts:read",
    title: "Read an alert",
    description: "Read one alert with its category.",
    inputSchema: z.object({ id: z.string() }),
    readOnly: true,
    handler: async (args, ctx) => {
      const alert = await alertsService.getById(args.id, ctx.workspaceId);
      if (!alert) throw new McpResourceNotFoundError("Alert", args.id);
      return alert;
    },
  }),

  defineTool({
    name: "alert_categories_list",
    scope: "alerts:read",
    title: "List alert categories",
    description:
      "List the workspace's alert categories, for use as alerts_search categoryId.",
    inputSchema: z.object({}),
    readOnly: true,
    handler: (_args, ctx) => alertsService.listCategories(ctx.workspaceId),
  }),
];
