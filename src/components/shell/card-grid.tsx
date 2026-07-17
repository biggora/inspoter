import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

const columnStyles = {
  2: "grid grid-cols-1 sm:grid-cols-2 gap-4",
  3: "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4",
} as const;

interface CardGridProps {
  columns?: 2 | 3;
  className?: string;
  children: ReactNode;
}

export function CardGrid({
  columns = 3,
  className,
  children,
}: CardGridProps) {
  return (
    <div
      data-slot="card-grid"
      className={cn(columnStyles[columns], className)}
    >
      {children}
    </div>
  );
}
