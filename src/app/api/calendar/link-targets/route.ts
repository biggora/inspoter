import { NextResponse, type NextRequest } from "next/server";

import { requireAuthWithWorkspaceHeader } from "@/lib/auth/dal";
import { jsonResponse } from "@/lib/api/response";
import { toErrorResponse } from "@/lib/api/errors";
import { searchCalendarLinkTargets } from "@/lib/services/calendar-link-targets";

export async function GET(request: NextRequest) {
  const authResult = await requireAuthWithWorkspaceHeader(request).catch(
    (error) => toErrorResponse(error),
  );
  if (authResult instanceof NextResponse) return authResult;
  const query = (request.nextUrl.searchParams.get("q") ?? "").slice(0, 200);
  const cursor = request.nextUrl.searchParams.get("cursor");
  const limit = Number(request.nextUrl.searchParams.get("limit") ?? "30");
  try {
    return jsonResponse(
      await searchCalendarLinkTargets(authResult.workspace.id, query, {
        cursor,
        limit,
      }),
    );
  } catch (error) {
    return toErrorResponse(error, authResult.workspace.id);
  }
}
