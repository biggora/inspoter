import { NextResponse, type NextRequest } from "next/server";
import { requireAuthWithWorkspaceHeader } from "@/lib/auth/dal";
import { kanbanColumnSchema } from "@/lib/validation/kanban";
import * as kanbanService from "@/lib/services/kanban";
import { toErrorResponse } from "@/lib/api/errors";
import { jsonResponse } from "@/lib/api/response";
import { recordActivity } from "@/lib/services/activity";

export async function POST(request: NextRequest) {
  const authResult = await requireAuthWithWorkspaceHeader(request).catch(
    (error) => toErrorResponse(error),
  );
  if (authResult instanceof NextResponse) return authResult;
  const { operator, workspace } = authResult;

  const body = await request.json().catch(() => null);
  const parsed = kanbanColumnSchema.safeParse(body);
  if (!parsed.success) {
    return jsonResponse({ error: parsed.error.issues }, { status: 400 });
  }

  try {
    const column = await kanbanService.createColumn(workspace.id, parsed.data);
    recordActivity(workspace.id, {
      operatorId: operator.id,
      operatorName: operator.username,
      action: "create",
      entityType: "kanban_column",
      entityId: column.id,
      entityLabel: column.name,
    });
    return jsonResponse(column, { status: 201 });
  } catch (error) {
    return toErrorResponse(error, workspace.id);
  }
}
