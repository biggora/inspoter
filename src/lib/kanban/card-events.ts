import * as kanbanService from "@/lib/services/kanban";
import { emitWebhookEvent } from "@/lib/services/webhook-events";
import { cardWebhookPayload } from "@/lib/kanban/webhook-payload";

// Outgoing-webhook fan-out for card writes. It lives here rather than in the
// service because the payload is a wire shape, not a domain concern — and
// here rather than in a route because three surfaces now perform the same
// write: the dashboard's /api/kanban routes, the agent's /api/v1/kanban
// routes, and the MCP tools. A subscriber must see the same events whichever
// one moved the card.

export function emitCardCreated(
  workspaceId: string,
  card: kanbanService.KanbanCardDetail,
): void {
  void emitWebhookEvent(
    workspaceId,
    "KANBAN_CARD_CREATED",
    cardWebhookPayload(card),
  );
}

// Only a card that actually changed column is an event; reordering within a
// column is not something a subscriber cares about, so moveCards() answers
// with the outcomes and this walks exactly those.
export async function emitCardMoves(
  workspaceId: string,
  outcomes: readonly kanbanService.CardMoveOutcome[],
): Promise<void> {
  for (const outcome of outcomes) {
    const card = await kanbanService.getCard(workspaceId, outcome.cardId);
    if (!card) continue;
    const payload = cardWebhookPayload(card, {
      fromColumnId: outcome.fromColumnId,
    });
    void emitWebhookEvent(workspaceId, "KANBAN_CARD_MOVED", payload);
    if (outcome.completed) {
      void emitWebhookEvent(workspaceId, "KANBAN_CARD_COMPLETED", payload);
    }
  }
}
