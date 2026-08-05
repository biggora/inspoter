import { z } from "zod";
import type { DashboardWidgetKind } from "@/generated/prisma/client";
import { VALIDATION_MESSAGES } from "@/lib/validation/error-map";
import { GRID_COLUMNS } from "@/lib/dashboards/grid";
import {
  GRID_MAX_WIDGET_ROWS,
  WIDGET_KIND_ORDER,
} from "@/lib/dashboards/widget-kinds";

// Zod schemas for the Dashboards section — the single source of input
// validation for /api/dashboards/** (ADR-011), mirroring
// src/lib/validation/bookmarks.ts.
//
// Each widget kind owns its own config schema: no two kinds share an option, so
// a discriminated map beats one wide object with everything optional. Unknown
// keys are stripped by Zod's default behaviour, which keeps the stored `config`
// JSON free of anything the UI didn't put there.

const DASHBOARD_NAME_MAX = 60;
const WIDGET_TITLE_MAX = 60;
const NOTE_TEXT_MAX = 4000;
const LIST_LIMIT_MIN = 1;
const LIST_LIMIT_MAX = 20;

export const dashboardSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, { error: () => VALIDATION_MESSAGES.dashboard.nameRequired })
    .max(DASHBOARD_NAME_MAX, {
      error: () => VALIDATION_MESSAGES.dashboard.nameTooLong,
    }),
});

// PATCH /api/dashboards/:id carries a rename, a "make this the start
// dashboard" flag, or both — hence both fields optional.
export const dashboardUpdateSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, { error: () => VALIDATION_MESSAGES.dashboard.nameRequired })
    .max(DASHBOARD_NAME_MAX, {
      error: () => VALIDATION_MESSAGES.dashboard.nameTooLong,
    })
    .optional(),
  isDefault: z.literal(true).optional(),
});

// --- Widget config schemas ---

// Optional per-widget heading override; absent means the widget shows its
// kind's translated default title.
const titleField = z
  .string()
  .trim()
  .max(WIDGET_TITLE_MAX, {
    error: () => VALIDATION_MESSAGES.dashboard.titleTooLong,
  })
  .optional();

const listLimitField = z
  .number()
  .int()
  .min(LIST_LIMIT_MIN, {
    error: () => VALIDATION_MESSAGES.dashboard.limitOutOfRange,
  })
  .max(LIST_LIMIT_MAX, {
    error: () => VALIDATION_MESSAGES.dashboard.limitOutOfRange,
  })
  .default(5);

// An IANA zone name, validated by asking the runtime whether it can format in
// it — cheaper and more accurate than any pattern, and it fails closed on the
// value the clock widget would otherwise crash on.
const timeZoneField = z
  .string()
  .trim()
  .refine(
    (value) => {
      try {
        new Intl.DateTimeFormat("en-US", { timeZone: value });
        return true;
      } catch {
        return false;
      }
    },
    { error: () => VALIDATION_MESSAGES.dashboard.timeZoneInvalid },
  )
  .optional();

export const CALENDAR_EVENT_SOURCES = [
  "alerts",
  "serviceIncidents",
  "mail",
  "activity",
] as const;

export type CalendarEventSource = (typeof CALENDAR_EVENT_SOURCES)[number];

const clockConfigSchema = z.object({
  title: titleField,
  format: z.enum(["24h", "12h"]).default("24h"),
  showSeconds: z.boolean().default(false),
  showDate: z.boolean().default(true),
  timeZone: timeZoneField,
});

/**
 * Where a freshly added weather widget points until the operator moves it —
 * the same city the settings form offers as its example. A default is what lets
 * the widget picker create the tile in one click, like every other kind.
 */
export const WEATHER_DEFAULT_LOCATION = {
  label: "Riga",
  latitude: 56.95,
  longitude: 24.1,
} as const;

// Coordinates are plain numbers in range, which is also what keeps the
// Open-Meteo call safe: the widget never contributes a URL, only two numbers
// interpolated into a fixed endpoint (no SSRF surface).
//
// Both coordinates are nullable so a location can be cleared again: the tile
// then says "set the coordinates" instead of fetching. That is also why the
// location name is checked against the coordinates rather than on its own — a
// widget with no place needs no caption, one with a place must have it.
const weatherConfigSchema = z
  .object({
    title: titleField,
    label: z
      .string()
      .trim()
      .max(WIDGET_TITLE_MAX)
      .default(WEATHER_DEFAULT_LOCATION.label),
    latitude: z
      .number()
      .min(-90, { error: () => VALIDATION_MESSAGES.dashboard.latitudeInvalid })
      .max(90, { error: () => VALIDATION_MESSAGES.dashboard.latitudeInvalid })
      .nullable()
      .default(WEATHER_DEFAULT_LOCATION.latitude),
    longitude: z
      .number()
      .min(-180, {
        error: () => VALIDATION_MESSAGES.dashboard.longitudeInvalid,
      })
      .max(180, { error: () => VALIDATION_MESSAGES.dashboard.longitudeInvalid })
      .nullable()
      .default(WEATHER_DEFAULT_LOCATION.longitude),
    unit: z.enum(["celsius", "fahrenheit"]).default("celsius"),
  })
  .superRefine((config, ctx) => {
    const hasLatitude = config.latitude !== null;
    const hasLongitude = config.longitude !== null;
    if (hasLatitude !== hasLongitude) {
      ctx.addIssue({
        code: "custom",
        path: [hasLatitude ? "longitude" : "latitude"],
        message: VALIDATION_MESSAGES.dashboard.coordinatesRequired,
      });
      return;
    }
    if (hasLatitude && config.label.length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["label"],
        message: VALIDATION_MESSAGES.dashboard.locationRequired,
      });
    }
  });

