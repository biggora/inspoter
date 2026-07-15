import { NextResponse, type NextRequest } from "next/server";
import { requireAuthWithWorkspaceHeader } from "@/lib/auth/dal";
import * as mailService from "@/lib/services/mail";
import { toErrorResponse } from "@/lib/api/errors";

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

  const result = await mailService.list(workspace.id, {
    cursor: sp.get("cursor") ?? undefined,
    sender: sp.get("sender") ?? undefined,
    query: sp.get("query") ?? undefined,
    sort,
  });
  return NextResponse.json(result);
}
