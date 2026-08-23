import { NextResponse, type NextRequest } from "next/server";
import * as kanbanService from "@/lib/services/kanban";
import {
  apiJsonResponse,
  apiValidationError,
  recordTokenActivity,
  requireApiToken,
} from "@/lib/api/token-auth";
import { kanbanChecklistItemUpdateSchema } from "@/lib/validation/kanban";
import { mapKanbanError } from "@/app/api/v1/kanban/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ itemId: string }>;
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const auth = await requireApiToken(request, "kanban:write");
  if (auth instanceof NextResponse) return auth;
  const { itemId } = await params;

  const parsed = kanbanChecklistItemUpdateSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) return apiValidationError(parsed.error.issues);

  try {
    const item = await kanbanService.updateChecklistItem(
      auth.workspaceId,
      itemId,
      parsed.data,
    );
    recordTokenActivity(auth, {
      action: "update",
      entityType: "kanban_checklist_item",
      entityId: item.id,
      entityLabel: item.text,
    });
    return apiJsonResponse(item);
  } catch (error) {
    return mapKanbanError(error, "Kanban checklist item");
  }
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const auth = await requireApiToken(request, "kanban:write");
  if (auth instanceof NextResponse) return auth;
  const { itemId } = await params;

  try {
    await kanbanService.deleteChecklistItem(auth.workspaceId, itemId);
    recordTokenActivity(auth, {
      action: "delete",
      entityType: "kanban_checklist_item",
      entityId: itemId,
    });
    return apiJsonResponse({ deleted: itemId });
  } catch (error) {
    return mapKanbanError(error, "Kanban checklist item");
  }
}
