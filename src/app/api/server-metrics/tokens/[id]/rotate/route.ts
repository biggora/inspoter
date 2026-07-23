import { NextResponse, type NextRequest } from "next/server";
import { requireAuthWithWorkspaceHeader } from "@/lib/auth/dal";
import { requireWorkspaceOwner } from "@/lib/services/workspace-auth";
import { toErrorResponse } from "@/lib/api/errors";
import { jsonResponse } from "@/lib/api/response";
import { rotateAgentToken } from "@/lib/services/serverMetrics";
import { recordActivity } from "@/lib/services/activity";

export async function POST(
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
    const result = await rotateAgentToken(id, workspace.id);
    recordActivity(workspace.id, {
      operatorId: operator.id,
      operatorName: operator.username,
      action: "rotate",
      entityType: "server_agent_token",
      entityId: id,
    });
    return jsonResponse(result);
  } catch (error) {
    return toErrorResponse(error);
  }
}
