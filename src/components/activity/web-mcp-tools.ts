import { z } from "zod";

import { defineWebMcpTool, type WebMcpTool } from "@/lib/web-mcp/define-tool";
import type { FetchActivitiesParams, FetchActivitiesResult } from "./api";

// WebMCP tool for the Activity journal. There is no server MCP equivalent, so
// the name follows the same grammar as the catalogs that do exist
// (`logs_search` in src/lib/mcp/tools/logs.ts): `activity_search`. Read-only —
// the journal is written by the app, never by an operator or an agent.

export interface ActivityToolDeps {
  /** Bound fetchActivities. */
  fetchActivities: (
    params: FetchActivitiesParams,
  ) => Promise<FetchActivitiesResult>;
}

/** Keeps a default-sized page well inside the ~1500-char output budget. */
const MAX_LABEL_LENGTH = 80;
const DEFAULT_PAGE_SIZE = 10;
// Matches the server's default page size (env.LIST_PAGE_SIZE = 50): at this
// limit nothing is ever trimmed, so cursor paging always works.
const MAX_PAGE_SIZE = 50;

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

const searchActivityInputSchema = z
  .object({
    query: z
      .string()
      .min(1)
      .max(200)
      .optional()
      .describe("Substring to match against the entry"),
    action: z
      .string()
      .min(1)
      .max(40)
      .optional()
      .describe("Exact action filter, e.g. create, update, delete"),
    entityType: z
      .string()
      .min(1)
      .max(60)
      .optional()
      .describe("Exact entity type filter, e.g. channel, note, bookmark"),
    operatorId: z
      .string()
      .min(1)
      .optional()
      .describe("Operator id from an earlier activity_search row"),
    limit: z
      .number()
      .int()
      .min(1)
      .max(MAX_PAGE_SIZE)
      .default(DEFAULT_PAGE_SIZE)
      .describe("Maximum entries to return"),
    sort: z
      .enum(["asc", "desc"])
      .optional()
      .describe("desc (default) is newest-first"),
    cursor: z
      .string()
      .min(1)
      .optional()
      .describe("nextCursor from a previous response"),
  })
  .strict();

export function createActivityTools(deps: ActivityToolDeps): WebMcpTool[] {
  return [
    defineWebMcpTool({
      name: "activity_search",
      title: "Search activity",
      description:
        "Searches the workspace's activity journal — who did what to which entity — newest-first unless sort is overridden. Entity labels are truncated and the details field is omitted. Page with the returned nextCursor; when truncated is true the page held more entries than limit and nextCursor is withheld — raise limit (up to 50) to page on.",
      inputSchema: searchActivityInputSchema,
      readOnly: true,
      // Operator names and entity labels are operator-authored free text.
      untrustedOutput: true,
      async handler({
        query,
        action,
        entityType,
        operatorId,
        limit,
        sort,
        cursor,
      }) {
        const page = await deps.fetchActivities({
          query,
          action,
          entityType,
          operatorId,
          sort,
          cursor,
        });
        const truncated = page.items.length > limit;
        return {
          activities: page.items.slice(0, limit).map((entry) => ({
            id: entry.id,
            timestamp: entry.timestamp,
            operatorId: entry.operatorId,
            operatorName: entry.operatorName,
            action: entry.action,
            entityType: entry.entityType,
            entityId: entry.entityId,
            entityLabel:
              entry.entityLabel === null
                ? null
                : truncate(entry.entityLabel, MAX_LABEL_LENGTH),
          })),
          // A trimmed page drops its cursor: it points past the whole page, so
          // handing it back would silently skip the entries that were cut.
          nextCursor: truncated ? null : page.nextCursor,
          truncated,
        };
      },
    }),
  ];
}
