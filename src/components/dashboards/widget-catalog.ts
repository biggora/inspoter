import type { DashboardWidgetKind } from "@/generated/prisma/client";
import { WIDGET_KIND_ORDER } from "@/lib/dashboards/widget-kinds";

// Presentation metadata for the widget kinds: the icon in the picker and on the
// tile header, and the i18n keys for the kind's name and description. Sizes and
// limits live in src/lib/dashboards/widget-kinds.ts — this file adds nothing the
// server needs to know.
//
// Icons reuse the section glyphs from src/components/shell/nav-items.ts wherever
// a widget mirrors a section, so a tile reads as "this is the mail section" at a
// glance.

export interface WidgetCatalogEntry {
  kind: DashboardWidgetKind;
  icon: string;
  /** Key inside the "dashboards" namespace: kinds.<KIND>.title / .description */
  titleKey: string;
  descriptionKey: string;
}

const ICONS: Record<DashboardWidgetKind, string> = {
  CLOCK: "ri-time-line",
  WEATHER: "ri-sun-cloudy-line",
  CALENDAR: "ri-calendar-line",
  NOTE: "ri-sticky-note-line",
  BOOKMARKS: "ri-bookmark-line",
  SERVICE_STATUS: "ri-pulse-line",
  SERVER_METRICS: "ri-server-line",
  MAIL: "ri-mail-line",
  MESSAGES: "ri-message-2-line",
  ALERTS: "ri-alert-line",
  LOGS: "ri-file-list-3-line",
};

export const WIDGET_CATALOG: WidgetCatalogEntry[] = WIDGET_KIND_ORDER.map(
  (kind) => ({
    kind,
    icon: ICONS[kind],
    titleKey: `kinds.${kind}.title`,
    descriptionKey: `kinds.${kind}.description`,
  }),
);

export function catalogEntry(kind: DashboardWidgetKind): WidgetCatalogEntry {
  return WIDGET_CATALOG.find((entry) => entry.kind === kind)!;
}

// The dashboard section each widget reads from, for the "Open section" link on
// the tile. Global widgets have no section.
export const WIDGET_SECTION_HREF: Partial<Record<DashboardWidgetKind, string>> =
  {
    BOOKMARKS: "/bookmarks",
    SERVICE_STATUS: "/services",
    SERVER_METRICS: "/servers",
    MAIL: "/mail",
    MESSAGES: "/messages",
    ALERTS: "/alerts",
    LOGS: "/logs",
  };
