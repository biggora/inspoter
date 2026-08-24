import { z } from "zod";

import { defineWebMcpTool, type WebMcpTool } from "@/lib/web-mcp/define-tool";
import { LABEL_PRESET_COLORS } from "@/lib/label-color";
import type {
  ListServiceChecksResult,
  ServiceDto,
  ServiceInput,
  ServiceLabelDto,
  ServiceLabelInput,
  ServiceLabelListItemDto,
  ServiceWithLabelsDto,
} from "./api";

// WebMCP tools for Services (Uptime Kuma-style monitors). Registered globally
// from the dashboard layout rather than from a Services page, so they carry no
// page state — every tool addresses its target by id, and each id parameter
// names the tool that produces it. Mirrors the backend catalog in
// src/lib/mcp/tools/services.ts tool-for-tool; the two registries are separate,
// so the shared names are not a collision.

export interface ServicesToolDeps {
  /** Bound servicesApi.list — returns the whole list, unfiltered. */
  list: () => Promise<ServiceWithLabelsDto[]>;
  /** Bound servicesApi.get. */
  get: (id: string) => Promise<ServiceWithLabelsDto>;
  /** Bound servicesApi.listChecks. */
  listChecks: (
    id: string,
    params?: { cursor?: string; pageSize?: number },
  ) => Promise<ListServiceChecksResult>;
  /** Bound servicesApi.create. */
  create: (input: ServiceInput) => Promise<ServiceWithLabelsDto>;
  /** Bound servicesApi.update — takes a whole ServiceInput, see mergeInput. */
  update: (id: string, input: ServiceInput) => Promise<ServiceWithLabelsDto>;
  /** Bound servicesApi.remove. */
  remove: (id: string) => Promise<void>;
  /** Bound servicesApi.checkNow. */
  checkNow: (id: string) => Promise<ServiceDto>;
  /** Bound servicesApi.setActive. */
  setActive: (id: string, isActive: boolean) => Promise<ServiceWithLabelsDto>;
  /** Bound serviceLabelsApi.list. */
  listLabels: () => Promise<ServiceLabelListItemDto[]>;
  /** Bound serviceLabelsApi.create. */
  createLabel: (input: ServiceLabelInput) => Promise<ServiceLabelDto>;
  /** Bound serviceLabelsApi.update. */
  updateLabel: (
    id: string,
    input: Partial<ServiceLabelInput>,
  ) => Promise<ServiceLabelDto>;
  /** Bound serviceLabelsApi.remove. */
  removeLabel: (id: string) => Promise<void>;
  /** Re-runs the list fetch so any visible services UI reflects the change. */
  refresh: () => void;
}

// --- compact projections ---
// Every list tool returns a few identifying fields per row rather than the
// DTO, so a full page of results stays inside the per-tool output budget.

const MAX_MESSAGE_LENGTH = 120;

function trimMessage(message: string | null): string | null {
  if (message === null) return null;
  return message.length > MAX_MESSAGE_LENGTH
    ? `${message.slice(0, MAX_MESSAGE_LENGTH)}…`
    : message;
}

/** The monitor's target, whichever field its type uses. */
function target(service: ServiceWithLabelsDto): string | null {
  if (service.monitorType === "HTTP") return service.url;
  if (service.host === null) return null;
  return service.port === null
    ? service.host
    : `${service.host}:${service.port}`;
}

function projectServiceRow(service: ServiceWithLabelsDto) {
  return {
    id: service.id,
    name: service.name,
    status: service.currentStatus,
    monitorType: service.monitorType,
    target: target(service),
    isActive: service.isActive,
    labels: service.labels.map((label) => label.name),
  };
}

function projectServiceDetail(service: ServiceWithLabelsDto) {
  return {
    id: service.id,
    name: service.name,
    description: service.description,
    monitorType: service.monitorType,
    url: service.url,
    host: service.host,
    port: service.port,
    expectedStatusCodes: service.expectedStatusCodes,
    intervalSeconds: service.intervalSeconds,
    timeoutMs: service.timeoutMs,
    retries: service.retries,
    isActive: service.isActive,
    status: service.currentStatus,
    consecutiveFailures: service.consecutiveFailures,
    lastCheckedAt: service.lastCheckedAt,
    lastResponseTimeMs: service.lastResponseTimeMs,
    lastMessage: trimMessage(service.lastMessage),
    labels: service.labels.map((label) => ({
      id: label.id,
      name: label.name,
    })),
  };
}

