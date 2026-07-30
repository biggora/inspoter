import type { DashboardWidgetKind } from "@/generated/prisma/client";

// The size envelope of every widget kind, in grid cells. Shared by the server
// (placement of a newly added widget, layout validation) and the client (resize
// clamping), so a widget can never be persisted at a size the UI refuses to
// render.
//
// `needsServerData` marks the kinds resolveWidgetData() has to fetch for.
// CLOCK and NOTE are self-contained: the clock ticks in the browser and the
// note's text lives in its own config.

export interface WidgetSize {
  w: number;
  h: number;
}

export interface WidgetKindSpec {
  defaultSize: WidgetSize;
  minSize: WidgetSize;
  maxSize: WidgetSize;
  needsServerData: boolean;
}

export const GRID_COLUMNS = 12;

export const WIDGET_KIND_SPECS: Record<DashboardWidgetKind, WidgetKindSpec> = {
  CLOCK: {
    defaultSize: { w: 3, h: 2 },
    minSize: { w: 2, h: 1 },
    maxSize: { w: 12, h: 4 },
    needsServerData: false,
  },
  WEATHER: {
    defaultSize: { w: 3, h: 2 },
    minSize: { w: 2, h: 2 },
    maxSize: { w: 6, h: 4 },
    needsServerData: true,
  },
  CALENDAR: {
    defaultSize: { w: 4, h: 4 },
    minSize: { w: 3, h: 3 },
    maxSize: { w: 8, h: 6 },
    needsServerData: true,
  },
  NOTE: {
    defaultSize: { w: 3, h: 3 },
    minSize: { w: 2, h: 2 },
    maxSize: { w: 12, h: 8 },
    needsServerData: false,
  },
  BOOKMARKS: {
    defaultSize: { w: 4, h: 3 },
    minSize: { w: 2, h: 2 },
    maxSize: { w: 12, h: 8 },
    needsServerData: true,
  },
  SERVICE_STATUS: {
    defaultSize: { w: 4, h: 3 },
    minSize: { w: 2, h: 2 },
    maxSize: { w: 12, h: 8 },
    needsServerData: true,
  },
  SERVER_METRICS: {
    defaultSize: { w: 4, h: 3 },
    minSize: { w: 3, h: 2 },
    maxSize: { w: 12, h: 8 },
    needsServerData: true,
  },
  MAIL: {
    defaultSize: { w: 4, h: 4 },
    minSize: { w: 3, h: 2 },
    maxSize: { w: 12, h: 8 },
    needsServerData: true,
  },
  ALERTS: {
    defaultSize: { w: 4, h: 4 },
    minSize: { w: 3, h: 2 },
    maxSize: { w: 12, h: 8 },
    needsServerData: true,
  },
  LOGS: {
    defaultSize: { w: 6, h: 4 },
    minSize: { w: 3, h: 2 },
    maxSize: { w: 12, h: 8 },
    needsServerData: true,
  },
};

// Catalogue order — the order the widget picker lists kinds in: the three
// global widgets first, then the ones that read a dashboard section.
export const WIDGET_KIND_ORDER: DashboardWidgetKind[] = [
  "CLOCK",
  "WEATHER",
  "CALENDAR",
  "NOTE",
  "BOOKMARKS",
  "SERVICE_STATUS",
  "SERVER_METRICS",
  "MAIL",
  "ALERTS",
  "LOGS",
];

export function specFor(kind: DashboardWidgetKind): WidgetKindSpec {
  return WIDGET_KIND_SPECS[kind];
}
