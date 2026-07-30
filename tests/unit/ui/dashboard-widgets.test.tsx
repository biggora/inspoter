// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";

import { renderWithIntl } from "../../test-utils";
import { AlertsWidget } from "@/components/dashboards/widgets/alerts-widget";
import { BookmarksWidget } from "@/components/dashboards/widgets/bookmarks-widget";
import { CalendarWidget } from "@/components/dashboards/widgets/calendar-widget";
import { ClockWidget } from "@/components/dashboards/widgets/clock-widget";
import { LogsWidget } from "@/components/dashboards/widgets/logs-widget";
import { MailWidget } from "@/components/dashboards/widgets/mail-widget";
import { NoteWidget } from "@/components/dashboards/widgets/note-widget";
import { ServerMetricsWidget } from "@/components/dashboards/widgets/server-metrics-widget";
import { ServiceStatusWidget } from "@/components/dashboards/widgets/service-status-widget";
import { WeatherWidget } from "@/components/dashboards/widgets/weather-widget";
import { DashboardWidgetError } from "@/components/dashboards/dashboard-widget-frame";
import ruDashboards from "@/messages/ru/dashboards.json";

// Each widget is rendered from a payload fixture, plus its empty state. The
// point is that a tile never crashes on a legitimately empty or partial payload
// — the states an operator hits on a fresh workspace.

describe("ClockWidget", () => {
  it("renders a time and the date", () => {
    renderWithIntl(
      <ClockWidget
        config={{
          format: "24h",
          showSeconds: true,
          showDate: true,
          timeZone: "Europe/Riga",
        }}
      />,
    );

    // hh:mm:ss in the configured zone, plus the zone name as a caption.
    expect(screen.getByText(/^\d{2}:\d{2}:\d{2}$/)).toBeInTheDocument();
    expect(screen.getByText("Europe/Riga")).toBeInTheDocument();
  });

  it("omits the date when the config says so", () => {
    renderWithIntl(
      <ClockWidget
        config={{ format: "24h", showSeconds: false, showDate: false }}
      />,
    );

    expect(screen.getByText(/^\d{2}:\d{2}$/)).toBeInTheDocument();
  });
});

describe("NoteWidget", () => {
  it("preserves the operator's line breaks", () => {
    renderWithIntl(<NoteWidget config={{ text: "дежурный\nАня" }} />);

    expect(screen.getByText(/дежурный/)).toBeInTheDocument();
  });

  it("prompts when the note is empty", () => {
    renderWithIntl(<NoteWidget config={{ text: "   " }} />);

    expect(screen.getByText(ruDashboards.note.empty)).toBeInTheDocument();
  });
});

describe("WeatherWidget", () => {
  const snapshot = {
    temperature: 12.4,
    apparentTemperature: 10.2,
    weatherCode: 3,
    windSpeed: 4.6,
    isDay: true,
    unit: "celsius" as const,
    label: "Рига",
    fetchedAt: "2026-07-30T08:00:00.000Z",
  };

  it("renders the rounded temperature, condition, and location", () => {
    renderWithIntl(<WeatherWidget data={snapshot} />);

    expect(screen.getByText("12°C")).toBeInTheDocument();
    expect(
      screen.getByText(ruDashboards.weather.conditions.overcast),
    ).toBeInTheDocument();
    expect(screen.getByText("Рига")).toBeInTheDocument();
  });

  it("falls back to the unknown condition for an unmapped code", () => {
    renderWithIntl(<WeatherWidget data={{ ...snapshot, weatherCode: 1234 }} />);

    expect(
      screen.getByText(ruDashboards.weather.conditions.unknown),
    ).toBeInTheDocument();
  });

  it("omits the optional readings when the provider left them out", () => {
    renderWithIntl(
      <WeatherWidget
        data={{ ...snapshot, apparentTemperature: null, windSpeed: null }}
      />,
    );

    expect(screen.queryByText(/Ощущается/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Ветер/)).not.toBeInTheDocument();
  });

  it("switches the unit suffix for fahrenheit", () => {
    renderWithIntl(
      <WeatherWidget data={{ ...snapshot, unit: "fahrenheit" }} />,
    );

    expect(screen.getByText("12°F")).toBeInTheDocument();
  });
});

