import { NextResponse, type NextRequest } from "next/server";
import { requireAuthWithWorkspaceHeader } from "@/lib/auth/dal";
import { kanbanChecklistItemUpdateSchema } from "@/lib/validation/kanban";
import * as kanbanService from "@/lib/services/kanban";
import { toErrorResponse } from "@/lib/api/errors";
import { emptyResponse, jsonResponse } from "@/lib/api/response";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const authResult = await requireAuthWithWorkspaceHeader(request).catch(
    (error) => toErrorResponse(error),
  );
  if (authResult instanceof NextResponse) return authResult;
  const { workspace } = authResult;
  const { id } = await params;

  const body = await request.json().catch(() => null);
  const parsed = kanbanChecklistItemUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return jsonResponse({ error: parsed.error.issues }, { status: 400 });
  }

  try {
    return jsonResponse(
      await kanbanService.updateChecklistItem(workspace.id, id, parsed.data),
    );
  } catch (error) {
    return toErrorResponse(error, workspace.id);
  }
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const authResult = await requireAuthWithWorkspaceHeader(request).catch(
    (error) => toErrorResponse(error),
  );
  if (authResult instanceof NextResponse) return authResult;
  const { workspace } = authResult;
  const { id } = await params;

  try {
    await kanbanService.deleteChecklistItem(workspace.id, id);
    return emptyResponse();
  } catch (error) {
    return toErrorResponse(error, workspace.id);
  }
}
