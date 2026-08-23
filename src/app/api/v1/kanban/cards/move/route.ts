import { NextResponse, type NextRequest } from "next/server";
import * as kanbanService from "@/lib/services/kanban";
import {
  apiJsonResponse,
  apiValidationError,
  recordTokenActivity,
  requireApiToken,
} from "@/lib/api/token-auth";
import { kanbanCardMoveSchema } from "@/lib/validation/kanban";
import { emitCardMoves } from "@/lib/kanban/card-events";
import { mapKanbanError } from "@/app/api/v1/kanban/errors";

// Static segment, so it wins over /api/v1/kanban/cards/[cardId].

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(request: NextRequest) {
  const auth = await requireApiToken(request, "kanban:write");
  if (auth instanceof NextResponse) return auth;

  const parsed = kanbanCardMoveSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) return apiValidationError(parsed.error.issues);

  try {
    const outcomes = await kanbanService.moveCards(
      auth.workspaceId,
      parsed.data.boardId,
      parsed.data.columns,
    );
    await emitCardMoves(auth.workspaceId, outcomes);
    if (outcomes.length > 0) {
      recordTokenActivity(auth, {
        action: "move",
        entityType: "kanban_card",
        entityId: outcomes.length === 1 ? outcomes[0].cardId : undefined,
      });
    }
    return apiJsonResponse({ moved: outcomes });
  } catch (error) {
    return mapKanbanError(error, "Kanban card");
  }
}
