import { NextResponse, type NextRequest } from "next/server";
import { requireAuthWithWorkspaceHeader } from "@/lib/auth/dal";
import * as logsService from "@/lib/services/logs";
import { toErrorResponse } from "@/lib/api/errors";

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

  const result = await logsService.list(workspace.id, {
    cursor: searchParams.get("cursor") ?? undefined,
    pageSize:
      pageSize && Number.isFinite(pageSize) && pageSize > 0
        ? pageSize
        : undefined,
    level: searchParams.get("level") ?? undefined,
    source: searchParams.get("source") ?? undefined,
    query: searchParams.get("query") ?? undefined,
    sort,
  });

  return NextResponse.json(result);
}
