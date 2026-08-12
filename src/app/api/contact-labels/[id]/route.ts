import { NextResponse, type NextRequest } from "next/server";
import { requireAuthWithWorkspaceHeader } from "@/lib/auth/dal";
import { toErrorResponse } from "@/lib/api/errors";
import { emptyResponse, jsonResponse } from "@/lib/api/response";
import { mapContactError } from "@/app/api/contacts/errors";
import * as contactLabelsService from "@/lib/services/contact-labels";
import { recordActivity } from "@/lib/services/activity";
import { contactLabelUpdateSchema } from "@/lib/validation/contacts";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const authResult = await requireAuthWithWorkspaceHeader(request).catch(
    (error) => toErrorResponse(error),
  );
  if (authResult instanceof NextResponse) return authResult;
  const { operator, workspace } = authResult;
  const { id } = await params;

  const body = await request.json().catch(() => null);
  const parsed = contactLabelUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return jsonResponse({ error: parsed.error.issues }, { status: 400 });
  }

  try {
    const label = await contactLabelsService.updateLabel(
      workspace.id,
      operator.id,
      id,
      parsed.data,
    );
    recordActivity(workspace.id, {
      operatorId: operator.id,
      operatorName: operator.username,
      action: "update",
      entityType: "contact_label",
      entityId: id,
      entityLabel: label.name,
    });
    return jsonResponse(label);
  } catch (error) {
    return mapContactError(error, workspace.id);
  }
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const authResult = await requireAuthWithWorkspaceHeader(request).catch(
    (error) => toErrorResponse(error),
  );
  if (authResult instanceof NextResponse) return authResult;
  const { operator, workspace } = authResult;
  const { id } = await params;

  try {
    await contactLabelsService.deleteLabel(workspace.id, operator.id, id);
    recordActivity(workspace.id, {
      operatorId: operator.id,
      operatorName: operator.username,
      action: "delete",
      entityType: "contact_label",
      entityId: id,
      entityLabel: null,
    });
    return emptyResponse();
  } catch (error) {
    return mapContactError(error, workspace.id);
  }
}
