import { NextResponse, type NextRequest } from "next/server";
import * as kanbanService from "@/lib/services/kanban";
import {
  apiJsonResponse,
  apiNotFound,
  apiValidationError,
  recordTokenActivity,
  requireApiToken,
} from "@/lib/api/token-auth";
import { kanbanBoardUpdateSchema } from "@/lib/validation/kanban";
import { mapKanbanError } from "@/app/api/v1/kanban/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ boardId: string }>;
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  const auth = await requireApiToken(request, "kanban:read");
  if (auth instanceof NextResponse) return auth;
  const { boardId } = await params;

  const board = await kanbanService.getBoard(auth.workspaceId, boardId);
  if (!board) return apiNotFound("Kanban board");
  return apiJsonResponse(board);
}

// Rename only — deleting a board would take every card on it with it.
export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const auth = await requireApiToken(request, "kanban:write");
  if (auth instanceof NextResponse) return auth;
  const { boardId } = await params;

  const parsed = kanbanBoardUpdateSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) return apiValidationError(parsed.error.issues);

  try {
    const board = await kanbanService.renameBoard(
      auth.workspaceId,
      boardId,
      parsed.data,
    );
    recordTokenActivity(auth, {
      action: "update",
      entityType: "kanban_board",
      entityId: board.id,
      entityLabel: board.name,
    });
    return apiJsonResponse(board);
  } catch (error) {
    return mapKanbanError(error, "Kanban board");
  }
}
