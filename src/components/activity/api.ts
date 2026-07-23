// Thin fetch wrapper for the /api/activity route (backend-dev-owned,
// src/app/api/activity/route.ts). JSON-serialized activity entries have
// `timestamp` as an ISO string (not a `Date`), hence the dedicated DTO
// rather than reusing the generated Prisma `Activity` type.

import {
  getActiveWorkspaceId,
  WORKSPACE_HEADER_NAME,
} from "@/lib/client/active-workspace";

export interface ActivityDto {
  id: string;
  operatorId: string;
  operatorName: string;
  action: string;
  entityType: string;
  entityId: string | null;
  entityLabel: string | null;
  details: string | null;
  timestamp: string;
}

export interface FetchActivitiesParams {
  cursor?: string;
  action?: string;
  entityType?: string;
  operatorId?: string;
  query?: string;
  sort?: "asc" | "desc";
}

export interface FetchActivitiesResult {
  items: ActivityDto[];
  nextCursor: string | null;
}

export async function fetchActivities(
  params: FetchActivitiesParams,
): Promise<FetchActivitiesResult> {
  const searchParams = new URLSearchParams();
  if (params.cursor) searchParams.set("cursor", params.cursor);
  if (params.action) searchParams.set("action", params.action);
  if (params.entityType) searchParams.set("entityType", params.entityType);
  if (params.operatorId) searchParams.set("operatorId", params.operatorId);
  if (params.query) searchParams.set("query", params.query);
  if (params.sort) searchParams.set("sort", params.sort);

  const res = await fetch(`/api/activity?${searchParams}`, {
    headers: { [WORKSPACE_HEADER_NAME]: getActiveWorkspaceId() ?? "" },
  });
  if (!res.ok) {
    throw new Error("Failed to load activity.");
  }
  return res.json();
}
