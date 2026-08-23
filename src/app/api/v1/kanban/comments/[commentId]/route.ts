import { NextResponse, type NextRequest } from "next/server";
import * as kanbanService from "@/lib/services/kanban";
import {
  apiJsonResponse,
  recordTokenActivity,
  requireApiToken,
} from "@/lib/api/token-auth";
import { mapKanbanError } from "@/app/api/v1/kanban/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ commentId: string }>;
}

// Only the author may remove their own comment, so a token can delete only
// what it wrote; anything else answers the same non-disclosing 404 a foreign
// id would.
export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const auth = await requireApiToken(request, "kanban:write");
  if (auth instanceof NextResponse) return auth;
  const { commentId } = await params;

  try {
    await kanbanService.deleteComment(
      auth.workspaceId,
      commentId,
      auth.tokenId,
    );
    recordTokenActivity(auth, {
      action: "delete",
      entityType: "kanban_comment",
      entityId: commentId,
    });
    return apiJsonResponse({ deleted: commentId });
  } catch (error) {
    return mapKanbanError(error, "Kanban comment");
  }
}
