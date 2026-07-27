import { NextResponse, type NextRequest } from "next/server";
import { requireAuthWithWorkspaceHeader } from "@/lib/auth/dal";
import { updateWorkspaceSchema } from "@/lib/validation/workspaces";
import * as workspacesService from "@/lib/services/workspaces";
import { mapWorkspaceServiceError } from "@/app/api/workspaces/errors";
import { emptyResponse, jsonResponse } from "@/lib/api/response";
import { recordActivity } from "@/lib/services/activity";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const authResult = await requireAuthWithWorkspaceHeader(request).catch(
    (error) => mapWorkspaceServiceError(error),
  );
  if (authResult instanceof NextResponse) return authResult;
  const { operator } = authResult;
  const { id } = await params;

  const body = await request.json().catch(() => null);
  const parsed = updateWorkspaceSchema.safeParse(body);
  if (!parsed.success) {
    return jsonResponse({ error: parsed.error.issues }, { status: 400 });
  }

  try {
    const workspace = await workspacesService.updateWorkspace(
      id,
      operator.id,
      parsed.data,
    );
    recordActivity(id, {
      operatorId: operator.id,
      operatorName: operator.username,
      action: "update",
      entityType: "workspace",
      entityId: id,
      entityLabel: parsed.data.name,
    });
    return jsonResponse(workspace);
  } catch (error) {
    return mapWorkspaceServiceError(error, id);
  }
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const authResult = await requireAuthWithWorkspaceHeader(request).catch(
    (error) => mapWorkspaceServiceError(error),
  );
  if (authResult instanceof NextResponse) return authResult;
  const { operator, workspace } = authResult;
  const { id } = await params;

  try {
    const deleted = await workspacesService.deleteWorkspace(id, operator.id);
    // Journal into the operator's active workspace, never into `id`: an
    // Activity row FKs to Workspace and would cascade away with the workspace
    // it describes. Nothing to write to when the active one is what went.
    if (workspace.id !== id) {
      recordActivity(workspace.id, {
        operatorId: operator.id,
        operatorName: operator.username,
        action: "delete",
        entityType: "workspace",
        entityId: id,
        entityLabel: deleted.name,
      });
    }
    return emptyResponse();
  } catch (error) {
    return mapWorkspaceServiceError(error, id);
  }
}
