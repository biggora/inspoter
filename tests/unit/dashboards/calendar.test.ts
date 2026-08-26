import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  alertFindMany: vi.fn(),
  serviceCheckFindMany: vi.fn(),
  mailItemFindMany: vi.fn(),
  activityFindMany: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    alert: { findMany: mocks.alertFindMany },
    serviceCheck: { findMany: mocks.serviceCheckFindMany },
    mailItem: { findMany: mocks.mailItemFindMany },
    activity: { findMany: mocks.activityFindMany },
  },
}));

import { getMonthEvents, monthRange } from "@/lib/services/dashboard-calendar";

const july = new Date("2026-07-15T12:00:00.000Z");

beforeEach(() => {
  mocks.alertFindMany.mockReset().mockResolvedValue([]);
  mocks.serviceCheckFindMany.mockReset().mockResolvedValue([]);
  mocks.mailItemFindMany.mockReset().mockResolvedValue([]);
  mocks.activityFindMany.mockReset().mockResolvedValue([]);
});

describe("monthRange", () => {
  it("spans the first day of the month up to the first day of the next", () => {
    expect(monthRange(july)).toEqual({
      from: new Date("2026-07-01T00:00:00.000Z"),
      to: new Date("2026-08-01T00:00:00.000Z"),
    });
  });

  it("rolls over the year in December", () => {
    expect(monthRange(new Date("2026-12-09T00:00:00.000Z")).to).toEqual(
      new Date("2027-01-01T00:00:00.000Z"),
    );
  });
});

describe("getMonthEvents", () => {
  it("buckets timestamps of one source per calendar day", async () => {
    mocks.alertFindMany.mockResolvedValue([
      { timestamp: new Date("2026-07-03T08:00:00.000Z") },
      { timestamp: new Date("2026-07-03T19:30:00.000Z") },
      { timestamp: new Date("2026-07-09T05:00:00.000Z") },
    ]);

    const result = await getMonthEvents("workspace-1", july, ["alerts"]);

    expect(result.month).toBe("2026-07-01");
    expect(result.days).toEqual([
      {
        date: "2026-07-03",
        counts: {
          calendarEvents: 0,
          reminders: 0,
          alerts: 2,
          serviceIncidents: 0,
          mail: 0,
          activity: 0,
        },
        total: 2,
      },
      {
        date: "2026-07-09",
        counts: {
          calendarEvents: 0,
          reminders: 0,
          alerts: 1,
          serviceIncidents: 0,
          mail: 0,
          activity: 0,
        },
        total: 1,
      },
    ]);
    expect(result.truncated).toEqual([]);
  });

  it("merges several sources into one bucket per day", async () => {
    mocks.alertFindMany.mockResolvedValue([
      { timestamp: new Date("2026-07-04T08:00:00.000Z") },
    ]);
    mocks.serviceCheckFindMany.mockResolvedValue([
      { checkedAt: new Date("2026-07-04T09:00:00.000Z") },
    ]);

    const result = await getMonthEvents("workspace-1", july, [
      "alerts",
      "serviceIncidents",
    ]);

    expect(result.days).toHaveLength(1);
    expect(result.days[0]).toMatchObject({
      date: "2026-07-04",
      counts: {
        calendarEvents: 0,
        reminders: 0,
        alerts: 1,
        serviceIncidents: 1,
        mail: 0,
        activity: 0,
      },
      total: 2,
    });
  });

  it("only queries the requested sources", async () => {
    await getMonthEvents("workspace-1", july, ["mail"]);

    expect(mocks.mailItemFindMany).toHaveBeenCalledTimes(1);
    expect(mocks.alertFindMany).not.toHaveBeenCalled();
    expect(mocks.serviceCheckFindMany).not.toHaveBeenCalled();
    expect(mocks.activityFindMany).not.toHaveBeenCalled();
  });

  it("de-duplicates a repeated source", async () => {
    await getMonthEvents("workspace-1", july, ["mail", "mail"]);

    expect(mocks.mailItemFindMany).toHaveBeenCalledTimes(1);
  });

  it("scopes every query to the workspace and the month", async () => {
    await getMonthEvents("workspace-1", july, ["activity"]);

    expect(mocks.activityFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          workspaceId: "workspace-1",
          timestamp: {
            gte: new Date("2026-07-01T00:00:00.000Z"),
            lt: new Date("2026-08-01T00:00:00.000Z"),
          },
        },
      }),
    );
  });

  it("counts only DOWN checks as service incidents", async () => {
    await getMonthEvents("workspace-1", july, ["serviceIncidents"]);

    expect(mocks.serviceCheckFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: "DOWN" }),
      }),
    );
  });

  it("flags a truncated source and keeps the counts at the cap", async () => {
    const many = Array.from({ length: 2001 }, () => ({
      timestamp: new Date("2026-07-06T00:00:00.000Z"),
    }));
    mocks.alertFindMany.mockResolvedValue(many);

    const result = await getMonthEvents("workspace-1", july, ["alerts"]);

    expect(result.truncated).toEqual(["alerts"]);
    expect(result.days[0].total).toBe(2000);
  });

  it("returns no days when nothing happened", async () => {
    const result = await getMonthEvents("workspace-1", july, [
      "alerts",
      "mail",
    ]);

    expect(result.days).toEqual([]);
    expect(result.truncated).toEqual([]);
  });
});
