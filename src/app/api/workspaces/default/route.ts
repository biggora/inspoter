import { type NextRequest } from "next/server";
import { requireOperator } from "@/lib/auth/dal";
import * as workspacesService from "@/lib/services/workspaces";
import { mapWorkspaceServiceError } from "@/app/api/workspaces/errors";
import { jsonResponse, emptyResponse } from "@/lib/api/response";

export async function PUT(request: NextRequest) {
  try {
    const operator = await requireOperator();
    const body = await request.json().catch(() => null);
    if (!body?.workspaceId || typeof body.workspaceId !== "string") {
      return jsonResponse(
        { error: "workspaceId is required" },
        { status: 400 },
      );
    }
    await workspacesService.setDefaultWorkspace(operator.id, body.workspaceId);
    return jsonResponse({ ok: true });
  } catch (error) {
    return mapWorkspaceServiceError(error);
  }
}

export async function DELETE() {
  try {
    const operator = await requireOperator();
    await workspacesService.clearDefaultWorkspace(operator.id);
    return emptyResponse();
  } catch (error) {
    return mapWorkspaceServiceError(error);
  }
}
