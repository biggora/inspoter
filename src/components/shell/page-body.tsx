import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

interface PageBodyProps {
  fullBleed?: boolean;
  className?: string;
  children: ReactNode;
}

export function PageBody({ fullBleed, className, children }: PageBodyProps) {
  return (
    <div
      data-slot="page-body"
      className={cn(
        fullBleed
          ? "-m-6 flex h-[calc(100vh-3.5rem)] flex-col"
          : "flex flex-col gap-6",
        className,
      )}
    >
      {children}
    </div>
  );
}
