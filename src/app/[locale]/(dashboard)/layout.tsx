import { cookies } from "next/headers";
import { requireAuth } from "@/lib/auth/dal";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/shell/app-sidebar";
import { DashboardTopbar } from "@/components/shell/dashboard-topbar";
import { RouteProgressProvider } from "@/components/shell/route-progress";

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

  return (
    <SidebarProvider defaultOpen={sidebarOpen}>
      <RouteProgressProvider>
        <AppSidebar
          workspaceName={workspace.name}
          workspaceId={workspace.id}
          hiddenSections={workspace.hiddenSections}
        />
        <SidebarInset>
          <DashboardTopbar username={operator.username} />
          <main className="w-full flex-1 p-6">{children}</main>
        </SidebarInset>
      </RouteProgressProvider>
    </SidebarProvider>
  );
}
