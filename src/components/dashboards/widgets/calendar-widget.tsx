"use client";

import { useMemo } from "react";
import { useLocale, useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import { Icon } from "@/components/ui/icon";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type {
  CalendarDayBucket,
  CalendarMonthData,
} from "@/lib/dashboards/widget-payloads";
import type { CalendarEventSource } from "@/lib/validation/dashboards";

// A month grid over the day buckets the server produced, with the days that had
// events highlighted, followed by those days spelled out as text.
//
// Only highlighted days are interactive. Hovering or focusing one reveals its
// event breakdown, while the list below carries the same information without
// requiring pointer interaction.
//
// The month is fixed to the one the payload covers: each month is its own server
// query, and this tile is an at-a-glance summary, not a calendar application.

const WEEK_START_MONDAY_OFFSET = 1;
const EVENT_SOURCES = [
  "alerts",
  "serviceIncidents",
  "mail",
  "activity",
] as const satisfies readonly CalendarEventSource[];

interface CalendarCell {
  /** YYYY-MM-DD, or null for the leading blanks before the 1st. */
  date: string | null;
  dayOfMonth: number | null;
}

function buildCells(monthIso: string): CalendarCell[] {
  const first = new Date(`${monthIso}T00:00:00.000Z`);
  const year = first.getUTCFullYear();
  const month = first.getUTCMonth();
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  // getUTCDay() is 0 for Sunday; the grid starts on Monday.
  const leading = (first.getUTCDay() - WEEK_START_MONDAY_OFFSET + 7) % 7;

  const cells: CalendarCell[] = Array.from({ length: leading }, () => ({
    date: null,
    dayOfMonth: null,
  }));
  for (let day = 1; day <= daysInMonth; day += 1) {
    const iso = `${year}-${String(month + 1).padStart(2, "0")}-${String(
      day,
    ).padStart(2, "0")}`;
    cells.push({ date: iso, dayOfMonth: day });
  }
  return cells;
}

function weekdayLabels(locale: string): string[] {
  const formatter = new Intl.DateTimeFormat(locale, {
    weekday: "short",
    timeZone: "UTC",
  });
  // 2026-06-01 was a Monday — an arbitrary reference week for the day names.
  return Array.from({ length: 7 }, (_, index) =>
    formatter.format(new Date(Date.UTC(2026, 5, 1 + index))),
  );
}

function populatedSources(bucket: CalendarDayBucket): CalendarEventSource[] {
  return EVENT_SOURCES.filter((source) => bucket.counts[source] > 0);
}

export function CalendarWidget({ data }: { data: CalendarMonthData }) {
  const t = useTranslations("dashboards");
  const locale = useLocale();

  const cells = useMemo(() => buildCells(data.month), [data.month]);
  const weekdays = useMemo(() => weekdayLabels(locale), [locale]);
  const byDate = useMemo(
    () => new Map(data.days.map((day) => [day.date, day])),
    [data.days],
  );

  const monthFormatter = new Intl.DateTimeFormat(locale, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  const dayFormatter = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });

  const todayIso = new Date().toISOString().slice(0, 10);

  return (
    <div data-slot="calendar-widget" className="flex flex-col gap-2">
      <p className="text-xs font-medium text-foreground-700">
        {monthFormatter.format(new Date(`${data.month}T00:00:00.000Z`))}
      </p>

      <TooltipProvider delay={150}>
        <div className="grid grid-cols-7 gap-0.5 text-center text-[0.7rem]">
          {weekdays.map((weekday) => (
            <span key={weekday} className="text-muted-foreground">
              {weekday}
            </span>
          ))}
          {cells.map((cell, index) => {
            if (!cell.date) {
              return <span key={`blank-${index}`} aria-hidden="true" />;
            }

            const bucket = byDate.get(cell.date);
            const isToday = cell.date === todayIso;
            const cellClassName = cn(
              "flex aspect-square items-center justify-center rounded tabular-nums",
              isToday &&
                "font-semibold text-primary-600 ring-2 ring-inset ring-primary-500",
            );

            if (!bucket) {
              return (
                <span
                  key={cell.date}
                  data-today={isToday ? "true" : undefined}
                  className={cn(cellClassName, "text-muted-foreground")}
                >
                  {cell.dayOfMonth}
                </span>
              );
            }

            const dateLabel = dayFormatter.format(
              new Date(`${cell.date}T00:00:00.000Z`),
            );
            const sources = populatedSources(bucket);
            const sourceSummary = sources
              .map(
                (source) =>
                  `${t(`calendar.sources.${source}`)} ${bucket.counts[source]}`,
              )
              .join(", ");
            const title = t("calendar.dayEventsTitle", { date: dateLabel });
            const count = t("calendar.eventCount", { count: bucket.total });

            return (
              <Tooltip key={cell.date}>
                <TooltipTrigger
                  type="button"
                  data-today={isToday ? "true" : undefined}
                  data-has-events="true"
                  aria-label={`${title}. ${count}. ${sourceSummary}`}
                  className={cn(
                    cellClassName,
                    "cursor-help border border-accent-200 bg-accent-100 text-foreground-800 outline-none transition-colors hover:bg-accent-200 focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--surface-card)]",
                  )}
                >
                  {cell.dayOfMonth}
                </TooltipTrigger>
                <TooltipContent
                  side="top"
                  className="w-56 max-w-[calc(100vw-2rem)] flex-col items-stretch gap-1.5 px-3 py-2 text-left"
                >
                  <div>
                    <p className="font-medium">{title}</p>
                    <p className="opacity-75">{count}</p>
                  </div>
                  <ul className="space-y-0.5">
                    {sources.map((source) => (
                      <li
                        key={source}
                        className="flex items-center justify-between gap-4"
                      >
                        <span>{t(`calendar.sources.${source}`)}</span>
                        <span className="tabular-nums">
                          {bucket.counts[source]}
                        </span>
                      </li>
                    ))}
                  </ul>
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>
      </TooltipProvider>

      {data.days.length > 0 && (
        <p className="flex items-start gap-1.5 text-[0.7rem] leading-snug text-muted-foreground">
          <span
            aria-hidden="true"
            className="mt-0.5 size-2.5 shrink-0 rounded-sm border border-accent-200 bg-accent-100"
          />
          {t("calendar.markedDayHint")}
        </p>
      )}

      {data.days.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          {t("calendar.noEvents")}
        </p>
      ) : (
        <ul
          data-slot="calendar-event-list"
          className="flex flex-col gap-1 text-xs"
        >
          {data.days.map((day) => {
            const parts = populatedSources(day);
            const content = (
              <>
                <span className="shrink-0 font-medium text-foreground-700">
                  {dayFormatter.format(new Date(`${day.date}T00:00:00.000Z`))}
                </span>
                <span className="min-w-0 truncate text-muted-foreground">
                  {parts
                    .map(
                      (source) =>
                        `${t(`calendar.sources.${source}`)} ${day.counts[source]}`,
                    )
                    .join(" · ")}
                </span>
              </>
            );
            return (
              <li key={day.date}>
                {day.counts.alerts > 0 ? (
                  <Link
                    href={`/alerts?date=${encodeURIComponent(day.date)}`}
                    aria-label={t("calendar.openAlertsForDay", {
                      date: dayFormatter.format(
                        new Date(`${day.date}T00:00:00.000Z`),
                      ),
                      count: day.counts.alerts,
                    })}
                    className="flex items-baseline gap-1.5 rounded-sm no-underline outline-none transition-colors hover:underline focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--surface-card)]"
                  >
                    {content}
                    <Icon
                      name="ri-arrow-right-up-line"
                      className="ms-auto shrink-0 self-center text-muted-foreground"
                      aria-hidden
                    />
                  </Link>
                ) : (
                  <span className="flex items-baseline gap-1.5">{content}</span>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {data.truncated.length > 0 && (
        <p className="text-[0.7rem] text-muted-foreground">
          {t("calendar.truncatedNote")}
        </p>
      )}
    </div>
  );
}
