import { NextResponse, type NextRequest } from "next/server";
import * as kanbanService from "@/lib/services/kanban";
import {
  apiJsonResponse,
  apiValidationError,
  recordTokenActivity,
  requireApiToken,
} from "@/lib/api/token-auth";
import { kanbanColumnReorderSchema } from "@/lib/validation/kanban";
import { mapKanbanError } from "@/app/api/v1/kanban/errors";

// Static segment, so it wins over /api/v1/kanban/columns/[columnId].

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(request: NextRequest) {
  const auth = await requireApiToken(request, "kanban:write");
  if (auth instanceof NextResponse) return auth;

  const parsed = kanbanColumnReorderSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) return apiValidationError(parsed.error.issues);

  try {
    await kanbanService.reorderColumns(
      auth.workspaceId,
      parsed.data.boardId,
      parsed.data.order,
    );
    recordTokenActivity(auth, {
      action: "reorder",
      entityType: "kanban_column",
      entityId: parsed.data.boardId,
    });
    return apiJsonResponse({ reordered: true });
  } catch (error) {
    return mapKanbanError(error, "Kanban column");
  }
}
