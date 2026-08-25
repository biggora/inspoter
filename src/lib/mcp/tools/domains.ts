import { z } from "zod";
import * as domainsService from "@/lib/services/domains";
import { defineTool, type McpToolDefinition } from "@/lib/mcp/tool";

// Read-only, deliberately. A DNS record is changed through a provider
// credential and takes effect on the public internet within minutes; that is
// the same class of blast radius as a server power action, which has no write
// scope either. An agent can report on DNS, and an operator makes the change.

export const domainTools: McpToolDefinition[] = [
  defineTool({
    name: "domains_list",
    scope: "domains:read",
    title: "List domains",
    description:
      "List the workspace's domains, grouped by the provider credential that serves them. Use the returned provider id and domain id with dns_records_list.",
    inputSchema: z.object({}),
    readOnly: true,
    handler: (_args, ctx) => domainsService.listDomains(ctx.workspaceId),
  }),

  defineTool({
    name: "dns_records_list",
    scope: "domains:read",
    title: "List DNS records",
    description:
      "List one domain's DNS records. Both ids come from domains_list. Writing a record is deliberately unavailable — DNS changes reach the public internet and stay with the operator.",
    inputSchema: z.object({
      providerId: z.string().describe("From domains_list."),
      domainId: z.string().describe("From domains_list."),
    }),
    readOnly: true,
    handler: (args, ctx) =>
      domainsService.listRecords(
        ctx.workspaceId,
        args.providerId,
        args.domainId,
      ),
  }),
];
