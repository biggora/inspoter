import { NextResponse, type NextRequest } from "next/server";
import * as kanbanService from "@/lib/services/kanban";
import {
  apiJsonResponse,
  apiValidationError,
  recordTokenActivity,
  requireApiToken,
} from "@/lib/api/token-auth";
import { kanbanBoardSchema } from "@/lib/validation/kanban";
import { mapKanbanError } from "@/app/api/v1/kanban/errors";

// Agent-facing kanban. Session-cookie-free: the bearer token is the sole
// authority and carries the workspace (see src/lib/api/token-auth.ts).
//
// Deleting a board or a column is deliberately not exposed anywhere in this
// family: either takes every card, checklist item and comment inside it, and
// that stays an operator decision in the dashboard — the same line the
// Messages family draws at deleting a channel.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireApiToken(request, "kanban:read");
  if (auth instanceof NextResponse) return auth;

  return apiJsonResponse(await kanbanService.listBoards(auth.workspaceId));
}

export async function POST(request: NextRequest) {
  const auth = await requireApiToken(request, "kanban:write");
  if (auth instanceof NextResponse) return auth;

  const parsed = kanbanBoardSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) return apiValidationError(parsed.error.issues);

  try {
    const board = await kanbanService.createBoard(
      auth.workspaceId,
      parsed.data,
    );
    recordTokenActivity(auth, {
      action: "create",
      entityType: "kanban_board",
      entityId: board.id,
      entityLabel: board.name,
    });
    return apiJsonResponse(board, { status: 201 });
  } catch (error) {
    return mapKanbanError(error, "Kanban board");
  }
}
