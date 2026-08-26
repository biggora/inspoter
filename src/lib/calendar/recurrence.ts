import { datetime, RRule, type Options } from "rrule";
import { Temporal } from "temporal-polyfill";

import type { RecurrenceRuleInput } from "@/lib/calendar/types";

const WEEKDAYS = [
  RRule.SU,
  RRule.MO,
  RRule.TU,
  RRule.WE,
  RRule.TH,
  RRule.FR,
  RRule.SA,
];

function partsIn(timeZone: string, date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);
  const get = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value ?? "0");
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour") % 24,
    minute: get("minute"),
    second: get("second"),
  };
}

function optionsFor(
  input: RecurrenceRuleInput,
  anchor: Date,
  timeZone: string,
): Partial<Options> {
  const wall = partsIn(timeZone, anchor);
  const frequency = {
    DAILY: RRule.DAILY,
    WEEKLY: RRule.WEEKLY,
    MONTHLY: RRule.MONTHLY,
    YEARLY: RRule.YEARLY,
  }[input.frequency];
  const options: Partial<Options> = {
    freq: frequency,
    interval: input.interval,
    dtstart: datetime(
      wall.year,
      wall.month,
      wall.day,
      wall.hour,
      wall.minute,
      wall.second,
    ),
    wkst: RRule.MO,
  };

  if (input.frequency === "WEEKLY" && input.weekdays?.length) {
    options.byweekday = input.weekdays.map((day) => WEEKDAYS[day]);
  }
  if (input.frequency === "MONTHLY") {
    if (input.monthlyMode === "LAST_DAY") options.bymonthday = -1;
    if (input.monthlyMode === "DAY_OF_MONTH" && input.monthDay) {
      options.bymonthday = input.monthDay;
    }
    if (
      input.monthlyMode === "NTH_WEEKDAY" &&
      input.weekday !== undefined &&
      input.ordinal
    ) {
      options.byweekday = WEEKDAYS[input.weekday].nth(input.ordinal);
    }
  }
  if (input.end?.type === "COUNT") options.count = input.end.count;
  return options;
}

function wallDate(date: Date, timeZone: string): Date {
  const wall = partsIn(timeZone, date);
  return datetime(
    wall.year,
    wall.month,
    wall.day,
    wall.hour,
    wall.minute,
    wall.second,
  );
}

function instantFromWallDate(date: Date, timeZone: string): Date {
  return new Date(
    Temporal.ZonedDateTime.from(
      {
        timeZone,
        year: date.getUTCFullYear(),
        month: date.getUTCMonth() + 1,
        day: date.getUTCDate(),
        hour: date.getUTCHours(),
        minute: date.getUTCMinutes(),
        second: date.getUTCSeconds(),
      },
      { disambiguation: "compatible" },
    ).epochMilliseconds,
  );
}

function isBeforeRuleEnd(input: RecurrenceRuleInput, date: Date): boolean {
  return input.end?.type !== "UNTIL" || date <= new Date(input.end.until);
}

export function expandRecurrence(
  input: RecurrenceRuleInput | null,
  anchor: Date,
  timeZone: string,
  from: Date,
  to: Date,
  limit = 5_000,
): { dates: Date[]; truncated: boolean } {
  if (!input) {
    return {
      dates: anchor >= from && anchor < to ? [anchor] : [],
      truncated: false,
    };
  }
  const candidates = new RRule(optionsFor(input, anchor, timeZone)).between(
    wallDate(new Date(from.getTime() - 2 * 86_400_000), timeZone),
    wallDate(new Date(to.getTime() + 2 * 86_400_000), timeZone),
    true,
    (_date, index) => index <= limit,
  );
  const dates = candidates
    .map((date) => instantFromWallDate(date, timeZone))
    .filter(
      (date) => date >= from && date < to && isBeforeRuleEnd(input, date),
    );
  return { dates: dates.slice(0, limit), truncated: dates.length > limit };
}

export function nextRecurrence(
  input: RecurrenceRuleInput | null,
  anchor: Date,
  timeZone: string,
  after: Date,
): Date | null {
  if (!input) return anchor > after ? anchor : null;
  const rule = new RRule(optionsFor(input, anchor, timeZone));
  let candidate = rule.after(
    wallDate(new Date(after.getTime() - 2 * 86_400_000), timeZone),
    false,
  );
  while (candidate) {
    const instant = instantFromWallDate(candidate, timeZone);
    if (instant > after)
      return isBeforeRuleEnd(input, instant) ? instant : null;
    candidate = rule.after(candidate, false);
  }
  return null;
}

export function previousRecurrence(
  input: RecurrenceRuleInput | null,
  anchor: Date,
  timeZone: string,
  before: Date,
): Date | null {
  if (!input) return anchor < before ? anchor : null;
  const rule = new RRule(optionsFor(input, anchor, timeZone));
  let candidate = rule.before(
    wallDate(new Date(before.getTime() + 2 * 86_400_000), timeZone),
    false,
  );
  while (candidate) {
    const instant = instantFromWallDate(candidate, timeZone);
    if (instant < before && isBeforeRuleEnd(input, instant)) return instant;
    candidate = rule.before(candidate, false);
  }
  return null;
}

export function truncateRecurrence(
  input: RecurrenceRuleInput,
  until: Date,
): RecurrenceRuleInput {
  return {
    ...input,
    end: { type: "UNTIL", until: until.toISOString() },
  };
}
