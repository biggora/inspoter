import { z } from "zod";
import { AlertCategorySource } from "@/generated/prisma/client";
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

  // The write half: an assistant asked to tidy up the backlog can search for
  // uncategorized alerts and file them. The assignment is recorded as MODEL,
  // never MANUAL, so the dashboard shows where it came from and an operator
  // can override it.
  defineTool({
    name: "alerts_set_category",
    scope: "alerts:write",
    title: "Set an alert's category",
    description:
      'Assign an alert to a category, or pass a null categoryId to clear it. Use alert_categories_list for valid ids; alerts_search with categoryId "none" finds the uncategorized ones. Recorded as a model-made assignment.',
    inputSchema: z.object({
      id: z.string(),
      categoryId: z
        .string()
        .nullable()
        .describe("Category id, or null to leave the alert uncategorized"),
      confidence: z
        .number()
        .min(0)
        .max(1)
        .optional()
        .describe("How sure you are, 0..1"),
    }),
    readOnly: false,
    handler: (args, ctx) =>
      alertsService.setCategory(
        args.id,
        ctx.workspaceId,
        args.categoryId,
        AlertCategorySource.MODEL,
        args.confidence,
      ),
  }),

  defineTool({
    name: "alert_category_create",
    scope: "alerts:write",
    title: "Create an alert category",
    description:
      "Get or create a workspace alert category by name. Names are matched case-insensitively, so calling this with an existing name returns that category instead of duplicating it.",
    inputSchema: z.object({ name: z.string().min(1) }),
    readOnly: false,
    handler: (args, ctx) =>
      alertsService.upsertCategoryByName(ctx.workspaceId, args.name),
  }),
];
