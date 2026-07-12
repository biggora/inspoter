import { SidebarTrigger } from "@/components/ui/sidebar";

// Shared topbar (design.md §3.2.1/§3.2.2). One trigger button doubles as the
// desktop icon-rail collapse toggle and the mobile hamburger — the shadcn
// Sidebar's `useSidebar().toggleSidebar()` already dispatches to whichever
// behavior applies at the current breakpoint (Simplicity First: a single
// control instead of two separate "«" / "≡" affordances).
export function DashboardTopbar() {
  return (
    <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-3 border-b border-border bg-background px-4">
      <SidebarTrigger aria-label="Toggle navigation" />
      <span className="text-sm font-semibold text-foreground">inspot</span>
    </header>
  );
}
