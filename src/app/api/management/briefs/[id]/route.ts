import { NextResponse, type NextRequest } from "next/server";
import { toErrorResponse } from "@/lib/api/errors";
import { jsonResponse } from "@/lib/api/response";
import { requireAuthWithWorkspaceHeader } from "@/lib/auth/dal";
import { getExecutiveBrief } from "@/lib/services/executive-briefs";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const authResult = await requireAuthWithWorkspaceHeader(request).catch(
    (error) => toErrorResponse(error),
  );
  if (authResult instanceof NextResponse) return authResult;
  const { id } = await context.params;
  try {
    return jsonResponse(await getExecutiveBrief(authResult.workspace.id, id));
  } catch (error) {
    return toErrorResponse(error, authResult.workspace.id);
  }
}
