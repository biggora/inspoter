import { cookies } from "next/headers";
import { requireAuth } from "@/lib/auth/dal";
import { SkipToContentLink } from "@/components/shell/skip-to-content-link";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/shell/app-sidebar";
import { DashboardTopbar } from "@/components/shell/dashboard-topbar";
import { RouteProgressProvider } from "@/components/shell/route-progress";
import { WebMcpGlobalTools } from "@/components/shell/web-mcp-global-tools";
import { IndicatorStoreProvider } from "@/components/shell/indicator-store-provider";
import { getIndicatorState } from "@/lib/services/indicator-counts";

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
  // Seeds every indicator — topbar badges and the sidebar footer status block
  // alike — so they are right on first paint. The client store keeps them
  // current from there (indicator-store-provider.tsx), which is what the
  // footer previously lacked: this layout does not re-render on client-side
  // navigation, so its numbers used to freeze until a full page load.
  const indicators = await getIndicatorState(workspace.id);

  return (
    <SidebarProvider defaultOpen={sidebarOpen}>
      <IndicatorStoreProvider workspaceId={workspace.id} initial={indicators}>
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
          />
          <SidebarInset>
            <DashboardTopbar
              username={operator.username}
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
      </IndicatorStoreProvider>
    </SidebarProvider>
  );
}
