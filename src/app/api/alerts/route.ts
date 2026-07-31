import { NextResponse, type NextRequest } from "next/server";
import { requireAuthWithWorkspaceHeader } from "@/lib/auth/dal";
import * as alertsService from "@/lib/services/alerts";
import { toErrorResponse } from "@/lib/api/errors";
import { jsonResponse } from "@/lib/api/response";
import { alertListQuerySchema } from "@/lib/validation/alerts";

export async function GET(request: NextRequest) {
  const authResult = await requireAuthWithWorkspaceHeader(request).catch(
    (error) => toErrorResponse(error),
  );
  if (authResult instanceof NextResponse) return authResult;
  const { workspace } = authResult;
  const parsed = alertListQuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams),
  );
  if (!parsed.success) {
    return jsonResponse({ error: parsed.error.issues }, { status: 400 });
  }

  const result = await alertsService.list(workspace.id, {
    ...parsed.data,
  });
  return jsonResponse(result);
}
