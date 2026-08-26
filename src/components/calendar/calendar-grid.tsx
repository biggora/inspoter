"use client";

import { useMemo, useRef, useState } from "react";
import FullCalendar, { type CalendarRef } from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/react/daygrid";
import interactionPlugin from "@fullcalendar/react/interaction";
import timeGridPlugin from "@fullcalendar/react/timegrid";
import "@fullcalendar/react/skeleton.css";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import type {
  CalendarEventOccurrenceDto,
  CalendarReminderOccurrenceDto,
} from "@/lib/calendar/types";

const COLORS: Record<string, string> = {
  BLUE: "#2563eb",
  GREEN: "#059669",
  AMBER: "#d97706",
  RED: "#dc2626",
  VIOLET: "#7c3aed",
  SLATE: "#475569",
};

export interface CalendarMoveRequest {
  event: CalendarEventOccurrenceDto;
  startAt: string;
  endAt: string;
  revert: () => void;
}

export function CalendarGrid({
  events,
  reminders,
  locale,
  timeZone,
  initialDate,
  labels,
  onRangeChange,
  onSelect,
  onEventClick,
  onReminderClick,
  onMove,
}: {
  events: CalendarEventOccurrenceDto[];
  reminders: CalendarReminderOccurrenceDto[];
  locale: string;
  timeZone: string;
  initialDate?: string;
  labels: {
    today: string;
    previous: string;
    next: string;
    view: string;
    month: string;
    week: string;
    day: string;
  };
  onRangeChange: (from: string, to: string) => void;
  onSelect: (startAt: string, endAt: string, allDay: boolean) => void;
  onEventClick: (event: CalendarEventOccurrenceDto) => void;
  onReminderClick: (reminder: CalendarReminderOccurrenceDto) => void;
  onMove: (request: CalendarMoveRequest) => void;
}) {
  const calendarRef = useRef<CalendarRef>(null);
  const [view, setView] = useState("dayGridMonth");
  const [title, setTitle] = useState("");
  const eventById = useMemo(
    () => new Map(events.map((event) => [event.id, event])),
    [events],
  );
  const reminderById = useMemo(
    () => new Map(reminders.map((item) => [item.id, item])),
    [reminders],
  );
  const calendarEvents = useMemo(
    () => [
      ...events.map((event) => ({
        id: event.id,
        title: event.title,
        start: event.startAt,
        end: event.endAt,
        allDay: event.allDay,
        // FullCalendar v7 renamed backgroundColor/borderColor to a single
        // `color` and `classNames` to a `className` string — the v6 names are
        // silently ignored (see the v7 migration guide).
        color: COLORS[event.color] ?? COLORS.BLUE,
        extendedProps: { itemType: "event" },
      })),
      ...reminders
        .filter(
          (item) =>
            item.status === "SCHEDULED" ||
            item.status === "DUE" ||
            item.status === "SNOOZED",
        )
        .map((item) => ({
          id: `reminder:${item.id}`,
          title: item.title,
          start: item.snoozedUntil ?? item.triggerAt,
          allDay: false,
          editable: false,
          className: [
            "calendar-reminder-event",
            `calendar-reminder-${item.status.toLowerCase()}`,
          ].join(" "),
          extendedProps: { itemType: "reminder", reminderId: item.id },
        })),
    ],
    [events, reminders],
  );

  function navigate(action: "today" | "prev" | "next") {
    calendarRef.current?.getApi()[action]();
  }

  return (
    <section
      className="calendar-surface min-w-0 rounded-xl border bg-card p-3 shadow-xs sm:p-4"
      aria-label={title}
    >
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          aria-label={labels.previous}
          onClick={() => navigate("prev")}
        >
          <Icon name="ri-arrow-left-s-line" aria-hidden />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => navigate("today")}
        >
          {labels.today}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          aria-label={labels.next}
          onClick={() => navigate("next")}
        >
          <Icon name="ri-arrow-right-s-line" aria-hidden />
        </Button>
        <h2 className="min-w-48 flex-1 font-heading text-base font-semibold capitalize sm:text-lg">
          {title}
        </h2>
        <NativeSelect
          size="sm"
          aria-label={labels.view}
          value={view}
          onChange={(event) => {
            setView(event.target.value);
            calendarRef.current?.getApi().changeView(event.target.value);
          }}
        >
          <NativeSelectOption value="dayGridMonth">
            {labels.month}
          </NativeSelectOption>
          <NativeSelectOption value="timeGridWeek">
            {labels.week}
          </NativeSelectOption>
          <NativeSelectOption value="timeGridDay">
            {labels.day}
          </NativeSelectOption>
        </NativeSelect>
      </div>
      <FullCalendar
        ref={calendarRef}
        plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
        initialView={view}
        initialDate={initialDate}
        headerToolbar={false}
        locale={locale}
        timeZone={timeZone}
        firstDay={1}
        height="auto"
        nowIndicator
        selectable
        selectMirror
        editable
        eventResizableFromStart
        dayMaxEvents={4}
        events={calendarEvents}
        datesSet={(info) => {
          setTitle(info.view.title);
          setView(info.view.type);
          onRangeChange(info.start.toISOString(), info.end.toISOString());
        }}
        select={(info) =>
          onSelect(
            info.start.toISOString(),
            info.end.toISOString(),
            info.allDay,
          )
        }
        eventClick={(info) => {
          if (info.event.extendedProps.itemType === "reminder") {
            const reminder = reminderById.get(
              String(info.event.extendedProps.reminderId),
            );
            if (reminder) onReminderClick(reminder);
            return;
          }
          const event = eventById.get(info.event.id);
          if (event) onEventClick(event);
        }}
        eventDrop={(info) => {
          const event = eventById.get(info.event.id);
          if (!event || !info.event.start) return info.revert();
          const duration =
            new Date(event.endAt).getTime() - new Date(event.startAt).getTime();
          onMove({
            event,
            startAt: info.event.start.toISOString(),
            endAt: (
              info.event.end ?? new Date(info.event.start.getTime() + duration)
            ).toISOString(),
            revert: info.revert,
          });
        }}
        eventResize={(info) => {
          const event = eventById.get(info.event.id);
          if (!event || !info.event.start || !info.event.end)
            return info.revert();
          onMove({
            event,
            startAt: info.event.start.toISOString(),
            endAt: info.event.end.toISOString(),
            revert: info.revert,
          });
        }}
      />
    </section>
  );
}