describe("CalendarWidget", () => {
  it("lists the days that had events", () => {
    renderWithIntl(
      <CalendarWidget
        data={{
          month: "2026-07-01",
          days: [
            {
              date: "2026-07-03",
              counts: { alerts: 2, serviceIncidents: 1, mail: 0, activity: 0 },
              total: 3,
            },
          ],
          truncated: [],
        }}
      />,
    );

    // The month heading, a full 31-day grid, and the event line for the 3rd.
    expect(screen.getByText(/июль/i)).toBeInTheDocument();
    expect(screen.getByText("31")).toBeInTheDocument();
    expect(screen.getByText(/Оповещения 2/)).toBeInTheDocument();
  });

  it("says so when the month had no events at all", () => {
    renderWithIntl(
      <CalendarWidget
        data={{ month: "2026-07-01", days: [], truncated: [] }}
      />,
    );

    expect(
      screen.getByText(ruDashboards.calendar.noEvents),
    ).toBeInTheDocument();
  });

  it("warns when the counts were capped", () => {
    renderWithIntl(
      <CalendarWidget
        data={{
          month: "2026-07-01",
          days: [
            {
              date: "2026-07-03",
              counts: {
                alerts: 2000,
                serviceIncidents: 0,
                mail: 0,
                activity: 0,
              },
              total: 2000,
            },
          ],
          truncated: ["alerts"],
        }}
      />,
    );

    expect(
      screen.getByText(ruDashboards.calendar.truncatedNote),
    ).toBeInTheDocument();
  });
});

describe("BookmarksWidget", () => {
  it("renders a tile per bookmark and counts the hidden rest", () => {
    renderWithIntl(
      <BookmarksWidget
        data={{
          bookmarks: [
            {
              id: "b1",
              name: "Grafana",
              url: "https://grafana.example.com",
              icon: "ri-line-chart-line",
              color: null,
              categoryName: "Прод",
            },
          ],
          totalCount: 4,
        }}
      />,
    );

    expect(screen.getByText("Grafana")).toBeInTheDocument();
    expect(screen.getByText(/и ещё 3/)).toBeInTheDocument();
  });

  it("shows the empty state for a category with no bookmarks", () => {
    renderWithIntl(<BookmarksWidget data={{ bookmarks: [], totalCount: 0 }} />);

    expect(screen.getByText(ruDashboards.bookmarks.empty)).toBeInTheDocument();
  });
});

describe("ServiceStatusWidget", () => {
  it("renders the summary and one row per service", () => {
    renderWithIntl(
      <ServiceStatusWidget
        data={{
          services: [
            {
              id: "s1",
              name: "API",
              status: "DOWN",
              isActive: true,
              lastResponseTimeMs: 1200,
              lastCheckedAt: "2026-07-30T08:00:00.000Z",
            },
          ],
          summary: { up: 3, down: 1, pending: 0 },
          totalCount: 4,
        }}
      />,
    );

    expect(screen.getByText("API")).toBeInTheDocument();
    expect(screen.getByText("Работает: 3")).toBeInTheDocument();
    expect(screen.getByText("Не работает: 1")).toBeInTheDocument();
    expect(screen.getByText("1200 мс")).toBeInTheDocument();
    expect(screen.getByText(/и ещё 3/)).toBeInTheDocument();
  });

  it("shows the empty state when nothing is monitored", () => {
    renderWithIntl(
      <ServiceStatusWidget
        data={{
          services: [],
          summary: { up: 0, down: 0, pending: 0 },
          totalCount: 0,
        }}
      />,
    );

    expect(
      screen.getByText(ruDashboards.serviceStatus.empty),
    ).toBeInTheDocument();
  });
});

