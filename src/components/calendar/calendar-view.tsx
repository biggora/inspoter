"use client";

import dynamic from "next/dynamic";
import { useCallback, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { LoadingOverlay, LoadingRegion } from "@/components/ui/loading";
import { Spinner } from "@/components/ui/spinner";
import { PageBody } from "@/components/shell/page-body";
import { PageHeader } from "@/components/shell/page-header";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type {
  CalendarEventOccurrenceDto,
  CalendarRangeResponse,
  CalendarReminderOccurrenceDto,
  SeriesScope,
} from "@/lib/calendar/types";
import { invalidateIndicators } from "@/components/shell/indicator-store";
import { calendarApi } from "./api";
import type { CalendarMoveRequest } from "./calendar-grid";
import { EventDialog, type NewEventRange } from "./event-dialog";
import { ReminderDialog } from "./reminder-dialog";

const CalendarGrid = dynamic(
  () => import("./calendar-grid").then((module) => module.CalendarGrid),
  {
    ssr: false,
    loading: () => (
      <LoadingRegion className="grid min-h-96 place-items-center">
        <Spinner aria-hidden className="text-xl text-muted-foreground" />
      </LoadingRegion>
    ),
  },
);

export function CalendarView({
  timeZone,
  initialInboxDue = false,
  initialDate,
}: {
  timeZone: string;
  initialInboxDue?: boolean;
  initialDate?: string;
}) {
  const t = useTranslations("calendar");
  const locale = useLocale();
  const [data, setData] = useState<CalendarRangeResponse>({
    events: [],
    reminders: [],
    truncated: false,
    timeZone,
  });
  const [range, setRange] = useState<{ from: string; to: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [eventOpen, setEventOpen] = useState(false);
  const [event, setEvent] = useState<CalendarEventOccurrenceDto | null>(null);
  const [newRange, setNewRange] = useState<NewEventRange | null>(null);
  const [reminderOpen, setReminderOpen] = useState(false);
  const [reminder, setReminder] =
    useState<CalendarReminderOccurrenceDto | null>(null);
  const [initialReminderDue, setInitialReminderDue] = useState<string | null>(
    null,
  );
  const [moveRequest, setMoveRequest] = useState<CalendarMoveRequest | null>(
    null,
  );

  const load = useCallback(
    async (nextRange = range) => {
      if (!nextRange) return;
      setLoading(true);
      setLoadError(false);
      try {
        setData(await calendarApi.range(nextRange.from, nextRange.to));
      } catch {
        setLoadError(true);
      } finally {
        setLoading(false);
      }
    },
    [range],
  );

  const activeReminders = useMemo(
    () =>
      data.reminders.filter(
        (item) => item.status === "DUE" || item.status === "SNOOZED",
      ),
    [data.reminders],
  );
  const upcoming = useMemo(
    () =>
      data.reminders.filter((item) => item.status === "SCHEDULED").slice(0, 8),
    [data.reminders],
  );

  function refreshAndClose() {
    setEventOpen(false);
    setReminderOpen(false);
    void load();
    invalidateIndicators();
  }

  async function act(
    item: CalendarReminderOccurrenceDto,
    action: "complete" | "skip" | "snooze",
  ) {
    if (!item.occurrenceId) return;
    try {
      const snoozeUntil =
        action === "snooze"
          ? new Date(new Date().getTime() + 3_600_000).toISOString()
          : undefined;
      await calendarApi.act(item.occurrenceId, action, snoozeUntil);
      await load();
      invalidateIndicators();
    } catch {
      toast.error(t("actionError"));
    }
  }

  async function applyMove(scope: SeriesScope) {
    if (!moveRequest) return;
    try {
      await calendarApi.updateEvent(moveRequest.event.eventId, {
        startAt: moveRequest.startAt,
        endAt: moveRequest.endAt,
        scope,
        originalStartAt: moveRequest.event.originalStartAt,
      });
      setMoveRequest(null);
      await load();
    } catch {
      moveRequest.revert();
      setMoveRequest(null);
      toast.error(t("saveError"));
    }
  }

  const actions = (
    <>
      <Button
        type="button"
        variant="outline"
        onClick={() => {
          setReminder(null);
          setInitialReminderDue(new Date().toISOString());
          setReminderOpen(true);
        }}
      >
        <Icon
          name="ri-notification-3-line"
          data-icon="inline-start"
          aria-hidden
        />
        {t("newReminder")}
      </Button>
      <Button
        type="button"
        onClick={() => {
          setEvent(null);
          setNewRange(null);
          setEventOpen(true);
        }}
      >
        <Icon name="ri-add-line" data-icon="inline-start" aria-hidden />
        {t("newEvent")}
      </Button>
    </>
  );

  return (
    <PageBody className="flex flex-col gap-6">
      <PageHeader
        title={t("pageTitle")}
        description={t("pageDescription")}
        actions={actions}
      />
      {loadError && (
        <div
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
        >
          {t("loadError")}
        </div>
      )}
      {data.truncated && (
        <div
          role="status"
          className="rounded-lg border p-3 text-sm [background:var(--warning-bg)] [border-color:var(--warning-border)] [color:var(--warning-text)]"
        >
          {t("truncated")}
        </div>
      )}
      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_19rem]">
        <LoadingOverlay
          busy={loading}
          className="min-w-0 overflow-hidden rounded-xl"
        >
          <CalendarGrid
            events={data.events}
            reminders={data.reminders}
            locale={locale}
            timeZone={timeZone}
            initialDate={initialDate}
            labels={{
              today: t("today"),
              previous: t("previous"),
              next: t("next"),
              view: t("view"),
              month: t("month"),
              week: t("week"),
              day: t("day"),
            }}
            onRangeChange={(from, to) => {
              if (range?.from === from && range.to === to) return;
              const nextRange = { from, to };
              setRange(nextRange);
              void load(nextRange);
            }}
            onSelect={(startAt, endAt, allDay) => {
              setEvent(null);
              setNewRange({ startAt, endAt, allDay });
              setEventOpen(true);
            }}
            onEventClick={(selected) => {
              setEvent(selected);
              setNewRange(null);
              setEventOpen(true);
            }}
            onReminderClick={(selected) => {
              setReminder(selected);
              setReminderOpen(true);
            }}
            onMove={(request) =>
              request.event.recurring
                ? setMoveRequest(request)
                : void applyImmediateMove(request)
            }
          />
        </LoadingOverlay>
        <aside
          className={`rounded-xl border bg-card p-4 shadow-xs ${initialInboxDue ? "ring-2 ring-primary/30" : ""}`}
          aria-label={t("dueTitle")}
        >
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="font-heading font-semibold">{t("dueTitle")}</h2>
            {activeReminders.length > 0 && (
              <Badge>{activeReminders.length}</Badge>
            )}
          </div>
          {activeReminders.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("dueEmpty")}</p>
          ) : (
            <ul className="space-y-2">
              {activeReminders.map((item) => (
                <ReminderRow
                  key={item.id}
                  item={item}
                  timeZone={timeZone}
                  labels={{
                    overdue: t("overdue"),
                    due: t("dueNow"),
                    complete:
                      item.kind === "PAYMENT" ? t("paid") : t("complete"),
                    snooze: t("snooze"),
                    skip: t("skip"),
                  }}
                  onOpen={() => {
                    setReminder(item);
                    setReminderOpen(true);
                  }}
                  onAction={(action) => void act(item, action)}
                />
              ))}
            </ul>
          )}
          {upcoming.length > 0 && (
            <>
              <h3 className="mt-5 mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                {t("upcomingTitle")}
              </h3>
              <ul className="space-y-1.5">
                {upcoming.map((item) => (
                  <li key={item.id}>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => {
                        setReminder(item);
                        setReminderOpen(true);
                      }}
                      className="h-auto w-full flex-col items-start rounded-lg border px-2.5 py-2 text-left text-sm"
                    >
                      <span className="block truncate font-medium">
                        {item.title}
                      </span>
                      <time className="text-xs text-muted-foreground">
                        {new Intl.DateTimeFormat(locale, {
                          dateStyle: "medium",
                          timeStyle: "short",
                          timeZone,
                        }).format(new Date(item.triggerAt))}
                      </time>
                    </Button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </aside>
      </div>
      <EventDialog
        open={eventOpen}
        event={event}
        initialRange={newRange}
        timeZone={timeZone}
        onOpenChange={setEventOpen}
        onSaved={refreshAndClose}
      />
      <ReminderDialog
        open={reminderOpen}
        reminder={reminder}
        initialDueAt={initialReminderDue}
        timeZone={timeZone}
        onOpenChange={setReminderOpen}
        onSaved={refreshAndClose}
      />
      <Dialog
        open={moveRequest !== null}
        onOpenChange={(open) => {
          if (!open) {
            moveRequest?.revert();
            setMoveRequest(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("scopeTitle")}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {t("scopeDescription")}
          </p>
          <div className="grid gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => void applyMove("occurrence")}
            >
              {t("scopeOccurrence")}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => void applyMove("future")}
            >
              {t("scopeFuture")}
            </Button>
            <Button type="button" onClick={() => void applyMove("series")}>
              {t("scopeSeries")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </PageBody>
  );

  async function applyImmediateMove(request: CalendarMoveRequest) {
    try {
      await calendarApi.updateEvent(request.event.eventId, {
        startAt: request.startAt,
        endAt: request.endAt,
        scope: "series",
      });
      await load();
    } catch {
      request.revert();
      toast.error(t("saveError"));
    }
  }
}

function ReminderRow({
  item,
  timeZone,
  labels,
  onOpen,
  onAction,
}: {
  item: CalendarReminderOccurrenceDto;
  timeZone: string;
  labels: {
    overdue: string;
    due: string;
    complete: string;
    snooze: string;
    skip: string;
  };
  onOpen: () => void;
  onAction: (action: "complete" | "skip" | "snooze") => void;
}) {
  const isOverdue = new Date(item.triggerAt).getTime() < new Date().getTime();
  return (
    <li className="rounded-lg border bg-muted/20 p-2.5">
      <Button
        type="button"
        variant="ghost"
        onClick={onOpen}
        className="h-auto w-full flex-col items-start px-0 py-0 text-left hover:bg-transparent"
      >
        <span className="block truncate text-sm font-medium">{item.title}</span>
        {item.kind === "PAYMENT" && (
          <span className="block text-xs font-semibold tabular-nums">
            {item.amount} {item.currency} · {item.payee}
          </span>
        )}
        <time
          className={`text-xs ${isOverdue ? "text-destructive" : "text-muted-foreground"}`}
        >
          {isOverdue ? labels.overdue : labels.due} ·{" "}
          {new Intl.DateTimeFormat(undefined, {
            dateStyle: "short",
            timeStyle: "short",
            timeZone,
          }).format(new Date(item.triggerAt))}
        </time>
      </Button>
      <div className="mt-2 flex flex-wrap gap-1">
        <Button type="button" size="xs" onClick={() => onAction("complete")}>
          {labels.complete}
        </Button>
        <Button
          type="button"
          size="xs"
          variant="outline"
          onClick={() => onAction("snooze")}
        >
          {labels.snooze}
        </Button>
        <Button
          type="button"
          size="xs"
          variant="ghost"
          onClick={() => onAction("skip")}
        >
          {labels.skip}
        </Button>
      </div>
    </li>
  );
}
