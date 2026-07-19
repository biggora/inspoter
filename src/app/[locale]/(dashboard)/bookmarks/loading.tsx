import { Skeleton } from "@/components/ui/skeleton";

// Loading state (design.md §3.3.7): skeleton blocks matching the real
// layout's shape, never a spinner replacing the whole area.
export default function BookmarksLoading() {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-start gap-4">
        <Skeleton className="h-8 w-36" />
      </div>
      {[0, 1].map((section) => (
        <div key={section} className="flex flex-col gap-3">
          <Skeleton className="h-4 w-40" />
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
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
    </div>
  );
}
