import { NextResponse, type NextRequest } from "next/server";
import * as kanbanService from "@/lib/services/kanban";
import {
  apiJsonResponse,
  apiValidationError,
  recordTokenActivity,
  requireApiToken,
} from "@/lib/api/token-auth";
import { kanbanColumnSchema } from "@/lib/validation/kanban";
import { mapKanbanError } from "@/app/api/v1/kanban/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const auth = await requireApiToken(request, "kanban:write");
  if (auth instanceof NextResponse) return auth;

  const parsed = kanbanColumnSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) return apiValidationError(parsed.error.issues);

  try {
    const column = await kanbanService.createColumn(
      auth.workspaceId,
      parsed.data,
    );
    recordTokenActivity(auth, {
      action: "create",
      entityType: "kanban_column",
      entityId: column.id,
      entityLabel: column.name,
    });
    return apiJsonResponse(column, { status: 201 });
  } catch (error) {
    return mapKanbanError(error, "Kanban column");
  }
}
