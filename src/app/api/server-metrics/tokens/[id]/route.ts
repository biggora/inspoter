import { NextResponse, type NextRequest } from "next/server";
import { requireAuthWithWorkspaceHeader } from "@/lib/auth/dal";
import { requireWorkspaceOwner } from "@/lib/services/workspace-auth";
import { toErrorResponse } from "@/lib/api/errors";
import { emptyResponse } from "@/lib/api/response";
import { revokeAgentToken } from "@/lib/services/serverMetrics";
import { recordActivity } from "@/lib/services/activity";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await requireAuthWithWorkspaceHeader(request).catch(
    (error) => toErrorResponse(error),
  );
  if (authResult instanceof NextResponse) return authResult;
  const { operator, workspace } = authResult;

  try {
    await requireWorkspaceOwner(workspace.id, operator.id);
  } catch (error) {
    return toErrorResponse(error);
  }

  const { id } = await params;

  try {
    await revokeAgentToken(id, workspace.id);
    recordActivity(workspace.id, {
      operatorId: operator.id,
      operatorName: operator.username,
      action: "revoke",
      entityType: "server_agent_token",
      entityId: id,
    });
    return emptyResponse();
  } catch (error) {
    return toErrorResponse(error);
  }
}
