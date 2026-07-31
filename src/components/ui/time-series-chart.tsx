"use client";

import { useCallback, useMemo, useRef, useState } from "react";

import { cn } from "@/lib/utils";

// Line chart for a metric over time (server detail page). Inline SVG rather
// than a charting library: the product draws its other quantitative surfaces —
// the utilisation meter, the service heartbeat strip — from the same tokens by
// hand, and a dependency would arrive with its own palette and its own idea of
// dark mode.
//
// The plot uses a fixed viewBox stretched with preserveAspectRatio="none", so
// point coordinates are pure arithmetic on the data index; strokes carry
// vector-effect="non-scaling-stroke" so that stretch never thickens a line.
// Axis labels are HTML beside the SVG for the same reason.
//
// Colour is never the only carrier: every series is named in the legend with
// its current value, and the summary line under the chart states min/avg/max
// as text.

const VIEW_WIDTH = 1000;
const VIEW_HEIGHT = 300;
const GRID_STEPS = 4;

export type ChartTone = "primary" | "accent" | "secondary";

export interface ChartSeries {
  key: string;
  label: string;
  /** One entry per timestamp; null marks a gap and breaks the line. */
  values: (number | null)[];
  tone: ChartTone;
  /** Fills the area under the line — for a single-series chart. */
  area?: boolean;
}

const TONE_STROKE: Record<ChartTone, string> = {
  primary: "stroke-primary-500",
  accent: "stroke-accent-500",
  secondary: "stroke-secondary-500",
};

const TONE_FILL: Record<ChartTone, string> = {
  primary: "fill-primary-500",
  accent: "fill-accent-500",
  secondary: "fill-secondary-500",
};

const TONE_SWATCH: Record<ChartTone, string> = {
  primary: "bg-primary-500",
  accent: "bg-accent-500",
  secondary: "bg-secondary-500",
};

export interface SeriesStats {
  min: number;
  avg: number;
  max: number;
  last: number | null;
}

/** min/avg/max/last of a series, ignoring gaps. Null when it holds no data. */
export function seriesStats(values: (number | null)[]): SeriesStats | null {
  const present = values.filter((value): value is number => value !== null);
  if (present.length === 0) return null;
  const sum = present.reduce((total, value) => total + value, 0);
  return {
    min: Math.min(...present),
    avg: sum / present.length,
    max: Math.max(...present),
    last: values[values.length - 1] ?? present[present.length - 1],
  };
}

// A y-axis that ends exactly at the tallest point makes every chart look
// equally full; rounding up to a round number keeps peaks readable and lets
// two charts of the same unit be compared by eye.
function niceCeiling(value: number): number {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude;
  const step =
    normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return step * magnitude;
}

function pointX(index: number, count: number): number {
  if (count <= 1) return VIEW_WIDTH / 2;
  return (index / (count - 1)) * VIEW_WIDTH;
}

function pointY(value: number, max: number): number {
  const ratio = max <= 0 ? 0 : Math.min(1, Math.max(0, value / max));
  return VIEW_HEIGHT - ratio * VIEW_HEIGHT;
}

/** One `M…L…` run per uninterrupted stretch, so gaps aren't bridged. */
function linePath(values: (number | null)[], max: number): string {
  const segments: string[] = [];
  let current: string[] = [];

  values.forEach((value, index) => {
    if (value === null) {
      if (current.length > 0) segments.push(current.join(" "));
      current = [];
      return;
    }
    const x = pointX(index, values.length).toFixed(2);
    const y = pointY(value, max).toFixed(2);
    current.push(`${current.length === 0 ? "M" : "L"}${x} ${y}`);
  });

  if (current.length > 0) segments.push(current.join(" "));
  // A lone point would draw nothing as a path — give it a zero-length line so
  // a single-sample series is still visible.
  return segments
    .map((segment) => (segment.includes("L") ? segment : `${segment} l0.01 0`))
    .join(" ");
}

