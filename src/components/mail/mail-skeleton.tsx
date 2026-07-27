import type { ReactNode } from "react";

import { LoadingRegion } from "@/components/ui/loading";
import { ListSkeleton, PageHeaderSkeleton } from "@/components/ui/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Three-pane mail placeholder (folders / message list / reading pane), shared
 * by the route fallback (`mail/loading.tsx`) and the client view's initial
 * accounts load. The view passes its real `PageHeader`; the route fallback
 * falls back to a header skeleton.
 *
 * Renders the panes only — the caller owns the `PageBody fullBleed` wrapper,
 * so the view keeps the same root element in both its loading and loaded
 * branches and React updates it in place instead of remounting the page.
 */
export function MailSkeleton({ header }: { header?: ReactNode }) {
  return (
    <>
      <div className="shrink-0 border-b border-background-200 px-6 pt-6 pb-4">
        {header ?? <PageHeaderSkeleton actions={2} />}
      </div>
      <LoadingRegion className="flex min-h-0 flex-1">
        <div className="flex w-[220px] shrink-0 flex-col gap-2 border-r border-background-200 bg-background-50 p-3 max-lg:hidden">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
          {[0, 1, 2, 3].map((folder) => (
            <Skeleton key={folder} className="h-8 w-full" />
          ))}
        </div>
        <div className="flex w-full flex-col border-r border-background-200 bg-background-50 lg:w-[420px] lg:shrink-0">
          <div className="flex flex-col gap-2 border-b border-background-100 p-3">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-8 w-2/3" />
          </div>
          <ListSkeleton rows={6} avatar dividers trailing />
        </div>
        <div className="flex flex-1 flex-col gap-4 bg-background-50 p-8 max-lg:hidden">
          <Skeleton className="h-6 w-3/4" />
          <div className="flex items-center gap-3">
            <Skeleton className="size-10 shrink-0 rounded-full" />
            <div className="flex flex-col gap-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-44" />
            </div>
          </div>
          {[0, 1, 2, 3].map((line) => (
            <Skeleton key={line} className="h-4 w-full" />
          ))}
        </div>
      </LoadingRegion>
    </>
  );
}
