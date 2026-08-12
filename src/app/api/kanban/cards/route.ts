import { NextResponse, type NextRequest } from "next/server";
import { requireAuthWithWorkspaceHeader } from "@/lib/auth/dal";
import { kanbanCardSchema } from "@/lib/validation/kanban";
import * as kanbanService from "@/lib/services/kanban";
import { toErrorResponse } from "@/lib/api/errors";
import { jsonResponse } from "@/lib/api/response";
import { recordActivity } from "@/lib/services/activity";
import { emitWebhookEvent } from "@/lib/services/webhook-events";
import { cardWebhookPayload } from "@/lib/kanban/webhook-payload";

export async function POST(request: NextRequest) {
  const authResult = await requireAuthWithWorkspaceHeader(request).catch(
    (error) => toErrorResponse(error),
  );
  if (authResult instanceof NextResponse) return authResult;
  const { operator, workspace } = authResult;

  const body = await request.json().catch(() => null);
  const parsed = kanbanCardSchema.safeParse(body);
  if (!parsed.success) {
    return jsonResponse({ error: parsed.error.issues }, { status: 400 });
  }

  try {
    const card = await kanbanService.createCard(workspace.id, parsed.data);
    recordActivity(workspace.id, {
      operatorId: operator.id,
      operatorName: operator.username,
      action: "create",
      entityType: "kanban_card",
      entityId: card.id,
      entityLabel: card.title,
    });
    void emitWebhookEvent(
      workspace.id,
      "KANBAN_CARD_CREATED",
      cardWebhookPayload(card),
    );
    return jsonResponse(card, { status: 201 });
  } catch (error) {
    return toErrorResponse(error, workspace.id);
  }
}
