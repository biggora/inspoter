import { NextResponse, type NextRequest } from "next/server";
import { requireAuthWithWorkspaceHeader } from "@/lib/auth/dal";
import { createKanbanLabelSchema } from "@/lib/validation/kanban";
import * as kanbanLabelsService from "@/lib/services/kanban-labels";
import { toErrorResponse } from "@/lib/api/errors";
import { jsonResponse } from "@/lib/api/response";
import { recordActivity } from "@/lib/services/activity";

export async function GET(request: NextRequest) {
  const authResult = await requireAuthWithWorkspaceHeader(request).catch(
    (error) => toErrorResponse(error),
  );
  if (authResult instanceof NextResponse) return authResult;
  const { workspace } = authResult;

  try {
    return jsonResponse(await kanbanLabelsService.listLabels(workspace.id));
  } catch (error) {
    return toErrorResponse(error, workspace.id);
  }
}

export async function POST(request: NextRequest) {
  const authResult = await requireAuthWithWorkspaceHeader(request).catch(
    (error) => toErrorResponse(error),
  );
  if (authResult instanceof NextResponse) return authResult;
  const { operator, workspace } = authResult;

  const body = await request.json().catch(() => null);
  const parsed = createKanbanLabelSchema.safeParse(body);
  if (!parsed.success) {
    return jsonResponse({ error: parsed.error.issues }, { status: 400 });
  }

  try {
    const label = await kanbanLabelsService.createLabel(
      workspace.id,
      operator.id,
      parsed.data,
    );
    recordActivity(workspace.id, {
      operatorId: operator.id,
      operatorName: operator.username,
      action: "create",
      entityType: "kanban_label",
      entityId: label.id,
      entityLabel: label.name,
    });
    return jsonResponse(label, { status: 201 });
  } catch (error) {
    return toErrorResponse(error, workspace.id);
  }
}
