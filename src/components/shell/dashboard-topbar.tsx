"use client";

import { usePathname } from "next/navigation";

import { SidebarTrigger } from "@/components/ui/sidebar";
import { ThemeToggle } from "./theme-toggle";
import { OperatorMenu } from "./operator-menu";

// Shared topbar (design.md §3.2.1/§3.2.2, §4.2). One trigger button doubles
// as the desktop icon-rail collapse toggle and the mobile hamburger — the
// shadcn Sidebar's `useSidebar().toggleSidebar()` already dispatches to
// whichever behavior applies at the current breakpoint (Simplicity First: a
// single control instead of two separate "«" / "≡" affordances).
export function DashboardTopbar({ username }: { username: string }) {
  const pathname = usePathname();
  const title =
    {
      "/bookmarks": "Закладки",
      "/settings": "Настройки",
      "/logs": "Логи",
      "/domains": "Домены",
      "/servers": "Серверы",
      "/services": "Сервисы",
      "/mail": "Почта",
      "/messages": "Сообщения",
      "/alerts": "Оповещения",
    }[pathname] ?? "Inspoter";

  return (
    <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-3 border-b border-background-200 bg-background-50 px-4">
      <SidebarTrigger aria-label="Переключить навигацию" />
      <span className="text-sm font-semibold text-foreground">{title}</span>
      <div className="ml-auto flex items-center gap-1">
        <ThemeToggle />
        <OperatorMenu username={username} />
      </div>
    </header>
  );
}