function areaPath(values: (number | null)[], max: number): string {
  const present: { x: number; y: number }[] = [];
  values.forEach((value, index) => {
    if (value === null) return;
    present.push({ x: pointX(index, values.length), y: pointY(value, max) });
  });
  if (present.length === 0) return "";
  const head = present
    .map(
      (point, index) =>
        `${index === 0 ? "M" : "L"}${point.x.toFixed(2)} ${point.y.toFixed(2)}`,
    )
    .join(" ");
  return `${head} L${present[present.length - 1].x.toFixed(2)} ${VIEW_HEIGHT} L${present[0].x.toFixed(2)} ${VIEW_HEIGHT} Z`;
}

export interface TimeSeriesChartProps {
  /** ISO timestamps, one per value index. */
  timestamps: string[];
  series: ChartSeries[];
  /** Fixed axis top — 100 for percentages. Omit to scale to the data. */
  yMax?: number;
  formatValue: (value: number) => string;
  formatTime: (iso: string) => string;
  /**
   * Axis ends. Defaults to formatTime, but a 24-hour window starts and ends at
   * the same clock time, so callers pass a form that carries the date.
   */
  formatAxisTime?: (iso: string) => string;
  /** ISO timestamps drawn as vertical markers (server reboots). */
  markers?: string[];
  markerLabel?: string;
  /** Localised "min {min} · avg {avg} · max {max} · now {last}" per series. */
  formatSummary?: (series: ChartSeries, stats: SeriesStats) => string;
  ariaLabel: string;
  height?: number;
  className?: string;
}