const calendarConfigSchema = z.object({
  title: titleField,
  sources: z
    .array(z.enum(CALENDAR_EVENT_SOURCES))
    .min(1, { error: () => VALIDATION_MESSAGES.dashboard.sourcesRequired })
    .default(["alerts", "serviceIncidents"]),
});

const noteConfigSchema = z.object({
  title: titleField,
  text: z
    .string()
    .max(NOTE_TEXT_MAX, {
      error: () => VALIDATION_MESSAGES.dashboard.noteTooLong,
    })
    .default(""),
});

// `categoryId: null` means "every category" — the widget then shows the first
// `limit` bookmarks of the workspace in board order.
const bookmarksConfigSchema = z.object({
  title: titleField,
  categoryId: z.string().min(1).nullable().default(null),
  limit: listLimitField,
});

// An empty `serviceIds` means "every service", so the widget keeps working
// when a service is added later without anyone reconfiguring it.
const serviceStatusConfigSchema = z.object({
  title: titleField,
  serviceIds: z.array(z.string().min(1)).default([]),
  limit: listLimitField,
});

/**
 * Reads the server selection out of a stored SERVER_METRICS config, lifting the
 * pre-multi-select `localServerId` into the array the widget uses today. The
 * settings form calls it too, so a tile configured before multi-select opens
 * with its server already ticked.
 */
export function readServerSelection(raw: unknown): string[] {
  if (!raw || typeof raw !== "object") return [];
  const config = raw as Record<string, unknown>;
  const ids = config.localServerIds;
  if (Array.isArray(ids)) {
    return ids.filter((id): id is string => typeof id === "string");
  }
  const legacy = config.localServerId;
  return typeof legacy === "string" && legacy.length > 0 ? [legacy] : [];
}

// Only fills in the array when the new key is absent: a stored
// `localServerIds: "nope"` must still fail validation rather than be quietly
// replaced by an empty selection.
function withLegacyServerSelection(raw: unknown): unknown {
  if (!raw || typeof raw !== "object") return raw;
  if ("localServerIds" in raw) return raw;
  const selection = readServerSelection(raw);
  return selection.length > 0 ? { ...raw, localServerIds: selection } : raw;
}

// An empty `localServerIds` means "every server", same rationale as serviceIds.
const serverMetricsConfigSchema = z.preprocess(
  withLegacyServerSelection,
  z.object({
    title: titleField,
    localServerIds: z.array(z.string().min(1)).default([]),
    limit: listLimitField,
  }),
);

const mailConfigSchema = z.object({
  title: titleField,
  accountId: z.string().min(1).nullable().default(null),
  unreadOnly: z.boolean().default(false),
  limit: listLimitField,
});

// Two ways to point the tile at a source, in one form. An empty `channelIds`
// means "the whole selected category"; a null `categoryId` alongside it means
// every channel of the workspace — so a channel added later shows up without
// anyone reconfiguring the widget.
const messagesConfigSchema = z.object({
  title: titleField,
  categoryId: z.string().min(1).nullable().default(null),
  channelIds: z.array(z.string().min(1)).default([]),
  unreadOnly: z.boolean().default(false),
  limit: listLimitField,
});

// The same value sets the Alerts and Logs pages filter by
// (src/components/alerts/alerts-view.tsx, src/components/logs/logs-view.tsx),
// so a widget filter and a section filter can never disagree.
export const ALERT_SEVERITIES = [
  "info",
  "warning",
  "error",
  "critical",
] as const;
export const LOG_LEVELS = ["info", "warning", "error", "critical"] as const;

// Empty arrays mean "no severity/level filter", same rationale as serviceIds.
const alertsConfigSchema = z.object({
  title: titleField,
  severities: z.array(z.enum(ALERT_SEVERITIES)).default([]),
  limit: listLimitField,
});

const logsConfigSchema = z.object({
  title: titleField,
  levels: z.array(z.enum(LOG_LEVELS)).default([]),
  limit: listLimitField,
});

