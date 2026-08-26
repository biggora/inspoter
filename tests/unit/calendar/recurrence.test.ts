import { describe, expect, it } from "vitest";

import {
  expandRecurrence,
  nextRecurrence,
  previousRecurrence,
  truncateRecurrence,
} from "@/lib/calendar/recurrence";
import type { RecurrenceRuleInput } from "@/lib/calendar/types";

const daily: RecurrenceRuleInput = {
  frequency: "DAILY",
  interval: 1,
  end: { type: "NEVER" },
};

describe("calendar recurrence", () => {
  it("keeps the local wall time across a spring DST change", () => {
    const result = expandRecurrence(
      daily,
      new Date("2026-03-28T07:00:00.000Z"),
      "Europe/Riga",
      new Date("2026-03-28T00:00:00.000Z"),
      new Date("2026-03-31T00:00:00.000Z"),
    );

    expect(result.dates.map((date) => date.toISOString())).toEqual([
      "2026-03-28T07:00:00.000Z",
      "2026-03-29T06:00:00.000Z",
      "2026-03-30T06:00:00.000Z",
    ]);
  });

  it("uses the selected IANA zone independently for the same wall time", () => {
    const next = nextRecurrence(
      daily,
      new Date("2026-10-31T13:00:00.000Z"),
      "America/New_York",
      new Date("2026-10-31T13:00:00.000Z"),
    );

    expect(next?.toISOString()).toBe("2026-11-01T14:00:00.000Z");
  });

  it("supports leap-year yearly schedules", () => {
    const result = expandRecurrence(
      { frequency: "YEARLY", interval: 1, end: { type: "COUNT", count: 3 } },
      new Date("2024-02-29T12:00:00.000Z"),
      "UTC",
      new Date("2024-01-01T00:00:00.000Z"),
      new Date("2033-01-01T00:00:00.000Z"),
    );

    expect(result.dates.map((date) => date.toISOString().slice(0, 10))).toEqual(
      ["2024-02-29", "2028-02-29", "2032-02-29"],
    );
  });

  it("supports the last day of each month", () => {
    const result = expandRecurrence(
      {
        frequency: "MONTHLY",
        interval: 1,
        monthlyMode: "LAST_DAY",
        end: { type: "COUNT", count: 3 },
      },
      new Date("2026-01-31T08:00:00.000Z"),
      "UTC",
      new Date("2026-01-01T00:00:00.000Z"),
      new Date("2026-05-01T00:00:00.000Z"),
    );

    expect(result.dates.map((date) => date.toISOString().slice(0, 10))).toEqual(
      ["2026-01-31", "2026-02-28", "2026-03-31"],
    );
  });

  it("honors count, until, previous and series truncation", () => {
    const counted = { ...daily, end: { type: "COUNT" as const, count: 3 } };
    const anchor = new Date("2026-01-01T10:00:00.000Z");
    const rangeEnd = new Date("2026-01-10T00:00:00.000Z");
    expect(
      expandRecurrence(counted, anchor, "UTC", anchor, rangeEnd).dates,
    ).toHaveLength(3);

    const previous = previousRecurrence(
      daily,
      anchor,
      "UTC",
      new Date("2026-01-04T09:00:00.000Z"),
    );
    expect(previous?.toISOString()).toBe("2026-01-03T10:00:00.000Z");

    const truncated = truncateRecurrence(daily, previous!);
    expect(
      expandRecurrence(truncated, anchor, "UTC", anchor, rangeEnd).dates.map(
        (date) => date.toISOString(),
      ),
    ).toEqual([
      "2026-01-01T10:00:00.000Z",
      "2026-01-02T10:00:00.000Z",
      "2026-01-03T10:00:00.000Z",
    ]);
  });
});
