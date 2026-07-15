export interface NavItem {
  href: string;
  label: string;
  icon: string;
}

// AC-SHELL-001: the seven PRD sections plus Services (Uptime Kuma-style
// monitoring, additive), in design.md §3.2.1 order.
export const SECTION_NAV_ITEMS: NavItem[] = [
  { href: "/bookmarks", label: "Закладки", icon: "ri-bookmark-line" },
  { href: "/domains", label: "Домены", icon: "ri-global-line" },
  { href: "/servers", label: "Серверы", icon: "ri-server-line" },
  { href: "/services", label: "Сервисы", icon: "ri-pulse-line" },
  { href: "/mail", label: "Почта", icon: "ri-mail-line" },
  { href: "/messages", label: "Сообщения", icon: "ri-message-2-line" },
  { href: "/logs", label: "Логи", icon: "ri-file-list-3-line" },
  { href: "/alerts", label: "Оповещения", icon: "ri-alert-line" },
];

// Additive to the seven PRD sections (design.md §9 C-1 / plan.md §9 C-1) —
// hosts future webhook-token management (Slice 4). Rendered in the same nav
// landmark, below a separator.
export const SETTINGS_NAV_ITEM: NavItem = {
  href: "/settings",
  label: "Настройки",
  icon: "ri-settings-4-line",
};
