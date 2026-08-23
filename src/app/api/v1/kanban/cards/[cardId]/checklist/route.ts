import { NextResponse, type NextRequest } from "next/server";
import * as kanbanService from "@/lib/services/kanban";
import {
  apiJsonResponse,
  apiNotFound,
  apiValidationError,
  recordTokenActivity,
  requireApiToken,
} from "@/lib/api/token-auth";
import { kanbanChecklistItemSchema } from "@/lib/validation/kanban";
import { mapKanbanError } from "@/app/api/v1/kanban/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ cardId: string }>;
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  const auth = await requireApiToken(request, "kanban:read");
  if (auth instanceof NextResponse) return auth;
  const { cardId } = await params;

  const card = await kanbanService.getCard(auth.workspaceId, cardId);
  if (!card) return apiNotFound("Kanban card");
  return apiJsonResponse(
    await kanbanService.listChecklist(auth.workspaceId, cardId),
  );
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  const auth = await requireApiToken(request, "kanban:write");
  if (auth instanceof NextResponse) return auth;
  const { cardId } = await params;

  const parsed = kanbanChecklistItemSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) return apiValidationError(parsed.error.issues);

  try {
    const item = await kanbanService.addChecklistItem(
      auth.workspaceId,
      cardId,
      parsed.data,
    );
    recordTokenActivity(auth, {
      action: "create",
      entityType: "kanban_checklist_item",
      entityId: item.id,
      entityLabel: item.text,
    });
    return apiJsonResponse(item, { status: 201 });
  } catch (error) {
    return mapKanbanError(error, "Kanban card");
  }
}
