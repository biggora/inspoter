export interface NavItem {
  // Stable key used to persist per-workspace visibility
  // (Workspace.hiddenSections) — decoupled from `href` so route changes don't
  // orphan stored settings. Absent on non-hideable items (e.g. Settings).
  key?: string;
  href: string;
  labelKey: string;
  icon: string;
}

// Management is the workspace home. It deliberately has no visibility key: it
// must stay available even when an owner hides every configurable section.
export const MANAGEMENT_NAV_ITEM: NavItem = {
  href: "/management",
  labelKey: "navManagement",
  icon: "ri-briefcase-4-line",
};

// AC-SHELL-001: the seven PRD sections plus Services (Uptime Kuma-style
// monitoring, additive), in design.md §3.2.1 order. `labelKey` resolves
// against the "shell" i18n namespace (src/messages/ru/shell.json) via
// `useTranslations("shell")` in the consuming components.
//
// Dashboards stays hideable like every other configurable section — a workspace
// that does not use boards can switch it off in workspace settings.
export const SECTION_NAV_ITEMS: NavItem[] = [
  {
    key: "dashboards",
    href: "/dashboards",
    labelKey: "navDashboards",
    icon: "ri-dashboard-line",
  },
  {
    key: "bookmarks",
    href: "/bookmarks",
    labelKey: "navBookmarks",
    icon: "ri-bookmark-line",
  },
  {
    key: "kanban",
    href: "/kanban",
    labelKey: "navKanban",
    icon: "ri-kanban-view",
  },
  {
    key: "calendar",
    href: "/calendar",
    labelKey: "navCalendar",
    icon: "ri-calendar-2-line",
  },
  {
    key: "notes",
    href: "/notes",
    labelKey: "navNotes",
    icon: "ri-booklet-line",
  },
  {
    key: "agents",
    href: "/agents",
    labelKey: "navAgents",
    icon: "ri-robot-2-line",
  },
  {
    key: "domains",
    href: "/domains",
    labelKey: "navDomains",
    icon: "ri-global-line",
  },
  {
    key: "servers",
    href: "/servers",
    labelKey: "navServers",
    icon: "ri-server-line",
  },
  {
    key: "hosting",
    href: "/hosting",
    labelKey: "navHosting",
    icon: "ri-cloud-line",
  },
  {
    key: "services",
    href: "/services",
    labelKey: "navServices",
    icon: "ri-pulse-line",
  },
  { key: "mail", href: "/mail", labelKey: "navMail", icon: "ri-mail-line" },
  {
    key: "contacts",
    href: "/contacts",
    labelKey: "navContacts",
    icon: "ri-contacts-book-line",
  },
  {
    key: "messages",
    href: "/messages",
    labelKey: "navMessages",
    icon: "ri-message-2-line",
  },
  {
    key: "activity",
    href: "/activity",
    labelKey: "navActivity",
    icon: "ri-history-line",
  },
  {
    key: "logs",
    href: "/logs",
    labelKey: "navLogs",
    icon: "ri-file-list-3-line",
  },
  {
    key: "alerts",
    href: "/alerts",
    labelKey: "navAlerts",
    icon: "ri-alert-line",
  },
];

// Stable keys of the hideable sections — the allowed values for
// Workspace.hiddenSections. Used for server-side validation
// (src/lib/validation/workspaces.ts) and the visibility form.
export const SECTION_KEYS: string[] = SECTION_NAV_ITEMS.map(
  (item) => item.key as string,
);

// Additive to the seven PRD sections (design.md §9 C-1 / plan.md §9 C-1) —
// hosts future webhook-token management (Slice 4). Rendered in the same nav
// landmark, below a separator.
export const SETTINGS_NAV_ITEM: NavItem = {
  href: "/settings",
  labelKey: "navSettings",
  icon: "ri-settings-4-line",
};

// Additive, same as Settings — always visible, not part of
// Workspace.hiddenSections/SECTION_KEYS (no `key`). Rendered below Settings
// in the same nav group.
export const HELP_NAV_ITEM: NavItem = {
  href: "/help",
  labelKey: "navHelp",
  icon: "ri-question-line",
};
