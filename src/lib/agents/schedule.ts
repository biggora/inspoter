import type { AgentScheduleKind } from "@/generated/prisma/client";

// Recurrence for agent schedules. Pure: no Prisma, no I/O, an injected `after`
// instead of a clock.
//
// Three explicit kinds rather than a cron string. A hand-rolled cron parser is
// deceptively subtle — DST, and the OR-rule between day-of-month and
// day-of-week — and nothing in this feature needs that expressiveness. Time
// zones are handled with Intl, so no dependency is added either.

export const MIN_INTERVAL_SECONDS = 300;
export const MINUTES_PER_DAY = 1_440;

/** How far ahead computeNextRunAt is willing to search before giving up. */
const MAX_SEARCH_DAYS = 8;

export interface AgentScheduleSpec {
  kind: AgentScheduleKind;
  intervalSeconds?: number | null;
  /** Minutes since midnight in `timeZone`. */
  minuteOfDay?: number | null;
  /** 0 = Sunday, matching Date.getUTCDay(). */
  daysOfWeek?: readonly number[];
  timeZone: string;
}

export function isValidTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function partsIn(timeZone: string, date: Date): ZonedParts {
  const formatted = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);
  const value = (type: string) =>
    Number(formatted.find((part) => part.type === type)?.value ?? "0");
  return {
    year: value("year"),
    month: value("month"),
    day: value("day"),
    // "24" is how the en-US hour12:false formatter spells midnight.
    hour: value("hour") % 24,
    minute: value("minute"),
    second: value("second"),
  };
}

/** How far the zone's wall clock is ahead of UTC at this instant. */
function offsetMs(timeZone: string, date: Date): number {
  const parts = partsIn(timeZone, date);
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  return asUtc - date.getTime();
}

/**
 * The instant whose wall time in `timeZone` is the given local date at
 * `minuteOfDay`.
 *
 * The offset is applied twice because the offset itself depends on the
 * instant: the first pass lands near the target, the second corrects it if a
 * DST boundary sits in between. On a spring-forward gap the wall time does not
 * exist and the result is the next minute that does; on a fall-back overlap it
 * is the first of the two.
 */
function zonedWallTimeToUtc(
  timeZone: string,
  year: number,
  month: number,
  day: number,
  minuteOfDay: number,
): Date {
  const naive = Date.UTC(
    year,
    month - 1,
    day,
    Math.floor(minuteOfDay / 60),
    minuteOfDay % 60,
  );
  const firstPass = naive - offsetMs(timeZone, new Date(naive));
  return new Date(naive - offsetMs(timeZone, new Date(firstPass)));
}

function localWeekday(timeZone: string, date: Date): number {
  const parts = partsIn(timeZone, date);
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay();
}

/**
 * The first occurrence strictly after `after`.
 *
 * Deliberately not "previous occurrence plus interval": after a period of
 * downtime an hourly report should go out once, now, rather than six times
 * with stale contents. This is the same catch-up policy Service.nextCheckAt
 * follows.
 */
export function computeNextRunAt(spec: AgentScheduleSpec, after: Date): Date {
  if (spec.kind === "INTERVAL") {
    const seconds = Math.max(spec.intervalSeconds ?? 0, MIN_INTERVAL_SECONDS);
    return new Date(after.getTime() + seconds * 1_000);
  }

  const minuteOfDay = spec.minuteOfDay ?? 0;
  const timeZone = isValidTimeZone(spec.timeZone) ? spec.timeZone : "UTC";
  const days =
    spec.kind === "WEEKLY" && spec.daysOfWeek?.length
      ? new Set(spec.daysOfWeek)
      : null;

  for (let offset = 0; offset <= MAX_SEARCH_DAYS; offset++) {
    const probe = new Date(after.getTime() + offset * 86_400_000);
    const local = partsIn(timeZone, probe);
    const candidate = zonedWallTimeToUtc(
      timeZone,
      local.year,
      local.month,
      local.day,
      minuteOfDay,
    );
    if (candidate.getTime() <= after.getTime()) continue;
    if (days && !days.has(localWeekday(timeZone, candidate))) continue;
    return candidate;
  }

  // Unreachable for a valid spec: a daily time recurs within a day and a
  // weekly one within a week. Answering a week out is still better than
  // throwing inside a scheduler tick.
  return new Date(after.getTime() + 7 * 86_400_000);
}
