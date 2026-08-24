import { z } from "zod";

import { defineWebMcpTool, type WebMcpTool } from "@/lib/web-mcp/define-tool";
import type {
  ComposedServersResponse,
  ServerDto,
  ServerMetricsDto,
} from "./api";
import { getAvailableActions } from "./server-power-actions";
import type { PowerActionType } from "./use-server-power-action";

// WebMCP tools for Servers. All of them are registered from the dashboard
// layout rather than from a server's page, so they take a localServerId and
// stay discoverable on every route. Mirrors the backend catalog in
// src/lib/mcp/tools/servers.ts.

export interface ServersToolDeps {
  /** Bound fetchServers — returns the whole cached inventory, unfiltered. */
  fetchServers: () => Promise<ComposedServersResponse>;
  /** Bound getServerByLocalId. */
  getServerByLocalId: (localServerId: string) => Promise<ServerDto>;
  /** Bound refreshServers — POSTs a live fan-out to every provider. */
  refreshServers: () => Promise<ComposedServersResponse>;
  /** Bound powerAction — POSTs start/stop/restart to the owning provider. */
  powerAction: (
    providerId: string,
    id: string,
    action: PowerActionType,
  ) => Promise<unknown>;
  /** Re-runs the list fetch so any visible servers UI reflects the refresh. */
  refresh: () => void;
}

// Same field set and in-process `.includes()` matching as
// src/lib/mcp/tools/servers.ts — GET /api/servers has no query parameter, so
// the filtering has to happen here on the fetched list.
function haystack(server: ServerDto): string {
  const fields =
    server.origin === "provider"
      ? [server.name, server.ip, server.os, server.location, server.type]
      : [server.name, server.hostname ?? ""];
  return fields.join(" ").toLowerCase();
}

// Byte counts arrive as decimal strings (they are BigInt columns), so they are
// summarized into whole percentages rather than passed through.
function usedPercent(
  totalBytes: string | null,
  availableBytes: string | null,
): number | null {
  if (totalBytes === null || availableBytes === null) return null;
  const total = Number(totalBytes);
  const available = Number(availableBytes);
  if (!Number.isFinite(total) || !Number.isFinite(available) || total <= 0) {
    return null;
  }
  return Math.round(((total - available) / total) * 100);
}

function round(value: number | null): number | null {
  return value === null ? null : Math.round(value);
}

function summarizeMetrics(metrics: ServerMetricsDto) {
  return {
    state: metrics.state,
    receivedAt: metrics.receivedAt,
    cpuPercent: round(metrics.cpuUsagePercent),
    memoryPercent: usedPercent(
      metrics.memoryTotalBytes,
      metrics.memoryAvailableBytes,
    ),
    diskPercent: usedPercent(
      metrics.filesystemTotalBytes,
      metrics.filesystemAvailableBytes,
    ),
  };
}

function projectServerRow(server: ServerDto) {
  const base = {
    localServerId: server.localServerId,
    name: server.name,
    origin: server.origin,
    metrics: summarizeMetrics(server.metrics),
  };
  return server.origin === "provider"
    ? {
        ...base,
        status: server.status,
        ip: server.ip,
        location: server.location,
      }
    : { ...base, hostname: server.hostname };
}

function projectServerDetail(server: ServerDto) {
  const base = {
    localServerId: server.localServerId,
    name: server.name,
    origin: server.origin,
    powerActionsAvailable: server.powerActionsAvailable,
    metrics: {
      ...summarizeMetrics(server.metrics),
      load1: server.metrics.load1,
      load5: server.metrics.load5,
      load15: server.metrics.load15,
      swapPercent: usedPercent(
        server.metrics.swapTotalBytes,
        server.metrics.swapFreeBytes,
      ),
      uptimeSeconds: server.metrics.uptimeSeconds,
    },
  };
  return server.origin === "provider"
    ? {
        ...base,
        status: server.status,
        type: server.type,
        ip: server.ip,
        os: server.os,
        location: server.location,
        cpu: server.cpu,
        ram: server.ram,
        disk: server.disk,
        providerId: server.providerId,
        providerAvailability: server.providerAvailability,
      }
    : { ...base, hostname: server.hostname };
}

const localServerIdField = z
  .string()
  .min(1)
  .describe("Server localServerId from servers_list");

