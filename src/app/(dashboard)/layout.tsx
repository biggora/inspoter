import { requireAuth } from "@/lib/auth/dal";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/shell/app-sidebar";
import { DashboardTopbar } from "@/components/shell/dashboard-topbar";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { operator, workspace } = await requireAuth();

  return (
    <SidebarProvider>
      <AppSidebar
        username={operator.username}
        workspaceName={workspace.name}
        workspaceId={workspace.id}
      />
      <SidebarInset>
        <DashboardTopbar />
        <main className="mx-auto w-full max-w-[1400px] flex-1 p-6">
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
