import { NextResponse, type NextRequest } from "next/server";
import { requireAuthWithWorkspaceHeader } from "@/lib/auth/dal";
import { toErrorResponse } from "@/lib/api/errors";
import { emptyResponse, jsonResponse } from "@/lib/api/response";
import * as serviceLabelsService from "@/lib/services/service-labels";
import { recordActivity } from "@/lib/services/activity";
import { WorkspaceMemberRequiredError } from "@/lib/services/workspace-auth";
import { updateServiceLabelSchema } from "@/lib/validation/services";

interface RouteContext {
  params: Promise<{ id: string }>;
}

function serviceErrorResponse(error: unknown, workspaceId?: string) {
  if (error instanceof serviceLabelsService.ServiceLabelNotFoundError) {
    return jsonResponse({ error: error.code }, { status: 404 });
  }
  if (error instanceof WorkspaceMemberRequiredError) {
    return jsonResponse(
      { error: "WORKSPACE_MEMBER_REQUIRED" },
      { status: 403 },
    );
  }
  if (error instanceof serviceLabelsService.ServiceLabelNameConflictError) {
    return jsonResponse({ error: error.code }, { status: 409 });
  }
  return toErrorResponse(error, workspaceId);
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const authResult = await requireAuthWithWorkspaceHeader(request).catch(
    (error) => toErrorResponse(error),
  );
  if (authResult instanceof NextResponse) return authResult;
  const { id } = await params;

  const body = await request.json().catch(() => null);
  const parsed = updateServiceLabelSchema.safeParse(body);
  if (!parsed.success) {
    return jsonResponse({ error: parsed.error.issues }, { status: 400 });
  }

  try {
    const label = await serviceLabelsService.updateLabel(
      authResult.workspace.id,
      authResult.operator.id,
      id,
      parsed.data,
    );
    recordActivity(authResult.workspace.id, {
      operatorId: authResult.operator.id,
      operatorName: authResult.operator.username,
      action: "update",
      entityType: "service_label",
      entityId: id,
      entityLabel: label.name,
    });
    return jsonResponse(label);
  } catch (error) {
    return serviceErrorResponse(error, authResult.workspace.id);
  }
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const authResult = await requireAuthWithWorkspaceHeader(request).catch(
    (error) => toErrorResponse(error),
  );
  if (authResult instanceof NextResponse) return authResult;
  const { id } = await params;

  try {
    await serviceLabelsService.deleteLabel(
      authResult.workspace.id,
      authResult.operator.id,
      id,
    );
    recordActivity(authResult.workspace.id, {
      operatorId: authResult.operator.id,
      operatorName: authResult.operator.username,
      action: "delete",
      entityType: "service_label",
      entityId: id,
    });
    return emptyResponse();
  } catch (error) {
    return serviceErrorResponse(error, authResult.workspace.id);
  }
}
