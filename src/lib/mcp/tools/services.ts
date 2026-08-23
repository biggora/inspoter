import { z } from "zod";
import * as servicesService from "@/lib/services/services";
import * as serviceLabelsService from "@/lib/services/service-labels";
import { defineTool, type McpToolDefinition } from "@/lib/mcp/tool";
import { McpResourceNotFoundError } from "@/lib/mcp/errors";
import {
  createServiceLabelSchema,
  SERVICE_LABELS_PER_SERVICE_LIMIT,
  serviceCreateSchema,
  serviceUpdateSchema,
  updateServiceLabelSchema,
} from "@/lib/validation/services";
import { LABEL_PRESET_COLORS } from "@/lib/label-color";

// Which target fields a monitor needs depends on its type: HTTP wants a url,
// TCP a host and a port, PING a host. Zod expresses that as a discriminated
// union on create and a superRefine on update, and neither is the plain object
// MCP publishes as a tool's JSON Schema. So a tool declares one flat shape for
// the client to read and re-parses it with the shared schema in the handler —
// the conditional rules stay in @/lib/validation/services, and a violation
// comes back as a readable argument error (see toToolError).

const monitorFields = {
  description: z.string().nullish(),
  url: z.url().optional().describe("Required for HTTP monitors."),
  host: z.string().optional().describe("Required for TCP and PING monitors."),
  port: z
    .number()
    .int()
    .min(1)
    .max(65535)
    .optional()
    .describe("Required for TCP monitors, optional for PING."),
  expectedStatusCodes: z
    .string()
    .optional()
    .describe(
      "HTTP only. Codes or ranges such as 200-299 or 200,301-399. Defaults to 200-299.",
    ),
  intervalSeconds: z.number().int().min(10).max(86400).optional(),
  timeoutMs: z.number().int().min(1000).max(30000).optional(),
  retries: z.number().int().min(1).max(10).optional(),
  isActive: z
    .boolean()
    .optional()
    .describe("A paused service is never picked up by the check scheduler."),
  labelIds: z
    .array(z.string())
    .max(SERVICE_LABELS_PER_SERVICE_LIMIT)
    .optional()
    .describe("Replaces the whole label set. Omit it to leave labels alone."),
};

const monitorType = z.enum(["HTTP", "TCP", "PING"]);

const labelColor = z
  .string()
  .describe(
    `A preset name (${LABEL_PRESET_COLORS.join(", ")}) or a hex value such as #616367.`,
  );

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
      labelId: z
        .string()
        .optional()
        .describe("Only services carrying this label"),
    }),
    readOnly: true,
    handler: async (args, ctx) =>
      servicesService.filterOverview(
        await servicesService.listOverview(ctx.workspaceId),
        args,
      ),
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

  defineTool({
    name: "service_labels_list",
    scope: "services:read",
    title: "List service labels",
    description:
      "List the workspace's service labels with the number of services carrying each. Ids from here are the labelIds the service tools accept.",
    inputSchema: z.object({}),
    readOnly: true,
    handler: (_args, ctx) => serviceLabelsService.listLabels(ctx.workspaceId),
  }),

  defineTool({
    name: "service_create",
    scope: "services:write",
    title: "Create a monitored service",
    description:
      "Add a monitor to the workspace. HTTP needs `url`, TCP needs `host` and `port`, PING needs `host`. The first check runs immediately.",
    inputSchema: z.object({
      name: z.string().min(1),
      monitorType,
      ...monitorFields,
    }),
    readOnly: false,
    handler: (args, ctx) =>
      servicesService.create(ctx.workspaceId, serviceCreateSchema.parse(args)),
  }),

  defineTool({
    name: "service_update",
    scope: "services:write",
    title: "Update a monitored service",
    description:
      "Change a monitor. Omitted fields keep their current value; changing the target or the interval re-checks the service immediately.",
    inputSchema: z.object({
      id: z.string(),
      name: z.string().min(1).optional(),
      monitorType: monitorType.optional(),
      ...monitorFields,
    }),
    readOnly: false,
    handler: ({ id, ...input }, ctx) =>
      servicesService.update(
        id,
        ctx.workspaceId,
        serviceUpdateSchema.parse(input),
      ),
  }),

  defineTool({
    name: "service_set_active",
    scope: "services:write",
    title: "Pause or resume a monitored service",
    description:
      "Pause or resume the scheduled checks of one service without touching the rest of its configuration.",
    inputSchema: z.object({ id: z.string(), isActive: z.boolean() }),
    readOnly: false,
    handler: (args, ctx) =>
      servicesService.update(args.id, ctx.workspaceId, {
        isActive: args.isActive,
      }),
  }),

  defineTool({
    name: "service_check_now",
    scope: "services:write",
    title: "Check a service now",
    description:
      "Run one check outside the schedule and return the service with its fresh status. A paused service can be checked this way too.",
    inputSchema: z.object({ id: z.string() }),
    readOnly: false,
    handler: (args, ctx) => servicesService.checkNow(args.id, ctx.workspaceId),
  }),

  defineTool({
    name: "service_delete",
    scope: "services:write",
    title: "Delete a monitored service",
    description:
      "Delete one service. Its check history goes with it and this cannot be undone.",
    inputSchema: z.object({ id: z.string() }),
    readOnly: false,
    handler: async (args, ctx) => {
      const service = await servicesService.get(args.id, ctx.workspaceId);
      if (!service) throw new McpResourceNotFoundError("Service", args.id);
      await servicesService.remove(args.id, ctx.workspaceId);
      return { id: args.id, deleted: true };
    },
  }),

  defineTool({
    name: "service_labels_set",
    scope: "services:write",
    title: "Set a service's labels",
    description:
      "Replace the whole label set of one service. Pass an empty array to clear it.",
    inputSchema: z.object({
      id: z.string(),
      labelIds: z.array(z.string()).max(SERVICE_LABELS_PER_SERVICE_LIMIT),
    }),
    readOnly: false,
    handler: (args, ctx) =>
      servicesService.update(args.id, ctx.workspaceId, {
        labelIds: args.labelIds,
      }),
  }),

  // The label tools pass a null operator: a token has no operator behind it, so
  // its own workspace scope is the authority and the membership check is
  // skipped — the same contract the contacts tools already use.
  defineTool({
    name: "service_label_create",
    scope: "services:write",
    title: "Create a service label",
    description:
      "Create a workspace service label. Names are unique regardless of case.",
    inputSchema: z.object({ name: z.string().min(1), color: labelColor }),
    readOnly: false,
    handler: (args, ctx) =>
      serviceLabelsService.createLabel(
        ctx.workspaceId,
        null,
        createServiceLabelSchema.parse(args),
      ),
  }),

  defineTool({
    name: "service_label_update",
    scope: "services:write",
    title: "Update a service label",
    description: "Rename or recolor one service label.",
    inputSchema: z.object({
      id: z.string(),
      name: z.string().min(1).optional(),
      color: labelColor.optional(),
    }),
    readOnly: false,
    handler: ({ id, ...input }, ctx) =>
      serviceLabelsService.updateLabel(
        ctx.workspaceId,
        null,
        id,
        updateServiceLabelSchema.parse(input),
      ),
  }),

  defineTool({
    name: "service_label_delete",
    scope: "services:write",
    title: "Delete a service label",
    description:
      "Delete one service label. The services carrying it keep their other labels.",
    inputSchema: z.object({ id: z.string() }),
    readOnly: false,
    handler: async (args, ctx) => {
      await serviceLabelsService.deleteLabel(ctx.workspaceId, null, args.id);
      return { id: args.id, deleted: true };
    },
  }),
];