export function TimeSeriesChart({
  timestamps,
  series,
  yMax,
  formatValue,
  formatTime,
  formatAxisTime,
  markers,
  markerLabel,
  formatSummary,
  ariaLabel,
  height = 176,
  className,
}: TimeSeriesChartProps) {
  const plotRef = useRef<HTMLDivElement>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const axisMax = useMemo(() => {
    if (yMax !== undefined) return yMax;
    const peak = series.reduce((highest, entry) => {
      const stats = seriesStats(entry.values);
      return stats ? Math.max(highest, stats.max) : highest;
    }, 0);
    return niceCeiling(peak);
  }, [series, yMax]);

  const markerIndexes = useMemo(() => {
    if (!markers?.length) return [];
    const positions = new Map(timestamps.map((iso, index) => [iso, index]));
    return markers
      .map((iso) => positions.get(iso))
      .filter((index): index is number => index !== undefined);
  }, [markers, timestamps]);

  const handlePointer = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const element = plotRef.current;
      if (!element || timestamps.length === 0) return;
      const rect = element.getBoundingClientRect();
      if (rect.width === 0) return;
      const ratio = (event.clientX - rect.left) / rect.width;
      const index = Math.round(ratio * (timestamps.length - 1));
      setHoverIndex(Math.min(timestamps.length - 1, Math.max(0, index)));
    },
    [timestamps.length],
  );

  const axisTime = formatAxisTime ?? formatTime;
  const stats = series.map((entry) => seriesStats(entry.values));
  const hoverX =
    hoverIndex === null
      ? 0
      : (pointX(hoverIndex, timestamps.length) / VIEW_WIDTH) * 100;

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex gap-2">
        <div
          aria-hidden
          className="flex w-12 shrink-0 flex-col justify-between text-right text-[10px] leading-none text-foreground-400"
          style={{ height }}
        >
          {Array.from({ length: GRID_STEPS + 1 }, (_, step) => (
            <span key={step}>
              {formatValue((axisMax * (GRID_STEPS - step)) / GRID_STEPS)}
            </span>
          ))}
        </div>

        <div
          ref={plotRef}
          className="relative min-w-0 flex-1"
          style={{ height }}
          onPointerMove={handlePointer}
          onPointerLeave={() => setHoverIndex(null)}
        >
          <svg
            viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
            preserveAspectRatio="none"
            role="img"
            aria-label={ariaLabel}
            className="h-full w-full rounded-md border border-background-200 bg-background-50"
          >
            {Array.from({ length: GRID_STEPS + 1 }, (_, step) => {
              const y = (VIEW_HEIGHT / GRID_STEPS) * step;
              return (
                <line
                  key={step}
                  x1={0}
                  x2={VIEW_WIDTH}
                  y1={y}
                  y2={y}
                  className="stroke-background-200"
                  strokeWidth={1}
                  vectorEffect="non-scaling-stroke"
                />
              );
            })}

            {markerIndexes.map((index) => {
              const x = pointX(index, timestamps.length);
              return (
                <line
                  key={`marker-${index}`}
                  x1={x}
                  x2={x}
                  y1={0}
                  y2={VIEW_HEIGHT}
                  className="stroke-foreground-400"
                  strokeWidth={1}
                  strokeDasharray="4 4"
                  vectorEffect="non-scaling-stroke"
                />
              );
            })}

            {series.map((entry) =>
              entry.area ? (
                <path
                  key={`area-${entry.key}`}
                  d={areaPath(entry.values, axisMax)}
                  className={cn(TONE_FILL[entry.tone], "opacity-10")}
                />
              ) : null,
            )}

            {series.map((entry) => (
              <path
                key={entry.key}
                d={linePath(entry.values, axisMax)}
                fill="none"
                strokeWidth={1.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
                className={cn(TONE_STROKE[entry.tone], "animate-fade-in")}
              />
            ))}

            {hoverIndex !== null && (
              <line
                x1={pointX(hoverIndex, timestamps.length)}
                x2={pointX(hoverIndex, timestamps.length)}
                y1={0}
                y2={VIEW_HEIGHT}
                className="stroke-foreground-400"
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
              />
            )}
          </svg>

          {hoverIndex !== null && timestamps[hoverIndex] && (
            <div
              className={cn(
                "pointer-events-none absolute top-1 z-10 min-w-32 rounded-md border border-background-200 bg-background-50 px-2 py-1 text-[11px] leading-tight shadow-sm",
                hoverX > 60 ? "-translate-x-full" : "",
              )}
              style={{ left: `${hoverX}%` }}
            >
              <p className="text-foreground-500">
                {formatTime(timestamps[hoverIndex])}
              </p>
              {series.map((entry) => (
                <p key={entry.key} className="flex justify-between gap-3">
                  <span className="text-foreground-600">{entry.label}</span>
                  <span className="font-medium text-foreground-900">
                    {entry.values[hoverIndex] === null ||
                    entry.values[hoverIndex] === undefined
                      ? "—"
                      : formatValue(entry.values[hoverIndex]!)}
                  </span>
                </p>
              ))}
              {markerIndexes.includes(hoverIndex) && markerLabel && (
                <p className="text-foreground-500">{markerLabel}</p>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 pl-14 text-[10px] text-foreground-400">
        <span>{timestamps.length > 0 ? axisTime(timestamps[0]) : ""}</span>
        <span>
          {timestamps.length > 0
            ? axisTime(timestamps[timestamps.length - 1])
            : ""}
        </span>
      </div>

      <ul className="flex flex-col gap-1 pl-14 text-xs text-foreground-600">
        {series.map((entry, index) => {
          const entryStats = stats[index];
          return (
            <li key={entry.key} className="flex flex-wrap items-center gap-2">
              <span
                aria-hidden
                className={cn(
                  "size-2 shrink-0 rounded-full",
                  TONE_SWATCH[entry.tone],
                )}
              />
              <span className="font-medium text-foreground-800">
                {entry.label}
              </span>
              {entryStats && (
                <span className="text-foreground-500">
                  {formatSummary
                    ? formatSummary(entry, entryStats)
                    : `${formatValue(entryStats.min)} … ${formatValue(entryStats.max)}`}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
