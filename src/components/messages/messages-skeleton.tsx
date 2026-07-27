import type { ReactNode } from "react";

import { LoadingRegion } from "@/components/ui/loading";
import { ListSkeleton, PageHeaderSkeleton } from "@/components/ui/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Two-pane messages placeholder, shared by the route fallback
 * (`messages/loading.tsx`) and the view's own initial-load branch. The view
 * passes its real `PageHeader` — during a route transition the title isn't
 * known yet, so the fallback gets a header skeleton instead.
 *
 * Renders the panes only; the caller owns the `PageBody fullBleed` wrapper
 * (see the note in mail-skeleton.tsx).
 */
export function MessagesSkeleton({ header }: { header?: ReactNode }) {
  return (
    <>
      <div className="shrink-0 border-b border-background-200 px-4 pt-4 pb-3 sm:px-6 sm:pt-6 sm:pb-4">
        {header ?? <PageHeaderSkeleton />}
      </div>
      <LoadingRegion className="flex min-h-0 flex-1">
        <div className="hidden w-64 shrink-0 flex-col border-r border-background-200 bg-background-50 lg:flex">
          <div className="flex flex-col gap-4 px-3 py-4">
            {[0, 1, 2].map((group) => (
              <div key={group} className="flex flex-col gap-2">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
              </div>
            ))}
          </div>
        </div>
        <div className="flex flex-1 flex-col bg-background-50">
          <div className="border-b border-background-100 px-5 py-3">
            <Skeleton className="h-5 w-36" />
          </div>
          <ListSkeleton rows={5} avatar className="flex-1 gap-4 p-5" />
        </div>
      </LoadingRegion>
    </>
  );
}
