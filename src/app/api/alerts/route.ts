import { NextResponse, type NextRequest } from "next/server";
import { requireAuthWithWorkspaceHeader } from "@/lib/auth/dal";
import * as alertsService from "@/lib/services/alerts";
import { toErrorResponse } from "@/lib/api/errors";
import { jsonResponse } from "@/lib/api/response";

export async function GET(request: NextRequest) {
  const authResult = await requireAuthWithWorkspaceHeader(request).catch(
    (error) => toErrorResponse(error),
  );
  if (authResult instanceof NextResponse) return authResult;
  const { workspace } = authResult;
  const sp = request.nextUrl.searchParams;

  const sortParam = sp.get("sort");
  const sort =
    sortParam === "asc" ? "asc" : sortParam === "desc" ? "desc" : undefined;

  const result = await alertsService.list(workspace.id, {
    cursor: sp.get("cursor") ?? undefined,
    categoryId: sp.get("categoryId") ?? undefined,
    severity: sp.get("severity") ?? undefined,
    query: sp.get("query") ?? undefined,
    sort,
  });
  return jsonResponse(result);
}
