import { z } from "zod";

import { defineWebMcpTool, type WebMcpTool } from "@/lib/web-mcp/define-tool";
import type { FetchLogsParams, FetchLogsResult } from "./api";

// WebMCP tool for Logs — the browser-side counterpart of `logs_search` in the
// server MCP catalog (src/lib/mcp/tools/logs.ts), reusing its name and its
// filter vocabulary. Read-only: the dashboard has no log-mutating action.

export interface LogsToolDeps {
  /** Bound fetchLogs. */
  fetchLogs: (params: FetchLogsParams) => Promise<FetchLogsResult>;
}

/** Keeps a default-sized page well inside the ~1500-char output budget. */
const MAX_MESSAGE_LENGTH = 160;
const DEFAULT_PAGE_SIZE = 10;
// Matches the server's default page size (env.LIST_PAGE_SIZE = 50): at this
// limit nothing is ever trimmed, so cursor paging always works.
const MAX_PAGE_SIZE = 50;

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

const searchLogsInputSchema = z
  .object({
    query: z
      .string()
      .min(1)
      .max(200)
      .optional()
      .describe("Substring to match against the log message"),
    level: z
      .string()
      .min(1)
      .max(40)
      .optional()
      .describe("Exact level filter, e.g. debug, info, warn, error"),
    source: z
      .string()
      .min(1)
      .max(80)
      .optional()
      .describe("Exact source filter, e.g. a service name"),
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

export function createLogsTools(deps: LogsToolDeps): WebMcpTool[] {
  return [
    defineWebMcpTool({
      name: "logs_search",
      title: "Search logs",
      description:
        "Searches the workspace's log entries, newest-first unless sort is overridden. Returns id, timestamp, level, source and a truncated message; the details field is omitted. Page with the returned nextCursor; when truncated is true the page held more entries than limit and nextCursor is withheld — raise limit (up to 50) to page on.",
      inputSchema: searchLogsInputSchema,
      readOnly: true,
      // Log messages are written by ingesting systems, not by this app.
      untrustedOutput: true,
      async handler({ query, level, source, limit, sort, cursor }) {
        const page = await deps.fetchLogs({
          query,
          level,
          source,
          sort,
          cursor,
        });
        const truncated = page.items.length > limit;
        return {
          logs: page.items.slice(0, limit).map((entry) => ({
            id: entry.id,
            timestamp: entry.timestamp,
            level: entry.level,
            source: entry.source,
            message: truncate(entry.message, MAX_MESSAGE_LENGTH),
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
