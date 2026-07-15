import { NextResponse, type NextRequest } from "next/server";
import { requireAuthWithWorkspaceHeader } from "@/lib/auth/dal";
import * as workspacesService from "@/lib/services/workspaces";
import { mapWorkspaceServiceError } from "@/app/api/workspaces/errors";
import { emptyResponse } from "@/lib/api/response";

interface RouteContext {
  params: Promise<{ id: string; memberId: string }>;
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const authResult = await requireAuthWithWorkspaceHeader(request).catch(
    (error) => mapWorkspaceServiceError(error),
  );
  if (authResult instanceof NextResponse) return authResult;
  const { operator } = authResult;
  const { id, memberId } = await params;

  try {
    await workspacesService.removeMember(id, memberId, operator.id);
    return emptyResponse();
  } catch (error) {
    return mapWorkspaceServiceError(error);
  }
}
