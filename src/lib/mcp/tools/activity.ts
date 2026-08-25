import { z } from "zod";
import * as activityService from "@/lib/services/activity";
import { defineTool, type McpToolDefinition } from "@/lib/mcp/tool";

// Read-only by construction: the activity journal is written by the services
// that perform the actions, never by a caller. "What changed since yesterday"
// is the archetypal question a scheduled agent is asked.

export const activityTools: McpToolDefinition[] = [
  defineTool({
    name: "activity_search",
    scope: "activity:read",
    title: "Search the activity journal",
    description:
      "Search the workspace's action journal. `query` matches the entity label, the details and the operator name. Results are newest-first unless sort is overridden.",
    inputSchema: z.object({
      query: z.string().optional(),
      action: z
        .string()
        .optional()
        .describe("e.g. create, update, delete, run, llm_chat"),
      entityType: z
        .string()
        .optional()
        .describe("e.g. note, agent, bookmark, kanban_card"),
      operatorId: z.string().optional(),
      sort: z.enum(["asc", "desc"]).optional(),
      pageSize: z.number().int().min(1).max(100).optional(),
      cursor: z.string().optional(),
    }),
    readOnly: true,
    handler: (args, ctx) => activityService.list(ctx.workspaceId, args),
  }),
];
