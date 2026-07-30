import { NextResponse, type NextRequest } from "next/server";
import { requireAuthWithWorkspaceHeader } from "@/lib/auth/dal";
import { widgetUpdateSchema } from "@/lib/validation/dashboards";
import * as dashboardsService from "@/lib/services/dashboards";
import { toErrorResponse } from "@/lib/api/errors";
import { emptyResponse, jsonResponse } from "@/lib/api/response";
import { recordActivity } from "@/lib/services/activity";

interface RouteContext {
  params: Promise<{ id: string; widgetId: string }>;
}

// Only `config` is patchable here. Position and size travel through
// PATCH /api/dashboards/:id/layout instead, because a single tile's new
// rectangle is only legal in the context of the whole layout.
export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const authResult = await requireAuthWithWorkspaceHeader(request).catch(
    (error) => toErrorResponse(error),
  );
  if (authResult instanceof NextResponse) return authResult;
  const { operator, workspace } = authResult;
  const { id, widgetId } = await params;

  const body = await request.json().catch(() => null);
  const parsed = widgetUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return jsonResponse({ error: parsed.error.issues }, { status: 400 });
  }

  try {
    const widget = await dashboardsService.updateWidgetConfig(
      widgetId,
      id,
      workspace.id,
      parsed.data.config,
    );
    recordActivity(workspace.id, {
      operatorId: operator.id,
      operatorName: operator.username,
      action: "update",
      entityType: "dashboardWidget",
      entityId: widgetId,
      entityLabel: widget.kind,
    });
    return jsonResponse(widget);
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
  const { id, widgetId } = await params;

  try {
    await dashboardsService.removeWidget(widgetId, id, workspace.id);
    recordActivity(workspace.id, {
      operatorId: operator.id,
      operatorName: operator.username,
      action: "delete",
      entityType: "dashboardWidget",
      entityId: widgetId,
      entityLabel: null,
    });
    return emptyResponse();
  } catch (error) {
    return toErrorResponse(error, workspace.id);
  }
}
