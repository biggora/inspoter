// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  TimeSeriesChart,
  seriesStats,
  type ChartSeries,
} from "@/components/ui/time-series-chart";

// Absence of data is a state, not a failure: a server that has never reported,
// a range with a gap in it, or a metric the agent doesn't fill must render an
// empty chart rather than throw. These cases are what the detail page shows on
// the day an agent is installed, so they are the common path, not the corner.

const noop = (value: number) => String(value);
const noopTime = (iso: string) => iso;

function renderChart(
  timestamps: string[],
  series: ChartSeries[],
  extra: Partial<React.ComponentProps<typeof TimeSeriesChart>> = {},
) {
  return render(
    <TimeSeriesChart
      timestamps={timestamps}
      series={series}
      formatValue={noop}
      formatTime={noopTime}
      ariaLabel="chart"
      {...extra}
    />,
  );
}

describe("seriesStats", () => {
  it("returns null for a series with no values at all", () => {
    expect(seriesStats([])).toBeNull();
  });

  it("returns null for a series that is entirely gaps", () => {
    expect(seriesStats([null, null, null])).toBeNull();
  });

  it("ignores gaps when summarising", () => {
    expect(seriesStats([10, null, 30])).toEqual({
      min: 10,
      avg: 20,
      max: 30,
      last: 30,
    });
  });

  it("falls back to the last present value when the series ends in a gap", () => {
    expect(seriesStats([10, 20, null])?.last).toBe(20);
  });
});

describe("TimeSeriesChart with no data", () => {
  it("renders an empty plot instead of throwing", () => {
    expect(() => renderChart([], [])).not.toThrow();
    expect(screen.getByRole("img", { name: "chart" })).toBeInTheDocument();
  });

  it("renders a series whose values are all gaps", () => {
    renderChart(
      ["2026-07-31T10:00:00.000Z", "2026-07-31T10:10:00.000Z"],
      [{ key: "cpu", label: "CPU", values: [null, null], tone: "primary" }],
    );

    const path = document
      .querySelector("svg[role=img]")
      ?.querySelector("path[fill='none']");
    expect(path?.getAttribute("d")).toBe("");
    // No stats line: there is nothing to summarise.
    expect(screen.queryByText(/min/)).not.toBeInTheDocument();
  });

  it("still draws a single-sample series", () => {
    renderChart(
      ["2026-07-31T10:00:00.000Z"],
      [{ key: "cpu", label: "CPU", values: [42], tone: "primary", area: true }],
    );

    const path = document
      .querySelector("svg[role=img]")
      ?.querySelector("path[fill='none']");
    expect(path?.getAttribute("d")).not.toBe("");
  });

  it("keeps a fixed axis usable when every value is zero", () => {
    renderChart(
      ["2026-07-31T10:00:00.000Z"],
      [{ key: "disk", label: "Disk", values: [0], tone: "primary" }],
    );

    // Auto-scaled axis: a zero-only series must not produce a zero-height
    // scale (which would divide by zero when placing points).
    expect(screen.getByRole("img", { name: "chart" })).toBeInTheDocument();
  });

  it("ignores markers that fall outside the rendered window", () => {
    expect(() =>
      renderChart(
        ["2026-07-31T10:00:00.000Z"],
        [{ key: "cpu", label: "CPU", values: [10], tone: "primary" }],
        { markers: ["2020-01-01T00:00:00.000Z"], markerLabel: "reboot" },
      ),
    ).not.toThrow();
    expect(
      document.querySelectorAll("svg[role=img] line[stroke-dasharray]"),
    ).toHaveLength(0);
  });
});
