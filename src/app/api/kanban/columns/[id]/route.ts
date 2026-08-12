import { NextResponse, type NextRequest } from "next/server";
import { requireAuthWithWorkspaceHeader } from "@/lib/auth/dal";
import { kanbanColumnUpdateSchema } from "@/lib/validation/kanban";
import * as kanbanService from "@/lib/services/kanban";
import { toErrorResponse } from "@/lib/api/errors";
import { emptyResponse, jsonResponse } from "@/lib/api/response";
import { recordActivity } from "@/lib/services/activity";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const authResult = await requireAuthWithWorkspaceHeader(request).catch(
    (error) => toErrorResponse(error),
  );
  if (authResult instanceof NextResponse) return authResult;
  const { operator, workspace } = authResult;
  const { id } = await params;

  const body = await request.json().catch(() => null);
  const parsed = kanbanColumnUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return jsonResponse({ error: parsed.error.issues }, { status: 400 });
  }

  try {
    const column = await kanbanService.updateColumn(
      workspace.id,
      id,
      parsed.data,
    );
    recordActivity(workspace.id, {
      operatorId: operator.id,
      operatorName: operator.username,
      action: "update",
      entityType: "kanban_column",
      entityId: id,
      entityLabel: column.name,
    });
    return jsonResponse(column);
  } catch (error) {
    return toErrorResponse(error, workspace.id);
  }
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const authResult = await requireAuthWithWorkspaceHeader(request).catch(
    (error) => toErrorResponse(error),
  );
  if (authResult instanceof NextResponse) return authResult;
  const { operator, workspace } = authResult;
  const { id } = await params;

  try {
    await kanbanService.deleteColumn(workspace.id, id);
    recordActivity(workspace.id, {
      operatorId: operator.id,
      operatorName: operator.username,
      action: "delete",
      entityType: "kanban_column",
      entityId: id,
      entityLabel: null,
    });
    return emptyResponse();
  } catch (error) {
    return toErrorResponse(error, workspace.id);
  }
}
