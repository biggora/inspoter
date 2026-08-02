import { NextResponse, type NextRequest } from "next/server";
import { AlertCategorySource } from "@/generated/prisma/client";
import { requireAuthWithWorkspaceHeader } from "@/lib/auth/dal";
import * as alertsService from "@/lib/services/alerts";
import { toErrorResponse } from "@/lib/api/errors";
import { emptyResponse, jsonResponse } from "@/lib/api/response";
import { recordActivity } from "@/lib/services/activity";
import { alertCategoryAssignmentSchema } from "@/lib/validation/alerts";

interface RouteContext {
  params: Promise<{ id: string }>;
}

// Reassigning an alert's category. The source is hard-coded to MANUAL: this
// route is only reachable with an operator session, and a MANUAL assignment is
// what a later automatic classifier must not overwrite.
export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const authResult = await requireAuthWithWorkspaceHeader(request).catch(
    (error) => toErrorResponse(error),
  );
  if (authResult instanceof NextResponse) return authResult;
  const { operator, workspace } = authResult;
  const { id } = await params;

  const body = await request.json().catch(() => null);
  const parsed = alertCategoryAssignmentSchema.safeParse(body);
  if (!parsed.success) {
    return jsonResponse({ error: parsed.error.issues }, { status: 400 });
  }

  try {
    const alert = await alertsService.setCategory(
      id,
      workspace.id,
      parsed.data.alertCategoryId,
      AlertCategorySource.MANUAL,
    );
    recordActivity(workspace.id, {
      operatorId: operator.id,
      operatorName: operator.username,
      action: "update",
      entityType: "alert",
      entityId: id,
    });
    return jsonResponse(alert);
  } catch (error) {
    return toErrorResponse(error, workspace.id);
  }
}

// AC-ALR-008.
export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const authResult = await requireAuthWithWorkspaceHeader(request).catch(
    (error) => toErrorResponse(error),
  );
  if (authResult instanceof NextResponse) return authResult;
  const { operator, workspace } = authResult;
  const { id } = await params;

  try {
    await alertsService.remove(id, workspace.id);
    recordActivity(workspace.id, {
      operatorId: operator.id,
      operatorName: operator.username,
      action: "delete",
      entityType: "alert",
      entityId: id,
    });
    return emptyResponse();
  } catch (error) {
    return toErrorResponse(error, workspace.id);
  }
}
