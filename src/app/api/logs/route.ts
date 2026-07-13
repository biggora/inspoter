import { NextResponse, type NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth/dal";
import * as logsService from "@/lib/services/logs";

export async function GET(request: NextRequest) {
  const { workspace } = await requireAuth();
  const searchParams = request.nextUrl.searchParams;

  const sortParam = searchParams.get("sort");
  const sort = sortParam === "asc" ? "asc" : sortParam === "desc" ? "desc" : undefined;

  const pageSizeParam = searchParams.get("pageSize");
  const pageSize = pageSizeParam ? Number(pageSizeParam) : undefined;

  const result = await logsService.list(workspace.id, {
    cursor: searchParams.get("cursor") ?? undefined,
    pageSize: pageSize && Number.isFinite(pageSize) && pageSize > 0 ? pageSize : undefined,
    level: searchParams.get("level") ?? undefined,
    source: searchParams.get("source") ?? undefined,
    query: searchParams.get("query") ?? undefined,
    sort,
  });

  return NextResponse.json(result);
}
