import { NextResponse, type NextRequest } from "next/server";
import { toErrorResponse } from "@/lib/api/errors";
import { jsonResponse } from "@/lib/api/response";
import { requireAuthWithWorkspaceHeader } from "@/lib/auth/dal";
import { listExecutiveBriefs } from "@/lib/services/executive-briefs";

export async function GET(request: NextRequest) {
  const authResult = await requireAuthWithWorkspaceHeader(request).catch(
    (error) => toErrorResponse(error),
  );
  if (authResult instanceof NextResponse) return authResult;
  try {
    return jsonResponse(await listExecutiveBriefs(authResult.workspace.id));
  } catch (error) {
    return toErrorResponse(error, authResult.workspace.id);
  }
}
