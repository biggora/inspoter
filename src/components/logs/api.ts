// Thin fetch wrapper for the /api/logs route (backend-dev-owned,
// src/app/api/logs/route.ts). JSON-serialized log entries have `timestamp`
// as an ISO string (not a `Date`), hence the dedicated DTO rather than
// reusing the generated Prisma `LogEntry` type.

import {
  getActiveWorkspaceId,
  WORKSPACE_HEADER_NAME,
} from "@/lib/client/active-workspace";

export interface LogEntryDto {
  id: string;
  level: string;
  source: string;
  message: string;
  timestamp: string;
}

export interface FetchLogsParams {
  cursor?: string;
  level?: string;
  source?: string;
  query?: string;
  sort?: "asc" | "desc";
}

export interface FetchLogsResult {
  items: LogEntryDto[];
  nextCursor: string | null;
}

export async function fetchLogs(
  params: FetchLogsParams,
): Promise<FetchLogsResult> {
  const searchParams = new URLSearchParams();
  if (params.cursor) searchParams.set("cursor", params.cursor);
  if (params.level) searchParams.set("level", params.level);
  if (params.source) searchParams.set("source", params.source);
  if (params.query) searchParams.set("query", params.query);
  if (params.sort) searchParams.set("sort", params.sort);

  const res = await fetch(`/api/logs?${searchParams}`, {
    headers: { [WORKSPACE_HEADER_NAME]: getActiveWorkspaceId() ?? "" },
  });
  if (!res.ok) {
    throw new Error("Couldn't load logs. Try again.");
  }
  return res.json();
}
