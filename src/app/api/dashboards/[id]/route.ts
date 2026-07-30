import { NextResponse, type NextRequest } from "next/server";
import { requireAuthWithWorkspaceHeader } from "@/lib/auth/dal";
import { dashboardUpdateSchema } from "@/lib/validation/dashboards";
import * as dashboardsService from "@/lib/services/dashboards";
import { toErrorResponse } from "@/lib/api/errors";
import { emptyResponse, jsonResponse } from "@/lib/api/response";
import { recordActivity } from "@/lib/services/activity";

interface RouteContext {
  params: Promise<{ id: string }>;
}

// PATCH carries a rename, a promotion to start dashboard, or both — the two are
// separate service calls because promotion has to clear the previous flag in the
// same transaction.
export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const authResult = await requireAuthWithWorkspaceHeader(request).catch(
    (error) => toErrorResponse(error),
  );
  if (authResult instanceof NextResponse) return authResult;
  const { operator, workspace } = authResult;
  const { id } = await params;

  const body = await request.json().catch(() => null);
  const parsed = dashboardUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return jsonResponse({ error: parsed.error.issues }, { status: 400 });
  }
  if (parsed.data.name === undefined && parsed.data.isDefault === undefined) {
    return jsonResponse({ error: "NOTHING_TO_UPDATE" }, { status: 400 });
  }

  // Both service calls verify the dashboard belongs to this workspace and throw
  // DashboardNotFoundError otherwise, so no separate existence check is needed.
  try {
    let dashboard =
      parsed.data.name === undefined
        ? null
        : await dashboardsService.rename(id, workspace.id, parsed.data.name);
    if (parsed.data.isDefault) {
      dashboard = await dashboardsService.setDefault(id, workspace.id);
    }

    recordActivity(workspace.id, {
      operatorId: operator.id,
      operatorName: operator.username,
      action: "update",
      entityType: "dashboard",
      entityId: id,
      entityLabel: dashboard?.name ?? null,
    });
    return jsonResponse(dashboard);
  } catch (error) {
    return toErrorResponse(error, workspace.id);
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
    await dashboardsService.remove(id, workspace.id);
    recordActivity(workspace.id, {
      operatorId: operator.id,
      operatorName: operator.username,
      action: "delete",
      entityType: "dashboard",
      entityId: id,
      entityLabel: null,
    });
    return emptyResponse();
  } catch (error) {
    return toErrorResponse(error, workspace.id);
  }
}
