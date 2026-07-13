import { NextResponse, type NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth/dal";
import * as mailService from "@/lib/services/mail";

export async function GET(request: NextRequest) {
  const { workspace } = await requireAuth();
  const sp = request.nextUrl.searchParams;

  const sortParam = sp.get("sort");
  const sort =
    sortParam === "asc" ? "asc" : sortParam === "desc" ? "desc" : undefined;

  const result = await mailService.list(workspace.id, {
    cursor: sp.get("cursor") ?? undefined,
    sender: sp.get("sender") ?? undefined,
    query: sp.get("query") ?? undefined,
    sort,
  });
  return NextResponse.json(result);
}
