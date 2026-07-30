"use client";

import type { DashboardWidget } from "@/generated/prisma/client";
import {
  isWidgetError,
  type WidgetPayload,
} from "@/lib/dashboards/widget-payloads";
import { parseWidgetConfigOrDefaults } from "@/lib/validation/dashboards";
import { DashboardWidgetError } from "../dashboard-widget-frame";
import { AlertsWidget } from "./alerts-widget";
import { BookmarksWidget } from "./bookmarks-widget";
import { CalendarWidget } from "./calendar-widget";
import { ClockWidget } from "./clock-widget";
import { LogsWidget } from "./logs-widget";
import { MailWidget } from "./mail-widget";
import { NoteWidget } from "./note-widget";
import { ServerMetricsWidget } from "./server-metrics-widget";
import { ServiceStatusWidget } from "./service-status-widget";
import { WeatherWidget } from "./weather-widget";

// Dispatches a widget row plus its resolved payload to the component for its
// kind. Two things are handled once, here, instead of in ten widgets: a payload
// that failed server-side becomes an error card, and a payload whose kind does
// not match the row (only possible mid-refresh, right after a kind changed) is
// treated as "not loaded yet" rather than rendered against the wrong component.

export function WidgetBody({
  widget,
  payload,
}: {
  widget: DashboardWidget;
  payload: WidgetPayload | undefined;
}) {
  if (payload && isWidgetError(payload)) {
    return <DashboardWidgetError message={payload.error} />;
  }

  switch (widget.kind) {
    case "CLOCK": {
      const config = parseWidgetConfigOrDefaults("CLOCK", widget.config);
      return config ? <ClockWidget config={config} /> : null;
    }
    case "NOTE": {
      const config = parseWidgetConfigOrDefaults("NOTE", widget.config);
      return config ? <NoteWidget config={config} /> : null;
    }
    case "WEATHER":
      return payload?.kind === "WEATHER" ? (
        <WeatherWidget data={payload.data} />
      ) : null;
    case "CALENDAR":
      return payload?.kind === "CALENDAR" ? (
        <CalendarWidget data={payload.data} />
      ) : null;
    case "BOOKMARKS":
      return payload?.kind === "BOOKMARKS" ? (
        <BookmarksWidget data={payload.data} />
      ) : null;
    case "SERVICE_STATUS":
      return payload?.kind === "SERVICE_STATUS" ? (
        <ServiceStatusWidget data={payload.data} />
      ) : null;
    case "SERVER_METRICS":
      return payload?.kind === "SERVER_METRICS" ? (
        <ServerMetricsWidget data={payload.data} />
      ) : null;
    case "MAIL":
      return payload?.kind === "MAIL" ? (
        <MailWidget data={payload.data} />
      ) : null;
    case "ALERTS":
      return payload?.kind === "ALERTS" ? (
        <AlertsWidget data={payload.data} />
      ) : null;
    case "LOGS":
      return payload?.kind === "LOGS" ? (
        <LogsWidget data={payload.data} />
      ) : null;
  }
}
