import { requireOperator } from "@/lib/auth/dal";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/shell/app-sidebar";
import { DashboardTopbar } from "@/components/shell/dashboard-topbar";

// AC-SHELL-001..004, AC-AUTH-004 UI (design.md §3.2). `requireOperator()`
// is the authoritative auth gate (redirects to /login when unauthenticated —
// src/lib/auth/dal.ts, backend-dev-owned). Explicitly dynamic: every
// dashboard page depends on the session cookie and must never be statically
// cached across operators.
export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const operator = await requireOperator();

  return (
    <SidebarProvider>
      <AppSidebar username={operator.username} />
      <SidebarInset>
        <DashboardTopbar />
        <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
