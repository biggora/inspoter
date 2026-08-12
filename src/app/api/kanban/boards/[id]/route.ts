import { NextResponse, type NextRequest } from "next/server";
import { requireAuthWithWorkspaceHeader } from "@/lib/auth/dal";
import { kanbanBoardUpdateSchema } from "@/lib/validation/kanban";
import * as kanbanService from "@/lib/services/kanban";
import { requireWorkspaceOwner } from "@/lib/services/workspace-auth";
import { toErrorResponse } from "@/lib/api/errors";
import { emptyResponse, jsonResponse } from "@/lib/api/response";
import { recordActivity } from "@/lib/services/activity";

interface RouteContext {
  params: Promise<{ id: string }>;
}

// The board with its columns and cards. Used by the "create task from alert"
// dialog, which needs a column to place the new card in without navigating to
// the board first.
export async function GET(request: NextRequest, { params }: RouteContext) {
  const authResult = await requireAuthWithWorkspaceHeader(request).catch(
    (error) => toErrorResponse(error),
  );
  if (authResult instanceof NextResponse) return authResult;
  const { workspace } = authResult;
  const { id } = await params;

  try {
    const board = await kanbanService.getBoard(workspace.id, id);
    if (!board) {
      return jsonResponse({ error: "RESOURCE_NOT_FOUND" }, { status: 404 });
    }
    return jsonResponse(board);
  } catch (error) {
    return toErrorResponse(error, workspace.id);
  }
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const authResult = await requireAuthWithWorkspaceHeader(request).catch(
    (error) => toErrorResponse(error),
  );
  if (authResult instanceof NextResponse) return authResult;
  const { operator, workspace } = authResult;
  const { id } = await params;

  const body = await request.json().catch(() => null);
  const parsed = kanbanBoardUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return jsonResponse({ error: parsed.error.issues }, { status: 400 });
  }

  try {
    const board = await kanbanService.renameBoard(
      workspace.id,
      id,
      parsed.data,
    );
    recordActivity(workspace.id, {
      operatorId: operator.id,
      operatorName: operator.username,
      action: "update",
      entityType: "kanban_board",
      entityId: id,
      entityLabel: board.name,
    });
    return jsonResponse(board);
  } catch (error) {
    return toErrorResponse(error, workspace.id);
  }
}

// Deleting a board cascades to every column, card, checklist item and comment
// on it — an owner-only action, matching how workspace-wide destructive
// changes are gated elsewhere.
export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const authResult = await requireAuthWithWorkspaceHeader(request).catch(
    (error) => toErrorResponse(error),
  );
  if (authResult instanceof NextResponse) return authResult;
  const { operator, workspace } = authResult;
  const { id } = await params;

  try {
    await requireWorkspaceOwner(workspace.id, operator.id);
    await kanbanService.deleteBoard(workspace.id, id);
    recordActivity(workspace.id, {
      operatorId: operator.id,
      operatorName: operator.username,
      action: "delete",
      entityType: "kanban_board",
      entityId: id,
      entityLabel: null,
    });
    return emptyResponse();
  } catch (error) {
    return toErrorResponse(error, workspace.id);
  }
}
