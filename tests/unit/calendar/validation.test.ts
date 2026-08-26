import { describe, expect, it } from "vitest";

import {
  calendarLinkSchema,
  calendarRangeSchema,
  reminderSchema,
} from "@/lib/validation/calendar";

const reminder = {
  title: "Pay hosting",
  dueAt: "2026-09-01T09:00:00.000Z",
  timeZone: "Europe/Riga",
  links: [],
};

describe("calendar validation", () => {
  it("limits range requests to 93 days", () => {
    expect(
      calendarRangeSchema.safeParse({
        from: "2026-01-01T00:00:00.000Z",
        to: "2026-04-04T00:00:00.000Z",
      }).success,
    ).toBe(true);
    expect(
      calendarRangeSchema.safeParse({
        from: "2026-01-01T00:00:00.000Z",
        to: "2026-04-05T00:00:00.001Z",
      }).success,
    ).toBe(false);
  });

  it("requires complete payment metadata and an ISO currency", () => {
    expect(
      reminderSchema.safeParse({ ...reminder, kind: "PAYMENT" }).success,
    ).toBe(false);
    expect(
      reminderSchema.safeParse({
        ...reminder,
        kind: "PAYMENT",
        amount: "49.99",
        currency: "EUR",
        payee: "Hosting provider",
      }).success,
    ).toBe(true);
    expect(
      reminderSchema.safeParse({
        ...reminder,
        kind: "PAYMENT",
        amount: "49.999",
        currency: "euro",
        payee: "Hosting provider",
      }).success,
    ).toBe(false);
  });

  it("rejects mixed standalone and event-linked schedules", () => {
    expect(
      reminderSchema.safeParse({
        ...reminder,
        calendarEventId: "event-1",
        offsetMinutes: 15,
      }).success,
    ).toBe(false);
    expect(
      reminderSchema.safeParse({
        title: "Prepare",
        calendarEventId: "event-1",
        offsetMinutes: 15,
        timeZone: "UTC",
        links: [],
      }).success,
    ).toBe(true);
  });

  it("allows only HTTP and HTTPS external links", () => {
    const base = {
      targetType: "EXTERNAL_URL",
      targetId: "https://example.com/invoice",
      targetLabel: "Invoice",
    };
    expect(calendarLinkSchema.safeParse(base).success).toBe(true);
    expect(
      calendarLinkSchema.safeParse({
        ...base,
        targetId: "javascript:alert(1)",
      }).success,
    ).toBe(false);
  });
});
