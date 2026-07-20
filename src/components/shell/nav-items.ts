export interface NavItem {
  href: string;
  labelKey: string;
  icon: string;
}

// AC-SHELL-001: the seven PRD sections plus Services (Uptime Kuma-style
// monitoring, additive), in design.md §3.2.1 order. `labelKey` resolves
// against the "shell" i18n namespace (src/messages/ru/shell.json) via
// `useTranslations("shell")` in the consuming components.
export const SECTION_NAV_ITEMS: NavItem[] = [
  { href: "/bookmarks", labelKey: "navBookmarks", icon: "ri-bookmark-line" },
  { href: "/domains", labelKey: "navDomains", icon: "ri-global-line" },
  { href: "/servers", labelKey: "navServers", icon: "ri-server-line" },
  { href: "/hosting", labelKey: "navHosting", icon: "ri-cloud-line" },
  { href: "/services", labelKey: "navServices", icon: "ri-pulse-line" },
  { href: "/mail", labelKey: "navMail", icon: "ri-mail-line" },
  { href: "/messages", labelKey: "navMessages", icon: "ri-message-2-line" },
  { href: "/logs", labelKey: "navLogs", icon: "ri-file-list-3-line" },
  { href: "/alerts", labelKey: "navAlerts", icon: "ri-alert-line" },
];

// Additive to the seven PRD sections (design.md §9 C-1 / plan.md §9 C-1) —
// hosts future webhook-token management (Slice 4). Rendered in the same nav
// landmark, below a separator.
export const SETTINGS_NAV_ITEM: NavItem = {
  href: "/settings",
  labelKey: "navSettings",
  icon: "ri-settings-4-line",
};
