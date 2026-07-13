import { NextResponse, type NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth/dal";
import * as alertsService from "@/lib/services/alerts";

export async function GET(request: NextRequest) {
  const { workspace } = await requireAuth();
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
  return NextResponse.json(result);
}
