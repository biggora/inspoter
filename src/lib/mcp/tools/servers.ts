import { z } from "zod";
import * as serversService from "@/lib/services/servers";
import type { ComposedServerDto } from "@/lib/services/servers";
import { defineTool, type McpToolDefinition } from "@/lib/mcp/tool";
import { McpResourceNotFoundError } from "@/lib/mcp/errors";

// listServers() reads the cached provider snapshots from the database and
// already carries each server's latest metrics reading, so both tools below
// go through it. Resolving a single server by localServerId rather than
// getComposedServer(providerId, remoteServerId) is deliberate: agent-only
// servers have no provider coordinates at all.
function haystack(server: ComposedServerDto): string {
  const fields =
    server.origin === "provider"
      ? [server.name, server.ip, server.os, server.location, server.type]
      : [server.name, server.hostname ?? ""];
  return fields.join(" ").toLowerCase();
}

export const serverTools: McpToolDefinition[] = [
  defineTool({
    name: "servers_list",
    scope: "servers:read",
    title: "List servers",
    description:
      "List the workspace's servers with their latest metrics (CPU, load, memory, swap, filesystem, uptime). `metrics.state` is not_configured when no agent reports, stale when the last reading is older than three minutes.",
    inputSchema: z.object({
      query: z
        .string()
        .optional()
        .describe("Filter by name, hostname, IP, OS or location"),
    }),
    readOnly: true,
    handler: async (args, ctx) => {
      const response = await serversService.listServers(ctx.workspaceId);
      if (!args.query) return response;
      const needle = args.query.toLowerCase();
      return {
        ...response,
        servers: response.servers.filter((server) =>
          haystack(server).includes(needle),
        ),
      };
    },
  }),

  defineTool({
    name: "server_get",
    scope: "servers:read",
    title: "Read a server",
    description:
      "Read one server and its latest metrics by localServerId (from servers_list).",
    inputSchema: z.object({ localServerId: z.string() }),
    readOnly: true,
    handler: async (args, ctx) => {
      const { servers } = await serversService.listServers(ctx.workspaceId);
      const server = servers.find(
        (candidate) => candidate.localServerId === args.localServerId,
      );
      if (!server) {
        throw new McpResourceNotFoundError("Server", args.localServerId);
      }
      return server;
    },
  }),
];