export const WIDGET_CONFIG_SCHEMAS = {
  CLOCK: clockConfigSchema,
  WEATHER: weatherConfigSchema,
  CALENDAR: calendarConfigSchema,
  NOTE: noteConfigSchema,
  BOOKMARKS: bookmarksConfigSchema,
  SERVICE_STATUS: serviceStatusConfigSchema,
  SERVER_METRICS: serverMetricsConfigSchema,
  MAIL: mailConfigSchema,
  MESSAGES: messagesConfigSchema,
  ALERTS: alertsConfigSchema,
  LOGS: logsConfigSchema,
} as const satisfies Record<DashboardWidgetKind, z.ZodType>;

export type WidgetConfig = {
  [K in DashboardWidgetKind]: z.infer<(typeof WIDGET_CONFIG_SCHEMAS)[K]>;
};

export type ClockConfig = WidgetConfig["CLOCK"];
export type WeatherConfig = WidgetConfig["WEATHER"];
export type CalendarConfig = WidgetConfig["CALENDAR"];
export type NoteConfig = WidgetConfig["NOTE"];
export type BookmarksConfig = WidgetConfig["BOOKMARKS"];
export type ServiceStatusConfig = WidgetConfig["SERVICE_STATUS"];
export type ServerMetricsConfig = WidgetConfig["SERVER_METRICS"];
export type MailConfig = WidgetConfig["MAIL"];
export type MessagesConfig = WidgetConfig["MESSAGES"];
export type AlertsConfig = WidgetConfig["ALERTS"];
export type LogsConfig = WidgetConfig["LOGS"];

export const widgetKindSchema = z.enum(
  WIDGET_KIND_ORDER as [DashboardWidgetKind, ...DashboardWidgetKind[]],
  { error: () => VALIDATION_MESSAGES.dashboard.kindInvalid },
);

/**
 * Parses a raw config object against the schema of one kind. Used by the API
 * routes (client input) and by the widget-data resolver (rows read back from
 * the `config` JSON column, which predate any later schema change).
 */
export function parseWidgetConfig<K extends DashboardWidgetKind>(
  kind: K,
  raw: unknown,
): z.ZodSafeParseResult<WidgetConfig[K]> {
  return WIDGET_CONFIG_SCHEMAS[kind].safeParse(
    raw ?? {},
  ) as z.ZodSafeParseResult<WidgetConfig[K]>;
}

/**
 * A stored config that no longer parses (schema tightened, hand-edited row)
 * falls back to the kind's defaults instead of breaking the whole dashboard.
 * Every kind is fully defaulted today, so the null return only guards against a
 * future schema that stops being — callers turn it into a widget-level error.
 */
export function parseWidgetConfigOrDefaults<K extends DashboardWidgetKind>(
  kind: K,
  raw: unknown,
): WidgetConfig[K] | null {
  const parsed = parseWidgetConfig(kind, raw);
  if (parsed.success) return parsed.data;
  const defaults = parseWidgetConfig(kind, {});
  return defaults.success ? defaults.data : null;
}

// POST /api/dashboards/:id/widgets — the client picks a kind and optionally
// supplies a config; the grid position is chosen server-side (findFreeSlot).
export const widgetCreateSchema = z.object({
  kind: widgetKindSchema,
  config: z.unknown().optional(),
});

export const widgetUpdateSchema = z.object({
  config: z.unknown(),
});

const gridCellSchema = z.object({
  id: z.string().min(1),
  x: z
    .number()
    .int()
    .min(0, { error: () => VALIDATION_MESSAGES.dashboard.layoutCellInvalid })
    .max(GRID_COLUMNS - 1, {
      error: () => VALIDATION_MESSAGES.dashboard.layoutCellInvalid,
    }),
  y: z
    .number()
    .int()
    .min(0, { error: () => VALIDATION_MESSAGES.dashboard.layoutCellInvalid })
    .max(500, { error: () => VALIDATION_MESSAGES.dashboard.layoutCellInvalid }),
  w: z
    .number()
    .int()
    .min(1, { error: () => VALIDATION_MESSAGES.dashboard.layoutCellInvalid })
    .max(GRID_COLUMNS, {
      error: () => VALIDATION_MESSAGES.dashboard.layoutCellInvalid,
    }),
  h: z
    .number()
    .int()
    .min(1, { error: () => VALIDATION_MESSAGES.dashboard.layoutCellInvalid })
    .max(GRID_MAX_WIDGET_ROWS, {
      error: () => VALIDATION_MESSAGES.dashboard.layoutCellInvalid,
    }),
});

// PATCH /api/dashboards/:id/layout — the full post-drag layout of the
// dashboard. Sending every widget (not just the moved one) is what lets the
// service reject overlaps: a legal move can shift several tiles at once.
export const layoutSchema = z.object({
  items: z
    .array(gridCellSchema)
    .min(1, { error: () => VALIDATION_MESSAGES.dashboard.layoutRequired }),
});

export type DashboardInput = z.infer<typeof dashboardSchema>;
export type DashboardUpdateInput = z.infer<typeof dashboardUpdateSchema>;
export type WidgetCreateInput = z.infer<typeof widgetCreateSchema>;
export type LayoutInput = z.infer<typeof layoutSchema>;