// --- the partial-update merge ---
// PATCH /api/services/[id] parses with serviceUpdateSchema, whose fields are
// all optional, so the route itself tolerates a partial body (setActive()
// relies on exactly that). The merge is still worth doing here for two
// reasons: servicesApi.update's TypeScript signature demands a whole
// ServiceInput, and serviceUpdateSchema's superRefine requires the
// type-specific target fields whenever `monitorType` appears in the payload —
// so a bare `{ monitorType: "HTTP" }` would 400 without the existing url
// alongside it. Reading the service first and layering the caller's changes
// on top keeps omitted fields at their current values in both cases.

function toServiceInput(service: ServiceWithLabelsDto): ServiceInput {
  return {
    name: service.name,
    description: service.description,
    monitorType: service.monitorType,
    url: service.url ?? undefined,
    host: service.host ?? undefined,
    port: service.port ?? undefined,
    expectedStatusCodes: service.expectedStatusCodes ?? undefined,
    intervalSeconds: service.intervalSeconds,
    timeoutMs: service.timeoutMs,
    retries: service.retries,
    isActive: service.isActive,
    labelIds: service.labels.map((label) => label.id),
  };
}

// Zod omits absent optional keys from its output, so spreading `changes` only
// overwrites what the caller actually sent.
function mergeInput(
  service: ServiceWithLabelsDto,
  changes: Partial<ServiceInput>,
): ServiceInput {
  return { ...toServiceInput(service), ...changes };
}

// --- shared field schemas ---

const idField = (source: string) =>
  z.string().min(1).describe(`Service id from ${source}`);

const labelIdsField = z
  .array(z.string().min(1))
  .max(20)
  .describe("Label ids from service_labels_list. Replaces the whole set.");

const monitorTypeField = z
  .enum(["HTTP", "TCP", "PING"])
  .describe("HTTP needs url, TCP needs host and port, PING needs host.");

const monitorFields = {
  description: z.string().min(1).nullish().describe("Free-text note"),
  url: z.url().optional().describe("Target URL. Required for HTTP monitors."),
  host: z
    .string()
    .min(1)
    .optional()
    .describe("Hostname or IP. Required for TCP and PING monitors."),
  port: z
    .number()
    .int()
    .min(1)
    .max(65535)
    .optional()
    .describe("Required for TCP monitors, optional for PING."),
  expectedStatusCodes: z
    .string()
    .min(1)
    .optional()
    .describe("HTTP only. Codes or ranges, e.g. 200-299 or 200,301-399."),
  intervalSeconds: z
    .number()
    .int()
    .min(10)
    .max(86400)
    .describe("Seconds between scheduled checks")
    .optional(),
  timeoutMs: z
    .number()
    .int()
    .min(1000)
    .max(30000)
    .describe("Per-check timeout in milliseconds")
    .optional(),
  retries: z
    .number()
    .int()
    .min(1)
    .max(10)
    .describe("Failures in a row before the service is marked DOWN")
    .optional(),
  isActive: z
    .boolean()
    .optional()
    .describe("A paused service is never picked up by the check scheduler."),
  labelIds: labelIdsField.optional(),
};

const labelColorField = z
  .enum(LABEL_PRESET_COLORS)
  .describe(`One of the preset colors: ${LABEL_PRESET_COLORS.join(", ")}.`);

const labelNameField = z
  .string()
  .trim()
  .min(1)
  .max(40)
  .describe("Label name. Unique in the workspace regardless of case.");

// --- the tools ---

