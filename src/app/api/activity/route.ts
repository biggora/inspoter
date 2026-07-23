import { NextResponse, type NextRequest } from "next/server";
import { requireAuthWithWorkspaceHeader } from "@/lib/auth/dal";
import * as activityService from "@/lib/services/activity";
import { toErrorResponse } from "@/lib/api/errors";
import { jsonResponse } from "@/lib/api/response";

export async function GET(request: NextRequest) {
  const authResult = await requireAuthWithWorkspaceHeader(request).catch(
    (error) => toErrorResponse(error),
  );
  if (authResult instanceof NextResponse) return authResult;
  const { workspace } = authResult;
  const searchParams = request.nextUrl.searchParams;

  const sortParam = searchParams.get("sort");
  const sort =
    sortParam === "asc" ? "asc" : sortParam === "desc" ? "desc" : undefined;

  const pageSizeParam = searchParams.get("pageSize");
  const pageSize = pageSizeParam ? Number(pageSizeParam) : undefined;

  const result = await activityService.list(workspace.id, {
    cursor: searchParams.get("cursor") ?? undefined,
    pageSize:
      pageSize && Number.isFinite(pageSize) && pageSize > 0
        ? pageSize
        : undefined,
    action: searchParams.get("action") ?? undefined,
    entityType: searchParams.get("entityType") ?? undefined,
    operatorId: searchParams.get("operatorId") ?? undefined,
    query: searchParams.get("query") ?? undefined,
    sort,
  });

  return jsonResponse(result);
}
