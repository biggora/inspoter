import { NextResponse, type NextRequest } from "next/server";
import * as kanbanService from "@/lib/services/kanban";
import {
  apiJsonResponse,
  apiNotFound,
  apiValidationError,
  recordTokenActivity,
  requireApiToken,
} from "@/lib/api/token-auth";
import { kanbanCardUpdateSchema } from "@/lib/validation/kanban";
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
  return apiJsonResponse(card);
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const auth = await requireApiToken(request, "kanban:write");
  if (auth instanceof NextResponse) return auth;
  const { cardId } = await params;

  const parsed = kanbanCardUpdateSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) return apiValidationError(parsed.error.issues);

  try {
    const card = await kanbanService.updateCard(
      auth.workspaceId,
      cardId,
      parsed.data,
    );
    recordTokenActivity(auth, {
      action: "update",
      entityType: "kanban_card",
      entityId: card.id,
      entityLabel: card.title,
    });
    return apiJsonResponse(card);
  } catch (error) {
    return mapKanbanError(error, "Kanban card");
  }
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const auth = await requireApiToken(request, "kanban:write");
  if (auth instanceof NextResponse) return auth;
  const { cardId } = await params;

  try {
    await kanbanService.deleteCard(auth.workspaceId, cardId);
    recordTokenActivity(auth, {
      action: "delete",
      entityType: "kanban_card",
      entityId: cardId,
    });
    return apiJsonResponse({ deleted: cardId });
  } catch (error) {
    return mapKanbanError(error, "Kanban card");
  }
}
