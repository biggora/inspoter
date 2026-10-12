import { getLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { requireWorkspaceBySlug } from "@/lib/auth/dal";
import * as dashboardsService from "@/lib/services/dashboards";
import { toWorkspacePath } from "@/lib/workspace-path";
import { DashboardsEmptyState } from "@/components/dashboards/dashboards-empty-state";

export const dynamic = "force-dynamic";

// The section index is a router, not a page: a workspace that has dashboards
// goes straight to its start dashboard, and one that has none gets the create
// prompt. There is deliberately no separate "list of dashboards" screen — the
// tab bar on a dashboard is that list.
export default async function DashboardsPage({
  params,
}: {
  params: Promise<{ workspace: string }>;
}) {
  const { workspace } = await requireWorkspaceBySlug((await params).workspace);
  const landing = await dashboardsService.getLandingDashboard(workspace.id);

  if (landing) {
    redirect({
      // Server redirect() is not workspace-aware: pass the full path.
      href: toWorkspacePath(workspace.slug, `/dashboards/${landing.id}`),
      locale: await getLocale(),
    });
  }

  return <DashboardsEmptyState />;
}
