import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

// The labelled "label · value" rows inside a resource card — servers, hosting
// accounts (design.md §2.5).
//
// Every row of a section shares one grid rather than owning its own flex line,
// which is what keeps the columns true: the meters all begin after the widest
// label and end before the widest value, so their starts and ends line up
// vertically instead of drifting row by row.

export function MetricRows({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-[auto_1fr_auto] items-center gap-x-2 gap-y-1.5 text-xs",
        className,
      )}
    >
      {children}
    </div>
  );
}

// Renders three grid cells and no wrapper, so the row's columns are the
// section's columns. The middle cell holds a meter where the row describes a
// bounded resource, and stays empty otherwise — the value still ends flush
// right either way.
export function MetricRow({
  label,
  value,
  meter,
}: {
  label: string;
  value: string;
  meter?: ReactNode;
}) {
  return (
    <>
      <span className="text-foreground-500">{label}</span>
      {meter ?? <span />}
      <span className="truncate text-right font-medium text-foreground-800 tabular-nums">
        {value}
      </span>
    </>
  );
}
