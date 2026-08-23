import { NextResponse, type NextRequest } from "next/server";
import * as kanbanService from "@/lib/services/kanban";
import {
  apiJsonResponse,
  apiValidationError,
  recordTokenActivity,
  requireApiToken,
} from "@/lib/api/token-auth";
import { kanbanCardLabelsSchema } from "@/lib/validation/kanban";
import { mapKanbanError } from "@/app/api/v1/kanban/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ cardId: string }>;
}

// PUT rather than PATCH: the label set is replaced wholesale, matching the
// browser route next door.
export async function PUT(request: NextRequest, { params }: RouteContext) {
  const auth = await requireApiToken(request, "kanban:write");
  if (auth instanceof NextResponse) return auth;
  const { cardId } = await params;

  const parsed = kanbanCardLabelsSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) return apiValidationError(parsed.error.issues);

  try {
    const card = await kanbanService.replaceCardLabels(
      auth.workspaceId,
      cardId,
      parsed.data.labelIds,
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
