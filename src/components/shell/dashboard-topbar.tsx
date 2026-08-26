"use client";

import { useTranslations } from "next-intl";

import { usePathname } from "@/i18n/navigation";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { LanguageSwitcher } from "./language-switcher";
import { ThemeToggle } from "./theme-toggle";
import { NotificationIndicators } from "./notification-indicators";
import { OperatorMenu } from "./operator-menu";
import { RouteProgressBar } from "./route-progress";
import {
  MANAGEMENT_NAV_ITEM,
  SECTION_NAV_ITEMS,
  SETTINGS_NAV_ITEM,
} from "./nav-items";
import type { UnreadCountsDto } from "./notifications-api";

// Module-scope so it isn't recomputed on every render.
const ALL_NAV_ITEMS = [
  MANAGEMENT_NAV_ITEM,
  ...SECTION_NAV_ITEMS,
  SETTINGS_NAV_ITEM,
];

// Shared topbar (design.md §3.2.1/§3.2.2, §4.2). One trigger button doubles
// as the desktop icon-rail collapse toggle and the mobile hamburger — the
// shadcn Sidebar's `useSidebar().toggleSidebar()` already dispatches to
// whichever behavior applies at the current breakpoint (Simplicity First: a
// single control instead of two separate "«" / "≡" affordances).
export function DashboardTopbar({
  username,
  unreadCounts,
  hiddenSections = [],
}: {
  username: string;
  unreadCounts: UnreadCountsDto;
  hiddenSections?: string[];
}) {
  const t = useTranslations("shell");
  const pathname = usePathname();
  const activeNavItem = ALL_NAV_ITEMS.find(
    (item) => pathname === item.href || pathname.startsWith(item.href + "/"),
  );
  const title = activeNavItem ? t(activeNavItem.labelKey) : "Inspoter";

  return (
    <header className="sticky top-0 z-10 flex h-[var(--topbar-height)] shrink-0 items-center gap-3 overflow-hidden border-b border-background-200 bg-background-50 px-[var(--space-4)]">
      <SidebarTrigger aria-label={t("toggleNavigation")} />
      <span className="min-w-0 truncate text-sm font-semibold text-foreground">
        {title}
      </span>
      <div className="ml-auto flex shrink-0 items-center gap-1">
        <NotificationIndicators
          initialCounts={unreadCounts}
          hiddenSections={hiddenSections}
        />
        <LanguageSwitcher />
        <ThemeToggle />
        <OperatorMenu username={username} />
      </div>
      <RouteProgressBar />
    </header>
  );
}
