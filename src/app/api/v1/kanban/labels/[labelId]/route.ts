import { NextResponse, type NextRequest } from "next/server";
import {
  apiJsonResponse,
  apiValidationError,
  recordTokenActivity,
  requireApiToken,
} from "@/lib/api/token-auth";
import * as kanbanLabelsService from "@/lib/services/kanban-labels";
import { updateKanbanLabelSchema } from "@/lib/validation/kanban";
import { mapKanbanError } from "@/app/api/v1/kanban/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ labelId: string }>;
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const auth = await requireApiToken(request, "kanban:write");
  if (auth instanceof NextResponse) return auth;
  const { labelId } = await params;

  const parsed = updateKanbanLabelSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) return apiValidationError(parsed.error.issues);

  try {
    const label = await kanbanLabelsService.updateLabel(
      auth.workspaceId,
      null,
      labelId,
      parsed.data,
    );
    recordTokenActivity(auth, {
      action: "update",
      entityType: "kanban_label",
      entityId: label.id,
      entityLabel: label.name,
    });
    return apiJsonResponse(label);
  } catch (error) {
    return mapKanbanError(error, "Kanban label");
  }
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const auth = await requireApiToken(request, "kanban:write");
  if (auth instanceof NextResponse) return auth;
  const { labelId } = await params;

  try {
    await kanbanLabelsService.deleteLabel(auth.workspaceId, null, labelId);
    recordTokenActivity(auth, {
      action: "delete",
      entityType: "kanban_label",
      entityId: labelId,
    });
    return apiJsonResponse({ deleted: labelId });
  } catch (error) {
    return mapKanbanError(error, "Kanban label");
  }
}
