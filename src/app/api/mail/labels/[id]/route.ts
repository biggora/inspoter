import { NextResponse, type NextRequest } from "next/server";
import { requireAuthWithWorkspaceHeader } from "@/lib/auth/dal";
import { toErrorResponse } from "@/lib/api/errors";
import { emptyResponse, jsonResponse } from "@/lib/api/response";
import * as mailLabelsService from "@/lib/services/mail-labels";
import { recordActivity } from "@/lib/services/activity";
import { WorkspaceOwnerRequiredError } from "@/lib/services/workspace-auth";
import { updateMailLabelSchema } from "@/lib/validation/mail";

interface RouteContext {
  params: Promise<{ id: string }>;
}

function serviceErrorResponse(error: unknown) {
  if (error instanceof mailLabelsService.MailLabelResourceNotFoundError) {
    return jsonResponse({ error: error.code }, { status: 404 });
  }
  if (error instanceof WorkspaceOwnerRequiredError) {
    return jsonResponse({ error: "WORKSPACE_OWNER_REQUIRED" }, { status: 403 });
  }
  if (error instanceof mailLabelsService.MailLabelNameConflictError) {
    return jsonResponse({ error: error.code }, { status: 409 });
  }
  if (error instanceof mailLabelsService.MailLabelInUseError) {
    return jsonResponse({ error: error.code }, { status: 409 });
  }
  return toErrorResponse(error);
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const authResult = await requireAuthWithWorkspaceHeader(request).catch(
    (error) => toErrorResponse(error),
  );
  if (authResult instanceof NextResponse) return authResult;
  const { id } = await params;

  const body = await request.json().catch(() => null);
  const parsed = updateMailLabelSchema.safeParse(body);
  if (!parsed.success) {
    return jsonResponse({ error: parsed.error.issues }, { status: 400 });
  }

  try {
    const label = await mailLabelsService.updateLabel(
      authResult.workspace.id,
      authResult.operator.id,
      id,
      parsed.data,
    );
    recordActivity(authResult.workspace.id, {
      operatorId: authResult.operator.id,
      operatorName: authResult.operator.username,
      action: "update",
      entityType: "mail_label",
      entityId: id,
    });
    return jsonResponse(label);
  } catch (error) {
    return serviceErrorResponse(error);
  }
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const authResult = await requireAuthWithWorkspaceHeader(request).catch(
    (error) => toErrorResponse(error),
  );
  if (authResult instanceof NextResponse) return authResult;
  const { id } = await params;

  try {
    await mailLabelsService.deleteLabel(
      authResult.workspace.id,
      authResult.operator.id,
      id,
    );
    recordActivity(authResult.workspace.id, {
      operatorId: authResult.operator.id,
      operatorName: authResult.operator.username,
      action: "delete",
      entityType: "mail_label",
      entityId: id,
    });
    return emptyResponse();
  } catch (error) {
    return serviceErrorResponse(error);
  }
}
