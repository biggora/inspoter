import { NextResponse, type NextRequest } from "next/server";
import { requireAuthWithWorkspaceHeader } from "@/lib/auth/dal";
import { kanbanCardMoveSchema } from "@/lib/validation/kanban";
import * as kanbanService from "@/lib/services/kanban";
import { toErrorResponse } from "@/lib/api/errors";
import { emptyResponse, jsonResponse } from "@/lib/api/response";
import { recordActivity } from "@/lib/services/activity";
import { emitWebhookEvent } from "@/lib/services/webhook-events";
import { cardWebhookPayload } from "@/lib/kanban/webhook-payload";

export async function PATCH(request: NextRequest) {
  const authResult = await requireAuthWithWorkspaceHeader(request).catch(
    (error) => toErrorResponse(error),
  );
  if (authResult instanceof NextResponse) return authResult;
  const { operator, workspace } = authResult;

  const body = await request.json().catch(() => null);
  const parsed = kanbanCardMoveSchema.safeParse(body);
  if (!parsed.success) {
    return jsonResponse({ error: parsed.error.issues }, { status: 400 });
  }

  try {
    const outcomes = await kanbanService.moveCards(
      workspace.id,
      parsed.data.boardId,
      parsed.data.columns,
    );

    // Only a card that actually changed column is an event; reordering
    // within a column is not something a subscriber cares about.
    for (const outcome of outcomes) {
      const card = await kanbanService.getCard(workspace.id, outcome.cardId);
      if (!card) continue;
      const payload = cardWebhookPayload(card, {
        fromColumnId: outcome.fromColumnId,
      });
      void emitWebhookEvent(workspace.id, "KANBAN_CARD_MOVED", payload);
      if (outcome.completed) {
        void emitWebhookEvent(workspace.id, "KANBAN_CARD_COMPLETED", payload);
      }
    }

    if (outcomes.length > 0) {
      recordActivity(workspace.id, {
        operatorId: operator.id,
        operatorName: operator.username,
        action: "move",
        entityType: "kanban_card",
        entityId: outcomes.length === 1 ? outcomes[0].cardId : null,
        entityLabel: null,
      });
    }
    return emptyResponse();
  } catch (error) {
    return toErrorResponse(error, workspace.id);
  }
}