export function createServersTools(deps: ServersToolDeps): WebMcpTool[] {
  return [
    defineWebMcpTool({
      name: "servers_list",
      title: "List servers",
      description:
        "Lists the workspace's servers with a summary of their latest metrics (cpu, memory and disk percentages). The optional query is matched in the browser against name, hostname, IP, OS, location and type. `metrics.state` is not_configured when no agent reports, stale when the last reading is over three minutes old.",
      inputSchema: z
        .object({
          query: z
            .string()
            .min(1)
            .max(200)
            .optional()
            .describe("Filter by name, hostname, IP, OS, location or type"),
          limit: z
            .number()
            .int()
            .min(1)
            .max(50)
            .default(10)
            .describe("Maximum number of servers to return"),
        })
        .strict(),
      readOnly: true,
      // OS strings, locations and provider error text come from the providers
      // and the reporting agents, not from the operator.
      untrustedOutput: true,
      async handler({ query, limit }) {
        const response = await deps.fetchServers();
        const needle = query?.toLowerCase();
        const matched = needle
          ? response.servers.filter((server) =>
              haystack(server).includes(needle),
            )
          : response.servers;

        return {
          total: response.servers.length,
          matched: matched.length,
          servers: matched.slice(0, limit).map(projectServerRow),
          providerErrors: response.providerErrors.map((entry) => ({
            providerId: entry.providerId,
            error: entry.error,
          })),
        };
      },
    }),

    defineWebMcpTool({
      name: "server_get",
      title: "Read a server",
      description:
        "Reads one server by localServerId, with its hardware summary and latest metrics — cpu, memory, swap and disk percentages plus load averages and uptime. Returns the metrics summary, not the raw sample history.",
      inputSchema: z.object({ localServerId: localServerIdField }).strict(),
      readOnly: true,
      // OS/type/location strings originate with the provider or the agent.
      untrustedOutput: true,
      async handler({ localServerId }) {
        return projectServerDetail(
          await deps.getServerByLocalId(localServerId),
        );
      },
    }),

    defineWebMcpTool({
      name: "servers_refresh",
      title: "Refresh the server inventory",
      description:
        "Re-reads the inventory live from every configured provider instead of the cached snapshot, then returns how many servers came back and any per-provider errors. Expensive: it calls each provider's API and counts against their rate limits, so use it only when servers_list looks out of date.",
      inputSchema: z.object({}).strict(),
      // Not readOnly: it POSTs and replaces the cached snapshot. It changes no
      // provider-side state and repeating it yields the same inventory, but
      // the fan-out is costly enough that an agent should treat it as an
      // action rather than a free read.
      readOnly: false,
      untrustedOutput: true,
      async handler() {
        const response = await deps.refreshServers();
        deps.refresh();
        return {
          servers: response.servers.length,
          providerErrors: response.providerErrors.map((entry) => ({
            providerId: entry.providerId,
            error: entry.error,
          })),
        };
      },
    }),

    defineWebMcpTool({
      name: "server_power_action",
      title: "Server power action",
      description:
        "Starts, stops or restarts one provider-backed server, identified by its localServerId. Which actions exist follows from the server's current status — the same rule the on-page buttons use — and an unavailable action is refused with the ones that are available. Agent-only servers have no provider to act through and are refused.",
      inputSchema: z
        .object({
          localServerId: localServerIdField,
          action: z
            .enum(["start", "stop", "restart"])
            .describe("The power action to perform on the server"),
        })
        .strict(),
      readOnly: false,
      // The server name echoed back originates with the provider.
      untrustedOutput: true,
      async handler({ localServerId, action }) {
        const server = await deps.getServerByLocalId(localServerId);

        // Only a provider-origin server carries the providerId/remoteServerId
        // pair the power route is addressed by; an agent-only server reports
        // metrics over the agent and has no provider behind it at all.
        if (server.origin !== "provider") {
          throw new Error(
            `"${server.name}" is an agent-only server — it reports metrics through the agent but has no provider to run power actions through. Power actions need a provider-backed server.`,
          );
        }

        const available = getAvailableActions(server).map(
          (entry) => entry.action,
        );
        if (!available.includes(action)) {
          throw new Error(
            `Action '${action}' is not available for '${server.name}' in its current status ('${server.status}'). Available: ${
              available.length > 0 ? available.join(", ") : "none"
            }.`,
          );
        }

        await deps.powerAction(
          server.providerId,
          server.remoteServerId,
          action,
        );
        deps.refresh();

        return {
          localServerId: server.localServerId,
          server: server.name,
          action,
          requested: true,
        };
      },
    }),
  ];
}
