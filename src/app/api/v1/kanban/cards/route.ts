import { NextResponse, type NextRequest } from "next/server";
import * as kanbanService from "@/lib/services/kanban";
import {
  apiJsonResponse,
  apiValidationError,
  recordTokenActivity,
  requireApiToken,
} from "@/lib/api/token-auth";
import {
  kanbanCardSchema,
  kanbanCardSearchQuerySchema,
} from "@/lib/validation/kanban";
import { emitCardCreated } from "@/lib/kanban/card-events";
import { mapKanbanError } from "@/app/api/v1/kanban/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The browser surface has no card list — the board detail carries them — but a
// script wants one, so the search the MCP tool answers is published here too.
export async function GET(request: NextRequest) {
  const auth = await requireApiToken(request, "kanban:read");
  if (auth instanceof NextResponse) return auth;

  const parsed = kanbanCardSearchQuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams),
  );
  if (!parsed.success) return apiValidationError(parsed.error.issues);

  return apiJsonResponse(
    await kanbanService.searchCards(auth.workspaceId, parsed.data),
  );
}

export async function POST(request: NextRequest) {
  const auth = await requireApiToken(request, "kanban:write");
  if (auth instanceof NextResponse) return auth;

  const parsed = kanbanCardSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) return apiValidationError(parsed.error.issues);

  try {
    const card = await kanbanService.createCard(auth.workspaceId, parsed.data);
    recordTokenActivity(auth, {
      action: "create",
      entityType: "kanban_card",
      entityId: card.id,
      entityLabel: card.title,
    });
    emitCardCreated(auth.workspaceId, card);
    return apiJsonResponse(card, { status: 201 });
  } catch (error) {
    return mapKanbanError(error, "Kanban card");
  }
}
