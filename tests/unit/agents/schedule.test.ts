import { describe, expect, it } from "vitest";
import {
  computeNextRunAt,
  isValidTimeZone,
  MIN_INTERVAL_SECONDS,
} from "@/lib/agents/schedule";

// Recurrence, with the clock injected. The DST cases are the reason this
// module exists rather than a naive "+24h": on the two days a year a zone
// shifts, a daily report must still land at the local time the operator chose.

const UTC = "UTC";
const RIGA = "Europe/Riga"; // EET/EEST, +02:00 / +03:00
const NEW_YORK = "America/New_York";

function at(iso: string): Date {
  return new Date(iso);
}

describe("computeNextRunAt — INTERVAL", () => {
  it("adds the interval to the given instant", () => {
    const next = computeNextRunAt(
      { kind: "INTERVAL", intervalSeconds: 900, timeZone: UTC },
      at("2026-03-01T10:00:00.000Z"),
    );
    expect(next.toISOString()).toBe("2026-03-01T10:15:00.000Z");
  });

  it("never schedules tighter than the floor", () => {
    const next = computeNextRunAt(
      { kind: "INTERVAL", intervalSeconds: 5, timeZone: UTC },
      at("2026-03-01T10:00:00.000Z"),
    );
    expect(next.getTime() - at("2026-03-01T10:00:00.000Z").getTime()).toBe(
      MIN_INTERVAL_SECONDS * 1_000,
    );
  });

  it("does not catch up on missed occurrences", () => {
    // Six hours late, hourly: the answer is one hour from now, not six runs.
    const now = at("2026-03-01T16:00:00.000Z");
    const next = computeNextRunAt(
      { kind: "INTERVAL", intervalSeconds: 3_600, timeZone: UTC },
      now,
    );
    expect(next.toISOString()).toBe("2026-03-01T17:00:00.000Z");
  });
});

describe("computeNextRunAt — DAILY", () => {
  it("picks today when the time is still ahead", () => {
    const next = computeNextRunAt(
      { kind: "DAILY", minuteOfDay: 9 * 60, timeZone: UTC },
      at("2026-03-01T06:00:00.000Z"),
    );
    expect(next.toISOString()).toBe("2026-03-01T09:00:00.000Z");
  });

  it("rolls to tomorrow when the time has passed", () => {
    const next = computeNextRunAt(
      { kind: "DAILY", minuteOfDay: 9 * 60, timeZone: UTC },
      at("2026-03-01T09:00:00.000Z"),
    );
    expect(next.toISOString()).toBe("2026-03-02T09:00:00.000Z");
  });

  it("keeps the local hour across a spring-forward boundary", () => {
    // Riga moves +02:00 -> +03:00 at 03:00 local on 2026-03-29. A 09:00 local
    // report is 07:00Z before the switch and 06:00Z after it.
    const spec = {
      kind: "DAILY" as const,
      minuteOfDay: 9 * 60,
      timeZone: RIGA,
    };
    expect(
      computeNextRunAt(spec, at("2026-03-28T12:00:00.000Z")).toISOString(),
    ).toBe("2026-03-29T06:00:00.000Z");
    expect(
      computeNextRunAt(spec, at("2026-03-27T12:00:00.000Z")).toISOString(),
    ).toBe("2026-03-28T07:00:00.000Z");
  });

  it("keeps the local hour across a fall-back boundary", () => {
    // New York moves -04:00 -> -05:00 at 02:00 local on 2026-11-01. An 08:00
    // local report is 12:00Z before and 13:00Z after.
    const spec = {
      kind: "DAILY" as const,
      minuteOfDay: 8 * 60,
      timeZone: NEW_YORK,
    };
    expect(
      computeNextRunAt(spec, at("2026-10-30T20:00:00.000Z")).toISOString(),
    ).toBe("2026-10-31T12:00:00.000Z");
    expect(
      computeNextRunAt(spec, at("2026-10-31T20:00:00.000Z")).toISOString(),
    ).toBe("2026-11-01T13:00:00.000Z");
  });

  it("answers with an existing minute when the wall time is skipped", () => {
    // 03:30 local does not exist in Riga on 2026-03-29 — the clock jumps from
    // 03:00 to 04:00. The answer must still be a real instant that day.
    const next = computeNextRunAt(
      { kind: "DAILY", minuteOfDay: 3 * 60 + 30, timeZone: RIGA },
      at("2026-03-28T23:00:00.000Z"),
    );
    expect(Number.isNaN(next.getTime())).toBe(false);
    expect(next.getTime()).toBeGreaterThan(
      at("2026-03-28T23:00:00.000Z").getTime(),
    );
    expect(next.toISOString().slice(0, 10)).toBe("2026-03-29");
  });
});

describe("computeNextRunAt — WEEKLY", () => {
  it("picks the next listed weekday", () => {
    // 2026-03-01 is a Sunday. Asking for Monday (1) and Friday (5).
    const spec = {
      kind: "WEEKLY" as const,
      minuteOfDay: 7 * 60,
      daysOfWeek: [1, 5],
      timeZone: UTC,
    };
    expect(
      computeNextRunAt(spec, at("2026-03-01T12:00:00.000Z")).toISOString(),
    ).toBe("2026-03-02T07:00:00.000Z");
    expect(
      computeNextRunAt(spec, at("2026-03-02T12:00:00.000Z")).toISOString(),
    ).toBe("2026-03-06T07:00:00.000Z");
  });

  it("wraps around the end of the week", () => {
    // Friday 12:00, wanting Monday only.
    const next = computeNextRunAt(
      {
        kind: "WEEKLY",
        minuteOfDay: 7 * 60,
        daysOfWeek: [1],
        timeZone: UTC,
      },
      at("2026-03-06T12:00:00.000Z"),
    );
    expect(next.toISOString()).toBe("2026-03-09T07:00:00.000Z");
  });

  it("uses the weekday of the target zone, not of UTC", () => {
    // 22:00 Monday in New York is 02:00 Tuesday UTC; a Monday-only schedule
    // must still fire.
    const next = computeNextRunAt(
      {
        kind: "WEEKLY",
        minuteOfDay: 22 * 60,
        daysOfWeek: [1],
        timeZone: NEW_YORK,
      },
      at("2026-03-02T12:00:00.000Z"),
    );
    expect(next.toISOString()).toBe("2026-03-03T03:00:00.000Z");
  });
});

describe("isValidTimeZone", () => {
  it("accepts an IANA zone and rejects nonsense", () => {
    expect(isValidTimeZone("Europe/Riga")).toBe(true);
    expect(isValidTimeZone("UTC")).toBe(true);
    expect(isValidTimeZone("Middle/Earth")).toBe(false);
  });

  it("falls back to UTC rather than throwing on a bad stored zone", () => {
    const next = computeNextRunAt(
      { kind: "DAILY", minuteOfDay: 0, timeZone: "Middle/Earth" },
      at("2026-03-01T06:00:00.000Z"),
    );
    expect(next.toISOString()).toBe("2026-03-02T00:00:00.000Z");
  });
});
