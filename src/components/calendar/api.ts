import {
  getActiveWorkspaceId,
  WORKSPACE_HEADER_NAME,
} from "@/lib/client/active-workspace";
import type {
  CalendarLinkInput,
  CalendarRangeResponse,
  RecurrenceRuleInput,
  SeriesScope,
} from "@/lib/calendar/types";
import type { CalendarLinkTargetPage } from "@/lib/services/calendar-link-targets";

export class CalendarApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CalendarApiError";
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      [WORKSPACE_HEADER_NAME]: getActiveWorkspaceId() ?? "",
      ...(init?.headers ?? {}),
    },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const error = Array.isArray(body?.error)
      ? body.error[0]?.message
      : body?.error;
    throw new CalendarApiError(
      error || `Calendar request failed: ${response.status}`,
    );
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export interface EventInput {
  title: string;
  description?: string | null;
  location?: string | null;
  color: string;
  startAt: string;
  endAt: string;
  allDay: boolean;
  timeZone: string;
  recurrence?: RecurrenceRuleInput | null;
  links: CalendarLinkInput[];
  reminderOffsets: number[];
}

export interface ReminderInput {
  calendarEventId?: string | null;
  kind: "STANDARD" | "PAYMENT";
  title: string;
  description?: string | null;
  dueAt?: string | null;
  offsetMinutes?: number | null;
  timeZone: string;
  recurrence?: RecurrenceRuleInput | null;
  amount?: string | null;
  currency?: string | null;
  payee?: string | null;
  paymentReference?: string | null;
  paymentUrl?: string | null;
  links: CalendarLinkInput[];
}

export const calendarApi = {
  range: (from: string, to: string) =>
    request<CalendarRangeResponse>(
      `/api/calendar?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
    ),
  createEvent: (input: EventInput) =>
    request<{ id: string }>("/api/calendar/events", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  updateEvent: (
    id: string,
    input: Partial<EventInput> & {
      scope: SeriesScope;
      originalStartAt?: string;
    },
  ) =>
    request(`/api/calendar/events/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
  deleteEvent: (id: string, scope: SeriesScope, originalStartAt?: string) => {
    const params = new URLSearchParams({ scope });
    if (originalStartAt) params.set("originalStartAt", originalStartAt);
    return request<void>(
      `/api/calendar/events/${encodeURIComponent(id)}?${params}`,
      { method: "DELETE" },
    );
  },
  createReminder: (input: ReminderInput) =>
    request<{ id: string }>("/api/calendar/reminders", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  updateReminder: (id: string, input: Partial<ReminderInput>) =>
    request(`/api/calendar/reminders/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
  removeReminder: (id: string) =>
    request<void>(`/api/calendar/reminders/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),
  act: (
    occurrenceId: string,
    action: "complete" | "skip" | "snooze",
    snoozeUntil?: string,
  ) =>
    request(
      `/api/calendar/reminder-occurrences/${encodeURIComponent(occurrenceId)}/action`,
      {
        method: "POST",
        body: JSON.stringify({ action, snoozeUntil }),
      },
    ),
  linkTargets: (query: string) =>
    request<CalendarLinkTargetPage>(
      `/api/calendar/link-targets?q=${encodeURIComponent(query)}`,
    ),
};
