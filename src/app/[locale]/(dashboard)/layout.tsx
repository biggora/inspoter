import { cookies } from "next/headers";
import { requireAuth } from "@/lib/auth/dal";
import { SkipToContentLink } from "@/components/shell/skip-to-content-link";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/shell/app-sidebar";
import { DashboardTopbar } from "@/components/shell/dashboard-topbar";
import { RouteProgressProvider } from "@/components/shell/route-progress";
import { WebMcpGlobalTools } from "@/components/shell/web-mcp-global-tools";
import {
  getSidebarHealth,
  getUnreadCounts,
} from "@/lib/services/notification-counts";

export const dynamic = "force-dynamic";

// Must match SIDEBAR_COOKIE_NAME in @/components/ui/sidebar — kept as a
// literal because that constant lives in a "use client" module and can't
// be imported into a Server Component (it resolves to a client reference,
// not the string, so cookieStore.get() would silently never match).
const SIDEBAR_COOKIE_NAME = "sidebar_state";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { operator, workspace } = await requireAuth();
  const cookieStore = await cookies();
  const sidebarOpen = cookieStore.get(SIDEBAR_COOKIE_NAME)?.value !== "false";
  // Seeds the topbar badges so they are right on first paint; the client keeps
  // them current from there (notification-indicators.tsx).
  const unreadCounts = await getUnreadCounts(workspace.id);
  // Sidebar footer status block (design.md §3.2) — same story: correct on
  // first paint, refreshed by full route loads.
  const sidebarHealth = await getSidebarHealth(workspace.id);

  return (
    <SidebarProvider defaultOpen={sidebarOpen}>
      {/* First tab stop (critique 2026-08-29, P1): lets keyboard operators
          jump past the ~20 nav links and topbar straight to <main>. */}
      <SkipToContentLink targetId="main-content" />
      <RouteProgressProvider>
        {/* Outside the `{children}` slot on purpose — stays mounted across
            client-side navigation, so its tools survive a route change. */}
        <WebMcpGlobalTools />
        <AppSidebar
          workspaceName={workspace.name}
          workspaceId={workspace.id}
          hiddenSections={workspace.hiddenSections}
          health={sidebarHealth}
        />
        <SidebarInset>
          <DashboardTopbar
            username={operator.username}
            unreadCounts={unreadCounts}
            hiddenSections={workspace.hiddenSections}
          />
          <main
            id="main-content"
            tabIndex={-1}
            className="w-full min-w-0 flex-1 overflow-x-hidden p-4 focus:outline-none sm:p-6"
          >
            {children}
          </main>
        </SidebarInset>
      </RouteProgressProvider>
    </SidebarProvider>
  );
}
