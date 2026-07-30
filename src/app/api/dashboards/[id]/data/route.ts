import { NextResponse, type NextRequest } from "next/server";
import { requireAuthWithWorkspaceHeader } from "@/lib/auth/dal";
import * as dashboardsService from "@/lib/services/dashboards";
import { resolveWidgetData } from "@/lib/services/dashboard-widget-data";
import { toErrorResponse } from "@/lib/api/errors";
import { jsonResponse } from "@/lib/api/response";

interface RouteContext {
  params: Promise<{ id: string }>;
}

// The dashboard's periodic refresh: one request returns the payload of every
// widget on the board, keyed by widget id. Deliberately not one endpoint per
// widget — a ten-widget dashboard polling every minute would otherwise cost ten
// requests a minute for data that all comes from the same workspace.
//
// No activity is recorded: this is a read that fires on a timer, and journalling
// it would bury the Activity page.
export async function GET(request: NextRequest, { params }: RouteContext) {
  const authResult = await requireAuthWithWorkspaceHeader(request).catch(
    (error) => toErrorResponse(error),
  );
  if (authResult instanceof NextResponse) return authResult;
  const { workspace } = authResult;
  const { id } = await params;

  try {
    const dashboard = await dashboardsService.getWithWidgets(id, workspace.id);
    if (!dashboard) throw new dashboardsService.DashboardNotFoundError();
    return jsonResponse({
      widgetData: await resolveWidgetData(workspace.id, dashboard.widgets),
    });
  } catch (error) {
    return toErrorResponse(error, workspace.id);
  }
}
