import { NextResponse, type NextRequest } from "next/server";
import {
  apiJsonResponse,
  apiValidationError,
  recordTokenActivity,
  requireApiToken,
} from "@/lib/api/token-auth";
import * as kanbanLabelsService from "@/lib/services/kanban-labels";
import { createKanbanLabelSchema } from "@/lib/validation/kanban";
import { mapKanbanError } from "@/app/api/v1/kanban/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireApiToken(request, "kanban:read");
  if (auth instanceof NextResponse) return auth;

  return apiJsonResponse(
    await kanbanLabelsService.listLabels(auth.workspaceId),
  );
}

export async function POST(request: NextRequest) {
  const auth = await requireApiToken(request, "kanban:write");
  if (auth instanceof NextResponse) return auth;

  const parsed = createKanbanLabelSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) return apiValidationError(parsed.error.issues);

  try {
    // A token has no operator behind it, so the membership check is skipped
    // and the token's own workspace scope is the authority.
    const label = await kanbanLabelsService.createLabel(
      auth.workspaceId,
      null,
      parsed.data,
    );
    recordTokenActivity(auth, {
      action: "create",
      entityType: "kanban_label",
      entityId: label.id,
      entityLabel: label.name,
    });
    return apiJsonResponse(label, { status: 201 });
  } catch (error) {
    return mapKanbanError(error, "Kanban label");
  }
}
