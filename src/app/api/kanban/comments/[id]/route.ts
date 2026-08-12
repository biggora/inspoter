import { NextResponse, type NextRequest } from "next/server";
import { requireAuthWithWorkspaceHeader } from "@/lib/auth/dal";
import * as kanbanService from "@/lib/services/kanban";
import { toErrorResponse } from "@/lib/api/errors";
import { emptyResponse } from "@/lib/api/response";

interface RouteContext {
  params: Promise<{ id: string }>;
}

// Authorship is checked in the service, which returns the same
// non-disclosing 404 for "not yours" as for "does not exist".
export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const authResult = await requireAuthWithWorkspaceHeader(request).catch(
    (error) => toErrorResponse(error),
  );
  if (authResult instanceof NextResponse) return authResult;
  const { operator, workspace } = authResult;
  const { id } = await params;

  try {
    await kanbanService.deleteComment(workspace.id, id, operator.id);
    return emptyResponse();
  } catch (error) {
    return toErrorResponse(error, workspace.id);
  }
}
