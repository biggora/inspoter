// The wire contract between the widget-data resolver and the widget components:
// what a tile receives, whether it arrived in the RSC payload or as JSON from
// GET /api/dashboards/:id/data.
//
// This module is deliberately dependency-free. The resolver
// (src/lib/services/dashboard-widget-data.ts) is a server module that imports
// Prisma; a client widget that imported its types *and* one of its values would
// drag the database client into the browser bundle. Keeping the shapes and the
// one runtime helper here means both sides can import them safely.
//
// Every timestamp is an ISO string, never a Date: the same payload has to
// survive JSON.stringify on the polling path.

export interface WidgetError {
  error: string;
}

export interface WeatherSnapshot {
  temperature: number;
  apparentTemperature: number | null;
  /** WMO weather interpretation code (0 = clear sky … 99 = thunderstorm with hail). */
  weatherCode: number;
  windSpeed: number | null;
  isDay: boolean;
  unit: "celsius" | "fahrenheit";
  label: string;
  fetchedAt: string;
}

export type CalendarEventCounts = Record<
  "alerts" | "serviceIncidents" | "mail" | "activity",
  number
>;

export interface CalendarDayBucket {
  /** Calendar day as YYYY-MM-DD. */
  date: string;
  counts: CalendarEventCounts;
  total: number;
}

export interface CalendarMonthData {
  /** First day of the month this data covers, as YYYY-MM-DD. */
  month: string;
  days: CalendarDayBucket[];
  /** Sources whose row cap was hit, so the counts below them are partial. */
  truncated: (keyof CalendarEventCounts)[];
}

export interface BookmarkTile {
  id: string;
  name: string;
  url: string;
  icon: string | null;
  color: string | null;
  categoryName: string;
}

export interface BookmarksPayload {
  bookmarks: BookmarkTile[];
  totalCount: number;
}

export interface ServiceStatusEntry {
  id: string;
  name: string;
  status: "PENDING" | "UP" | "DOWN";
  isActive: boolean;
  lastResponseTimeMs: number | null;
  lastCheckedAt: string | null;
}

export interface ServiceStatusPayload {
  services: ServiceStatusEntry[];
  summary: { up: number; down: number; pending: number };
  totalCount: number;
}

/**
 * The subset of an agent snapshot the widget draws — CPU, memory, disk, and how
 * fresh the reading is. Load average, swap, and uptime are in the full
 * ServerMetricsDto but not shown on a tile, so they are not carried here.
 * Byte counts stay decimal strings, as they do everywhere BigInt columns cross
 * a wire.
 */
export interface WidgetServerMetrics {
  state: "not_configured" | "live" | "stale";
  receivedAt: string | null;
  cpuUsagePercent: number | null;
  memoryTotalBytes: string | null;
  memoryAvailableBytes: string | null;
  filesystemTotalBytes: string | null;
  filesystemAvailableBytes: string | null;
}

export interface WidgetServerEntry {
  localServerId: string;
  name: string;
  hostname: string | null;
  metrics: WidgetServerMetrics;
}

export interface ServerMetricsPayload {
  servers: WidgetServerEntry[];
  totalCount: number;
}

export interface MailEntry {
  id: string;
  from: string;
  fromName: string | null;
  subject: string;
  isRead: boolean;
  receivedAt: string;
  /** Which mailbox received the message — the tile marks every row with it and
   *  deep-links into that account's view. */
  accountId: string;
  accountName: string;
  accountEmail: string;
}

export interface MailPayload {
  items: MailEntry[];
}

export interface AlertEntry {
  id: string;
  severity: string;
  source: string;
  message: string;
  categoryName: string | null;
  timestamp: string;
}

export interface AlertsPayload {
  items: AlertEntry[];
}

export interface LogEntryDto {
  id: string;
  level: string;
  source: string;
  message: string;
  timestamp: string;
}

export interface LogsPayload {
  items: LogEntryDto[];
}

export type WidgetPayload =
  | { kind: "CLOCK" }
  | { kind: "NOTE" }
  // `data: null` is a weather widget with no location yet — the tile asks for
  // coordinates instead of showing a reading.
  | { kind: "WEATHER"; data: WeatherSnapshot | null }
  | { kind: "CALENDAR"; data: CalendarMonthData }
  | { kind: "BOOKMARKS"; data: BookmarksPayload }
  | { kind: "SERVICE_STATUS"; data: ServiceStatusPayload }
  | { kind: "SERVER_METRICS"; data: ServerMetricsPayload }
  | { kind: "MAIL"; data: MailPayload }
  | { kind: "ALERTS"; data: AlertsPayload }
  | { kind: "LOGS"; data: LogsPayload }
  | WidgetError;

/** Widget id → its payload. */
export type WidgetDataMap = Record<string, WidgetPayload>;

export function isWidgetError(payload: WidgetPayload): payload is WidgetError {
  return "error" in payload;
}
