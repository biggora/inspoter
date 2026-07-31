import { describe, expect, it } from "vitest";

import {
  buildHistoryPoints,
  HISTORY_RANGES,
  HISTORY_RANGE_KEYS,
  isHistoryRange,
} from "@/lib/services/serverMetricsHistory";

// Pure half of the history service: bucket presets and the row → chart point
// transformation. The SQL half is covered by the integration suite.

const GB = 1024 ** 3;

function row(
  overrides: Partial<Parameters<typeof buildHistoryPoints>[0][number]> = {},
) {
  return {
    bucket: new Date("2026-07-31T10:00:00.000Z"),
    cpu_avg: 12.34,
    cpu_max: 55.55,
    load1: 0.456,
    load5: 0.321,
    load15: 0.222,
    mem_used: 2 * GB,
    mem_total: 4 * GB,
    swap_used: 0,
    swap_total: 0,
    fs_used: 30 * GB,
    fs_total: 80 * GB,
    uptime_min: 100_000,
    ...overrides,
  };
}

describe("history range presets", () => {
  it("offers the ranges the detail page switches between", () => {
    expect(HISTORY_RANGE_KEYS).toEqual(["24h", "48h", "5d", "7d", "30d"]);
  });

  it("keeps every range between 100 and 200 points", () => {
    for (const key of HISTORY_RANGE_KEYS) {
      const { hours, bucketSeconds } = HISTORY_RANGES[key];
      const points = (hours * 3600) / bucketSeconds;
      expect(points).toBeGreaterThanOrEqual(100);
      expect(points).toBeLessThanOrEqual(200);
    }
  });

  it("accepts only known range keys", () => {
    expect(isHistoryRange("24h")).toBe(true);
    expect(isHistoryRange("30d")).toBe(true);
    expect(isHistoryRange("1y")).toBe(false);
    expect(isHistoryRange(null)).toBe(false);
    expect(isHistoryRange("toString")).toBe(false);
  });
});

describe("buildHistoryPoints", () => {
  it("returns nothing for an empty series", () => {
    expect(buildHistoryPoints([])).toEqual({ points: [], reboots: [] });
  });

  it("derives percentages from the used/total pairs", () => {
    const { points } = buildHistoryPoints([row()]);

    expect(points).toHaveLength(1);
    expect(points[0].memoryPercent).toBe(50);
    expect(points[0].diskPercent).toBe(37.5);
    expect(points[0].t).toBe("2026-07-31T10:00:00.000Z");
  });

  it("reports no swap usage rather than 0% when the server has no swap", () => {
    const { points } = buildHistoryPoints([row()]);
    expect(points[0].swapPercent).toBeNull();
  });

  it("reports swap usage when swap exists", () => {
    const { points } = buildHistoryPoints([
      row({ swap_used: GB, swap_total: 2 * GB }),
    ]);
    expect(points[0].swapPercent).toBe(50);
  });

  it("rounds values to the precision the charts print", () => {
    const { points } = buildHistoryPoints([row()]);
    expect(points[0].cpuAvg).toBe(12.3);
    expect(points[0].cpuMax).toBe(55.6);
    expect(points[0].load1).toBe(0.46);
  });

  it("marks a bucket where uptime dropped as a reboot", () => {
    const { reboots } = buildHistoryPoints([
      row({ bucket: new Date("2026-07-31T10:00:00.000Z"), uptime_min: 90_000 }),
      row({ bucket: new Date("2026-07-31T11:00:00.000Z"), uptime_min: 93_600 }),
      row({ bucket: new Date("2026-07-31T12:00:00.000Z"), uptime_min: 120 }),
      row({ bucket: new Date("2026-07-31T13:00:00.000Z"), uptime_min: 3_720 }),
    ]);

    expect(reboots).toEqual(["2026-07-31T12:00:00.000Z"]);
  });

  it("never marks the first bucket as a reboot", () => {
    const { reboots } = buildHistoryPoints([row({ uptime_min: 10 })]);
    expect(reboots).toEqual([]);
  });

  it("guards against a zero total instead of dividing by it", () => {
    const { points } = buildHistoryPoints([row({ mem_total: 0, mem_used: 0 })]);
    expect(points[0].memoryPercent).toBe(0);
  });
});
