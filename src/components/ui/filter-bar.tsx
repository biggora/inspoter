import * as React from "react";

import { cn } from "@/lib/utils";

function FilterBar({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="filter-bar"
      className={cn(
        "flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center **:data-[slot=input]:h-[var(--control-sm)] **:data-[slot=select-trigger]:h-[var(--control-sm)] **:data-[slot=button]:h-[var(--control-sm)]",
        className,
      )}
      {...props}
    />
  );
}

export { FilterBar };
