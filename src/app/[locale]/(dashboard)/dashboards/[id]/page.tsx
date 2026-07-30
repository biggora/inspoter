import { notFound } from "next/navigation";
import { requireAuth } from "@/lib/auth/dal";
import * as dashboardsService from "@/lib/services/dashboards";
import { resolveWidgetData } from "@/lib/services/dashboard-widget-data";
import { DashboardView } from "@/components/dashboards/dashboard-view";
import { listConfigurableTargets } from "@/lib/services/dashboard-widget-targets";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

// Everything the board needs is loaded here, in one server pass: the dashboard
// with its widgets, the sibling dashboards for the tab bar, the initial widget
// payloads, and the option lists the widget config dialogs need (bookmark
// categories, services, servers, mailboxes). The client then refreshes only the
// widget payloads, through GET /api/dashboards/:id/data.
export default async function DashboardPage({ params }: PageProps) {
  const { workspace } = await requireAuth();
  const { id } = await params;

  const dashboard = await dashboardsService.getWithWidgets(id, workspace.id);
  if (!dashboard) notFound();

  const [dashboards, widgetData, targets] = await Promise.all([
    dashboardsService.list(workspace.id),
    resolveWidgetData(workspace.id, dashboard.widgets),
    listConfigurableTargets(workspace.id),
  ]);

  return (
    <DashboardView
      dashboard={dashboard}
      dashboards={dashboards}
      widgetData={widgetData}
      targets={targets}
    />
  );
}
