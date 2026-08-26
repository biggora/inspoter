export const CALENDAR_COLORS = [
  "BLUE",
  "GREEN",
  "AMBER",
  "RED",
  "VIOLET",
  "SLATE",
] as const;

export const RECURRENCE_FREQUENCIES = [
  "DAILY",
  "WEEKLY",
  "MONTHLY",
  "YEARLY",
] as const;

export type RecurrenceFrequency = (typeof RECURRENCE_FREQUENCIES)[number];

export interface RecurrenceRuleInput {
  frequency: RecurrenceFrequency;
  interval: number;
  weekdays?: number[];
  monthlyMode?: "DAY_OF_MONTH" | "NTH_WEEKDAY" | "LAST_DAY";
  monthDay?: number;
  weekday?: number;
  ordinal?: number;
  end?:
    | { type: "NEVER" }
    | { type: "UNTIL"; until: string }
    | { type: "COUNT"; count: number };
}

export type SeriesScope = "occurrence" | "future" | "series";

export interface CalendarLinkInput {
  targetType: string;
  targetId: string;
  targetLabel: string;
  targetHref?: string | null;
  targetContext?: Record<string, unknown> | null;
}

export interface CalendarLinkDto extends CalendarLinkInput {
  id: string;
  position: number;
}

export interface CalendarEventOccurrenceDto {
  id: string;
  eventId: string;
  originalStartAt: string;
  title: string;
  description: string | null;
  location: string | null;
  color: string;
  startAt: string;
  endAt: string;
  allDay: boolean;
  timeZone: string;
  recurring: boolean;
  recurrence: RecurrenceRuleInput | null;
  links: CalendarLinkDto[];
}

export type CalendarReminderStatus =
  "SCHEDULED" | "DUE" | "SNOOZED" | "COMPLETED" | "SKIPPED";

export interface CalendarReminderOccurrenceDto {
  id: string;
  occurrenceId: string | null;
  reminderId: string;
  calendarEventId: string | null;
  kind: "STANDARD" | "PAYMENT";
  title: string;
  description: string | null;
  scheduledFor: string;
  triggerAt: string;
  status: CalendarReminderStatus;
  snoozedUntil: string | null;
  amount: string | null;
  currency: string | null;
  payee: string | null;
  paymentReference: string | null;
  paymentUrl: string | null;
  recurring: boolean;
  recurrence: RecurrenceRuleInput | null;
  links: CalendarLinkDto[];
}

export interface CalendarRangeResponse {
  events: CalendarEventOccurrenceDto[];
  reminders: CalendarReminderOccurrenceDto[];
  truncated: boolean;
  timeZone: string;
}
