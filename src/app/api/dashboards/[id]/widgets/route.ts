import { NextResponse, type NextRequest } from "next/server";
import { requireAuthWithWorkspaceHeader } from "@/lib/auth/dal";
import { widgetCreateSchema } from "@/lib/validation/dashboards";
import * as dashboardsService from "@/lib/services/dashboards";
import { toErrorResponse } from "@/lib/api/errors";
import { jsonResponse } from "@/lib/api/response";
import { recordActivity } from "@/lib/services/activity";

interface RouteContext {
  params: Promise<{ id: string }>;
}

// The grid position is chosen server-side (findFreeSlot) rather than sent by the
// client: "where does a new tile go" is a property of the current layout, which
// the server already has to read to validate anything.
export async function POST(request: NextRequest, { params }: RouteContext) {
  const authResult = await requireAuthWithWorkspaceHeader(request).catch(
    (error) => toErrorResponse(error),
  );
  if (authResult instanceof NextResponse) return authResult;
  const { operator, workspace } = authResult;
  const { id } = await params;

  const body = await request.json().catch(() => null);
  const parsed = widgetCreateSchema.safeParse(body);
  if (!parsed.success) {
    return jsonResponse({ error: parsed.error.issues }, { status: 400 });
  }

  try {
    const widget = await dashboardsService.addWidget(id, workspace.id, {
      kind: parsed.data.kind,
      config: parsed.data.config,
    });
    recordActivity(workspace.id, {
      operatorId: operator.id,
      operatorName: operator.username,
      action: "create",
      entityType: "dashboardWidget",
      entityId: widget.id,
      entityLabel: widget.kind,
    });
    return jsonResponse(widget, { status: 201 });
  } catch (error) {
    return toErrorResponse(error, workspace.id);
  }
}
