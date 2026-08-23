import { NextResponse, type NextRequest } from "next/server";
import { requireAuthWithWorkspaceHeader } from "@/lib/auth/dal";
import { kanbanCardMoveSchema } from "@/lib/validation/kanban";
import * as kanbanService from "@/lib/services/kanban";
import { toErrorResponse } from "@/lib/api/errors";
import { emptyResponse, jsonResponse } from "@/lib/api/response";
import { recordActivity } from "@/lib/services/activity";
import { emitCardMoves } from "@/lib/kanban/card-events";

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

    await emitCardMoves(workspace.id, outcomes);

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