describe("ServerMetricsWidget", () => {
  const liveMetrics = {
    state: "live" as const,
    receivedAt: "2026-07-30T08:00:00.000Z",
    cpuUsagePercent: 42.6,
    load1: 0.4,
    load5: 0.5,
    load15: 0.6,
    memoryTotalBytes: "4000000000",
    memoryAvailableBytes: "1000000000",
    swapTotalBytes: "0",
    swapFreeBytes: "0",
    filesystemTotalBytes: "80000000000",
    filesystemAvailableBytes: "20000000000",
    uptimeSeconds: "86400",
  };

  it("renders CPU, memory, and disk for a live snapshot", () => {
    renderWithIntl(
      <ServerMetricsWidget
        data={{
          servers: [
            {
              localServerId: "srv1",
              name: "web-1",
              hostname: "web-1",
              metrics: liveMetrics,
            },
          ],
          totalCount: 1,
        }}
      />,
    );

    expect(screen.getByText("web-1")).toBeInTheDocument();
    expect(screen.getByText("43%")).toBeInTheDocument();
    expect(screen.getByText(/2\.8 \/ 3\.7 GB/)).toBeInTheDocument();
    expect(screen.getByText(/55\.9 \/ 74\.5 GB/)).toBeInTheDocument();
  });

  it("explains a server with no agent instead of hiding it", () => {
    renderWithIntl(
      <ServerMetricsWidget
        data={{
          servers: [
            {
              localServerId: "srv2",
              name: "db-1",
              hostname: null,
              metrics: {
                ...liveMetrics,
                state: "not_configured",
                cpuUsagePercent: null,
                memoryTotalBytes: null,
                memoryAvailableBytes: null,
                filesystemTotalBytes: null,
                filesystemAvailableBytes: null,
                receivedAt: null,
              },
            },
          ],
          totalCount: 1,
        }}
      />,
    );

    expect(screen.getByText("db-1")).toBeInTheDocument();
    expect(
      screen.getByText(ruDashboards.serverMetrics.noMetrics),
    ).toBeInTheDocument();
  });

  it("shows the empty state when the workspace has no servers", () => {
    renderWithIntl(
      <ServerMetricsWidget data={{ servers: [], totalCount: 0 }} />,
    );

    expect(
      screen.getByText(ruDashboards.serverMetrics.empty),
    ).toBeInTheDocument();
  });
});

describe("MailWidget", () => {
  it("renders subject and sender, falling back for an empty subject", () => {
    renderWithIntl(
      <MailWidget
        data={{
          items: [
            {
              id: "m1",
              from: "ops@example.com",
              fromName: "Ops",
              subject: "  ",
              isRead: false,
              receivedAt: new Date().toISOString(),
            },
          ],
        }}
      />,
    );

    expect(screen.getByText(ruDashboards.mail.noSubject)).toBeInTheDocument();
    expect(screen.getByText("Ops")).toBeInTheDocument();
  });

  it("shows the empty state", () => {
    renderWithIntl(<MailWidget data={{ items: [] }} />);

    expect(screen.getByText(ruDashboards.mail.empty)).toBeInTheDocument();
  });
});

describe("AlertsWidget", () => {
  it("renders the severity, message, and source", () => {
    renderWithIntl(
      <AlertsWidget
        data={{
          items: [
            {
              id: "a1",
              severity: "critical",
              source: "monitor",
              message: "Диск заполнен",
              categoryName: null,
              timestamp: new Date().toISOString(),
            },
          ],
        }}
      />,
    );

    expect(screen.getByText("critical")).toBeInTheDocument();
    expect(screen.getByText("Диск заполнен")).toBeInTheDocument();
    expect(screen.getByText(/monitor/)).toBeInTheDocument();
  });

  it("shows the empty state", () => {
    renderWithIntl(<AlertsWidget data={{ items: [] }} />);

    expect(screen.getByText(ruDashboards.alerts.empty)).toBeInTheDocument();
  });
});

describe("LogsWidget", () => {
  it("renders the level and message", () => {
    renderWithIntl(
      <LogsWidget
        data={{
          items: [
            {
              id: "l1",
              level: "error",
              source: "api",
              message: "500 на /orders",
              timestamp: new Date().toISOString(),
            },
          ],
        }}
      />,
    );

    expect(screen.getByText("error")).toBeInTheDocument();
    expect(screen.getByText("500 на /orders")).toBeInTheDocument();
  });

  it("shows the empty state", () => {
    renderWithIntl(<LogsWidget data={{ items: [] }} />);

    expect(screen.getByText(ruDashboards.logs.empty)).toBeInTheDocument();
  });
});

describe("DashboardWidgetError", () => {
  it("names the failure without taking down the board", () => {
    renderWithIntl(<DashboardWidgetError message="WEATHER_UNAVAILABLE" />);

    expect(screen.getByText(ruDashboards.widgetErrorTitle)).toBeInTheDocument();
    expect(screen.getByText("WEATHER_UNAVAILABLE")).toBeInTheDocument();
  });
});
