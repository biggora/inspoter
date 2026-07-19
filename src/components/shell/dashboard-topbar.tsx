"use client";

import { usePathname } from "next/navigation";

import { SidebarTrigger } from "@/components/ui/sidebar";
import { ThemeToggle } from "./theme-toggle";
import { OperatorMenu } from "./operator-menu";
import { SECTION_NAV_ITEMS, SETTINGS_NAV_ITEM } from "./nav-items";

// Module-scope so it isn't recomputed on every render.
const ALL_NAV_ITEMS = [...SECTION_NAV_ITEMS, SETTINGS_NAV_ITEM];

// Shared topbar (design.md §3.2.1/§3.2.2, §4.2). One trigger button doubles
// as the desktop icon-rail collapse toggle and the mobile hamburger — the
// shadcn Sidebar's `useSidebar().toggleSidebar()` already dispatches to
// whichever behavior applies at the current breakpoint (Simplicity First: a
// single control instead of two separate "«" / "≡" affordances).
export function DashboardTopbar({ username }: { username: string }) {
  const pathname = usePathname();
  const title =
    ALL_NAV_ITEMS.find(
      (item) => pathname === item.href || pathname.startsWith(item.href + "/"),
    )?.label ?? "Inspoter";

  return (
    <header className="sticky top-0 z-10 flex h-[var(--topbar-height)] shrink-0 items-center gap-3 border-b border-background-200 bg-background-50 px-[var(--space-4)]">
      <SidebarTrigger aria-label="Переключить навигацию" />
      <span className="text-sm font-semibold text-foreground">{title}</span>
      <div className="ml-auto flex items-center gap-1">
        <ThemeToggle />
        <OperatorMenu username={username} />
      </div>
    </header>
  );
}
