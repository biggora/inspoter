import { PageLoading } from "@/components/shell/page-loading";
import { Skeleton } from "@/components/ui/skeleton";

// Loading state (design.md §4.4): skeleton blocks matching the real layout's
// shape — bookmark cards sit in per-category grids
// (src/components/bookmarks/category-section.tsx), so the placeholder repeats
// that grid rather than a generic list.
export default function BookmarksLoading() {
  return (
    <PageLoading>
      {[0, 1].map((section) => (
        <div key={section} className="flex flex-col gap-3">
          <Skeleton className="h-4 w-40" />
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {[0, 1, 2, 3].map((card) => (
              <div
                key={card}
                className="flex items-start gap-3 rounded-lg border border-background-200 bg-background-50 p-3"
              >
                <Skeleton className="size-10 shrink-0 rounded-lg" />
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-3 w-32" />
                  <Skeleton className="h-3 w-full" />
                </div>
                <Skeleton className="size-8 shrink-0 rounded-lg" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </PageLoading>
  );
}
