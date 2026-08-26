import { Temporal } from "temporal-polyfill";

export function instantToLocalInput(iso: string, timeZone: string): string {
  return Temporal.Instant.from(iso)
    .toZonedDateTimeISO(timeZone)
    .toPlainDateTime()
    .toString({ smallestUnit: "minute" });
}

export function localInputToInstant(value: string, timeZone: string): string {
  return Temporal.PlainDateTime.from(value)
    .toZonedDateTime(timeZone)
    .toInstant()
    .toString();
}

export function defaultLocalInput(
  timeZone: string,
  minutesFromNow = 0,
): string {
  return Temporal.Now.instant()
    .add({ minutes: minutesFromNow })
    .toZonedDateTimeISO(timeZone)
    .toPlainDateTime()
    .round({ smallestUnit: "minute", roundingIncrement: 15 })
    .toString({ smallestUnit: "minute" });
}
