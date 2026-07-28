import { z } from "zod";
import * as servicesService from "@/lib/services/services";
import { defineTool, type McpToolDefinition } from "@/lib/mcp/tool";
import { McpResourceNotFoundError } from "@/lib/mcp/errors";

export const serviceTools: McpToolDefinition[] = [
  defineTool({
    name: "services_list",
    scope: "services:read",
    title: "List monitored services",
    description:
      "List the workspace's monitored services with their current status, labels and last 24 checks.",
    inputSchema: z.object({
      query: z
        .string()
        .optional()
        .describe("Filter by name, description, URL or host"),
      status: z
        .enum(["PENDING", "UP", "DOWN"])
        .optional()
        .describe("Only services currently in this status"),
    }),
    readOnly: true,
    handler: async (args, ctx) => {
      let items = await servicesService.listOverview(ctx.workspaceId);
      if (args.status) {
        items = items.filter(
          (service) => service.currentStatus === args.status,
        );
      }
      if (args.query) {
        const needle = args.query.toLowerCase();
        items = items.filter((service) =>
          [service.name, service.description, service.url, service.host]
            .filter((field): field is string => typeof field === "string")
            .some((field) => field.toLowerCase().includes(needle)),
        );
      }
      return items;
    },
  }),

  defineTool({
    name: "service_get",
    scope: "services:read",
    title: "Read a monitored service",
    description: "Read one monitored service with its monitor configuration.",
    inputSchema: z.object({ id: z.string() }),
    readOnly: true,
    handler: async (args, ctx) => {
      const service = await servicesService.get(args.id, ctx.workspaceId);
      if (!service) throw new McpResourceNotFoundError("Service", args.id);
      return service;
    },
  }),

  defineTool({
    name: "service_checks",
    scope: "services:read",
    title: "Read service check history",
    description:
      "Page through a service's check history — status, response time and error per check, newest first.",
    inputSchema: z.object({
      id: z.string(),
      pageSize: z.number().int().min(1).max(100).optional(),
      cursor: z.string().optional(),
    }),
    readOnly: true,
    handler: (args, ctx) =>
      servicesService.listChecks(args.id, ctx.workspaceId, {
        pageSize: args.pageSize,
        cursor: args.cursor,
      }),
  }),
];
