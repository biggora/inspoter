import { NextResponse, type NextRequest } from "next/server";
import { requireAuthWithWorkspaceHeader } from "@/lib/auth/dal";
import { kanbanChecklistItemSchema } from "@/lib/validation/kanban";
import * as kanbanService from "@/lib/services/kanban";
import { toErrorResponse } from "@/lib/api/errors";
import { jsonResponse } from "@/lib/api/response";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  const authResult = await requireAuthWithWorkspaceHeader(request).catch(
    (error) => toErrorResponse(error),
  );
  if (authResult instanceof NextResponse) return authResult;
  const { workspace } = authResult;
  const { id } = await params;

  try {
    return jsonResponse(await kanbanService.listChecklist(workspace.id, id));
  } catch (error) {
    return toErrorResponse(error, workspace.id);
  }
}

// Checklist items and comments are card-internal detail: they are not recorded
// in the activity log, which tracks the lifecycle of the entities themselves.
export async function POST(request: NextRequest, { params }: RouteContext) {
  const authResult = await requireAuthWithWorkspaceHeader(request).catch(
    (error) => toErrorResponse(error),
  );
  if (authResult instanceof NextResponse) return authResult;
  const { workspace } = authResult;
  const { id } = await params;

  const body = await request.json().catch(() => null);
  const parsed = kanbanChecklistItemSchema.safeParse(body);
  if (!parsed.success) {
    return jsonResponse({ error: parsed.error.issues }, { status: 400 });
  }

  try {
    const item = await kanbanService.addChecklistItem(
      workspace.id,
      id,
      parsed.data,
    );
    return jsonResponse(item, { status: 201 });
  } catch (error) {
    return toErrorResponse(error, workspace.id);
  }
}