export function createServicesTools(deps: ServicesToolDeps): WebMcpTool[] {
  return [
    defineWebMcpTool({
      name: "services_list",
      title: "List monitored services",
      description:
        "Lists the workspace's monitored services with their current status, monitor type, target and labels. The optional query is matched in the browser against name, description, URL and host. Returns one compact row per service, not the full monitor configuration — use service_get for that.",
      inputSchema: z
        .object({
          query: z
            .string()
            .min(1)
            .max(200)
            .optional()
            .describe("Filter by name, description, URL or host"),
          status: z
            .enum(["PENDING", "UP", "DOWN"])
            .optional()
            .describe("Only services currently in this status"),
          limit: z
            .number()
            .int()
            .min(1)
            .max(50)
            .default(15)
            .describe("Maximum number of services to return"),
        })
        .strict(),
      readOnly: true,
      async handler({ query, status, limit }) {
        const services = await deps.list();
        const needle = query?.toLowerCase();

        const matched = services.filter((service) => {
          if (status && service.currentStatus !== status) return false;
          if (!needle) return true;
          const haystack = [
            service.name,
            service.description ?? "",
            service.url ?? "",
            service.host ?? "",
          ]
            .join(" ")
            .toLowerCase();
          return haystack.includes(needle);
        });

        return {
          total: services.length,
          matched: matched.length,
          services: matched.slice(0, limit).map(projectServiceRow),
        };
      },
    }),

    defineWebMcpTool({
      name: "service_get",
      title: "Read a monitored service",
      description:
        "Reads one monitored service by id, with its full monitor configuration, current status and the message from its last check.",
      inputSchema: z.object({ id: idField("services_list") }).strict(),
      readOnly: true,
      // lastMessage is the error string the monitored third-party endpoint
      // produced, not operator-authored text.
      untrustedOutput: true,
      async handler({ id }) {
        return projectServiceDetail(await deps.get(id));
      },
    }),

    defineWebMcpTool({
      name: "service_checks",
      title: "Read service check history",
      description:
        "Pages through one service's check history, newest first — status, response time and error message per check. Pass the returned nextCursor back as `cursor` for the next page.",
      inputSchema: z
        .object({
          id: idField("services_list"),
          pageSize: z
            .number()
            .int()
            .min(1)
            .max(50)
            .default(10)
            .describe("Checks per page"),
          cursor: z
            .string()
            .min(1)
            .optional()
            .describe("nextCursor from a previous service_checks call"),
        })
        .strict(),
      readOnly: true,
      // Check messages are verbatim errors from the monitored endpoint.
      untrustedOutput: true,
      async handler({ id, pageSize, cursor }) {
        const result = await deps.listChecks(id, { pageSize, cursor });
        return {
          nextCursor: result.nextCursor,
          checks: result.items.map((check) => ({
            status: check.status,
            responseTimeMs: check.responseTimeMs,
            message: trimMessage(check.message),
            checkedAt: check.checkedAt,
          })),
        };
      },
    }),

    defineWebMcpTool({
      name: "service_labels_list",
      title: "List service labels",
      description:
        "Lists the workspace's service labels with the number of services carrying each. The ids returned here are the labelIds the other service tools accept.",
      inputSchema: z.object({}).strict(),
      readOnly: true,
      async handler() {
        const labels = await deps.listLabels();
        return {
          labels: labels.map((label) => ({
            id: label.id,
            name: label.name,
            color: label.color,
            serviceCount: label.serviceCount,
          })),
        };
      },
    }),

    defineWebMcpTool({
      name: "service_create",
      title: "Create a monitored service",
      description:
        "Adds a monitor to the workspace. HTTP needs `url`, TCP needs `host` and `port`, PING needs `host`. The first check runs immediately.",
      inputSchema: z
        .object({
          name: z.string().trim().min(1).max(200).describe("Service name"),
          monitorType: monitorTypeField,
          ...monitorFields,
        })
        .strict(),
      readOnly: false,
      async handler({ name, monitorType, ...rest }) {
        const created = await deps.create({ name, monitorType, ...rest });
        deps.refresh();
        return projectServiceRow(created);
      },
    }),

    defineWebMcpTool({
      name: "service_update",
      title: "Update a monitored service",
      description:
        "Changes a monitor. Omitted fields keep their current value — the service is read first and only the fields you pass are overwritten. Changing monitorType requires that type's target fields in the same call.",
      inputSchema: z
        .object({
          id: idField("services_list"),
          name: z
            .string()
            .trim()
            .min(1)
            .max(200)
            .optional()
            .describe("Service name"),
          monitorType: monitorTypeField.optional(),
          ...monitorFields,
        })
        .strict(),
      readOnly: false,
      async handler({ id, ...changes }) {
        const existing = await deps.get(id);
        const updated = await deps.update(id, mergeInput(existing, changes));
        deps.refresh();
        return projectServiceRow(updated);
      },
    }),

    defineWebMcpTool({
      name: "service_set_active",
      title: "Pause or resume a service",
      description:
        "Pauses or resumes the scheduled checks of one service without touching the rest of its configuration.",
      inputSchema: z
        .object({
          id: idField("services_list"),
          isActive: z
            .boolean()
            .describe("true resumes the schedule, false pauses it"),
        })
        .strict(),
      readOnly: false,
      async handler({ id, isActive }) {
        const updated = await deps.setActive(id, isActive);
        deps.refresh();
        return projectServiceRow(updated);
      },
    }),

    defineWebMcpTool({
      name: "service_check_now",
      title: "Check a service now",
      description:
        "Runs one check outside the schedule and returns the service with its fresh status. A paused service can be checked this way too.",
      inputSchema: z.object({ id: idField("services_list") }).strict(),
      readOnly: false,
      // The returned lastMessage is the endpoint's own error text.
      untrustedOutput: true,
      async handler({ id }) {
        const service = await deps.checkNow(id);
        deps.refresh();
        return {
          id: service.id,
          name: service.name,
          status: service.currentStatus,
          lastResponseTimeMs: service.lastResponseTimeMs,
          lastMessage: trimMessage(service.lastMessage),
          lastCheckedAt: service.lastCheckedAt,
        };
      },
    }),

    defineWebMcpTool({
      name: "service_delete",
      title: "Delete a monitored service",
      description:
        "Deletes one service. Its check history goes with it and this cannot be undone.",
      inputSchema: z.object({ id: idField("services_list") }).strict(),
      readOnly: false,
      async handler({ id }) {
        await deps.remove(id);
        deps.refresh();
        return { id, deleted: true };
      },
    }),

    defineWebMcpTool({
      name: "service_labels_set",
      title: "Set a service's labels",
      description:
        "Replaces the whole label set of one service. Pass an empty array to clear it. Other monitor settings are left untouched.",
      inputSchema: z
        .object({ id: idField("services_list"), labelIds: labelIdsField })
        .strict(),
      readOnly: false,
      async handler({ id, labelIds }) {
        const existing = await deps.get(id);
        const updated = await deps.update(
          id,
          mergeInput(existing, { labelIds }),
        );
        deps.refresh();
        return projectServiceRow(updated);
      },
    }),

    defineWebMcpTool({
      name: "service_label_create",
      title: "Create a service label",
      description:
        "Creates a workspace service label. Names are unique regardless of case.",
      inputSchema: z
        .object({ name: labelNameField, color: labelColorField })
        .strict(),
      readOnly: false,
      async handler({ name, color }) {
        const label = await deps.createLabel({ name, color });
        deps.refresh();
        return { id: label.id, name: label.name, color: label.color };
      },
    }),

    defineWebMcpTool({
      name: "service_label_update",
      title: "Update a service label",
      description:
        "Renames or recolors one service label. Pass at least one of name or color.",
      inputSchema: z
        .object({
          id: z.string().min(1).describe("Label id from service_labels_list"),
          name: labelNameField.optional(),
          color: labelColorField.optional(),
        })
        .strict()
        .refine(
          (input) => input.name !== undefined || input.color !== undefined,
          { error: "Pass at least one of name or color." },
        ),
      readOnly: false,
      async handler({ id, name, color }) {
        const label = await deps.updateLabel(id, { name, color });
        deps.refresh();
        return { id: label.id, name: label.name, color: label.color };
      },
    }),

    defineWebMcpTool({
      name: "service_label_delete",
      title: "Delete a service label",
      description:
        "Deletes one service label. The services carrying it keep their other labels.",
      inputSchema: z
        .object({
          id: z.string().min(1).describe("Label id from service_labels_list"),
        })
        .strict(),
      readOnly: false,
      async handler({ id }) {
        await deps.removeLabel(id);
        deps.refresh();
        return { id, deleted: true };
      },
    }),
  ];
}
