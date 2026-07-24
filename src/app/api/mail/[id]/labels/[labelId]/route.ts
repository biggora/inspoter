import { NextResponse, type NextRequest } from "next/server";
import { requireAuthWithWorkspaceHeader } from "@/lib/auth/dal";
import { toErrorResponse } from "@/lib/api/errors";
import { emptyResponse, jsonResponse } from "@/lib/api/response";
import * as mailLabelAssignmentsService from "@/lib/services/mail-label-assignments";

interface RouteContext {
  params: Promise<{ id: string; labelId: string }>;
}

function serviceErrorResponse(error: unknown) {
  if (
    error instanceof
    mailLabelAssignmentsService.MailLabelAssignmentResourceNotFoundError
  ) {
    return jsonResponse({ error: error.code }, { status: 404 });
  }
  return toErrorResponse(error);
}

export async function PUT(request: NextRequest, { params }: RouteContext) {
  const authResult = await requireAuthWithWorkspaceHeader(request).catch(
    (error) => toErrorResponse(error),
  );
  if (authResult instanceof NextResponse) return authResult;
  const { id, labelId } = await params;

  try {
    const label = await mailLabelAssignmentsService.assignLabel(
      authResult.workspace.id,
      id,
      labelId,
    );
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
  const { id, labelId } = await params;

  try {
    await mailLabelAssignmentsService.removeLabel(
      authResult.workspace.id,
      id,
      labelId,
    );
    return emptyResponse();
  } catch (error) {
    return serviceErrorResponse(error);
  }
}
