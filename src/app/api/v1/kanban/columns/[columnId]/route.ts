import { NextResponse, type NextRequest } from "next/server";
import * as kanbanService from "@/lib/services/kanban";
import {
  apiJsonResponse,
  apiValidationError,
  recordTokenActivity,
  requireApiToken,
} from "@/lib/api/token-auth";
import { kanbanColumnUpdateSchema } from "@/lib/validation/kanban";
import { mapKanbanError } from "@/app/api/v1/kanban/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ columnId: string }>;
}

// Update only — deleting a column would take the cards in it with it.
export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const auth = await requireApiToken(request, "kanban:write");
  if (auth instanceof NextResponse) return auth;
  const { columnId } = await params;

  const parsed = kanbanColumnUpdateSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) return apiValidationError(parsed.error.issues);

  try {
    const column = await kanbanService.updateColumn(
      auth.workspaceId,
      columnId,
      parsed.data,
    );
    recordTokenActivity(auth, {
      action: "update",
      entityType: "kanban_column",
      entityId: column.id,
      entityLabel: column.name,
    });
    return apiJsonResponse(column);
  } catch (error) {
    return mapKanbanError(error, "Kanban column");
  }
}
