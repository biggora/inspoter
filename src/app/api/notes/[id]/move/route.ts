import { NextResponse, type NextRequest } from "next/server";
import { requireAuthWithWorkspaceHeader } from "@/lib/auth/dal";
import { noteMoveSchema } from "@/lib/validation/notes";
import * as notesService from "@/lib/services/notes";
import { toErrorResponse } from "@/lib/api/errors";
import { jsonResponse } from "@/lib/api/response";
import { recordActivity } from "@/lib/services/activity";

interface RouteContext {
  params: Promise<{ id: string }>;
}

// Deliberately no `version` field in noteMoveSchema/moveNote: dragging a note
// between folders in the sidebar tree is a different edit surface than the
// content editor, so it must not conflict with (or be blocked by) a
// concurrent PATCH /api/notes/[id] that is still mid-edit on the note body.
export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const authResult = await requireAuthWithWorkspaceHeader(request).catch(
    (error) => toErrorResponse(error),
  );
  if (authResult instanceof NextResponse) return authResult;
  const { operator, workspace } = authResult;
  const { id } = await params;

  const body = await request.json().catch(() => null);
  const parsed = noteMoveSchema.safeParse(body);
  if (!parsed.success) {
    return jsonResponse({ error: parsed.error.issues }, { status: 400 });
  }

  try {
    const note = await notesService.moveNote(workspace.id, id, parsed.data);
    recordActivity(workspace.id, {
      operatorId: operator.id,
      operatorName: operator.username,
      action: "move",
      entityType: "note",
      entityId: id,
      entityLabel: note.title,
    });
    return jsonResponse(note);
  } catch (error) {
    return toErrorResponse(error, workspace.id);
  }
}
