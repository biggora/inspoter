import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

// One labelled fact tile — the `dt`/`dd` pair used in the detail surfaces'
// summary grids (server detail, service detail). Sibling of MetricRow: where
// MetricRow is a meter row inside a shared 3-column grid, MetaItem is a plain
// key/value cell in the caller's own grid. Both must render the value the same
// way (`font-medium text-foreground-800`, tabular where numeric) so a page
// never shows two recipes for the same kind of fact.
//
// Must sit inside a `<dl>` (it renders `dt`/`dd`). The wrapper keeps `min-w-0`
// so the truncating `dd` actually shrinks inside grid/flex parents.

export function MetaItem({
  label,
  value,
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  className?: string;
}) {
  const empty = value === null || value === undefined || value === "";
  return (
    <div className={cn("min-w-0", className)}>
      <dt className="text-xs text-foreground-500">{label}</dt>
      <dd className="truncate font-medium text-foreground-800">
        {empty ? "—" : value}
      </dd>
    </div>
  );
}
