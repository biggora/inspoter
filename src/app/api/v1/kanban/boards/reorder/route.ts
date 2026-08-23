import { NextResponse, type NextRequest } from "next/server";
import * as kanbanService from "@/lib/services/kanban";
import {
  apiJsonResponse,
  apiValidationError,
  recordTokenActivity,
  requireApiToken,
} from "@/lib/api/token-auth";
import { kanbanBoardReorderSchema } from "@/lib/validation/kanban";
import { mapKanbanError } from "@/app/api/v1/kanban/errors";

// Static segment, so it wins over /api/v1/kanban/boards/[boardId].

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(request: NextRequest) {
  const auth = await requireApiToken(request, "kanban:write");
  if (auth instanceof NextResponse) return auth;

  const parsed = kanbanBoardReorderSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) return apiValidationError(parsed.error.issues);

  try {
    await kanbanService.reorderBoards(auth.workspaceId, parsed.data.order);
    recordTokenActivity(auth, {
      action: "reorder",
      entityType: "kanban_board",
    });
    return apiJsonResponse({ reordered: true });
  } catch (error) {
    return mapKanbanError(error, "Kanban board");
  }
}
