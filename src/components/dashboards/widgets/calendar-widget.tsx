"use client";

import { useMemo } from "react";
import { useLocale, useTranslations } from "next-intl";

import { cn } from "@/lib/utils";
import type { CalendarMonthData } from "@/lib/dashboards/widget-payloads";
import type { CalendarEventSource } from "@/lib/validation/dashboards";

// A month grid over the day buckets the server produced, with the days that had
// events highlighted, followed by those days spelled out as text.
//
// The grid is deliberately non-interactive. Clicking a day to reveal its counts
// would mean 31 controls per tile — a lot of keyboard stops for a summary — and
// a click-only cell would hide the counts from anyone not using a pointer. The
// list below carries the same information for everyone, in one pass.
//
// The month is fixed to the one the payload covers: each month is its own server
// query, and this tile is an at-a-glance summary, not a calendar application.

const WEEK_START_MONDAY_OFFSET = 1;

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
    <div className="flex h-full flex-col gap-2">
      <p className="text-xs font-medium text-foreground-700">
        {monthFormatter.format(new Date(`${data.month}T00:00:00.000Z`))}
      </p>

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
          return (
            <span
              key={cell.date}
              data-today={cell.date === todayIso ? "true" : undefined}
              data-has-events={bucket ? "true" : undefined}
              className={cn(
                "flex aspect-square items-center justify-center rounded tabular-nums",
                cell.date === todayIso && "font-semibold text-primary-600",
                bucket
                  ? "bg-accent-100 text-foreground-800"
                  : "text-muted-foreground",
              )}
            >
              {cell.dayOfMonth}
            </span>
          );
        })}
      </div>

      {data.days.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          {t("calendar.noEvents")}
        </p>
      ) : (
        <ul className="flex min-h-0 flex-1 flex-col gap-1 overflow-auto text-xs">
          {data.days.map((day) => {
            const parts = (
              Object.keys(day.counts) as CalendarEventSource[]
            ).filter((source) => day.counts[source] > 0);
            return (
              <li key={day.date} className="flex items-baseline gap-1.5">
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
