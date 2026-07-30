import { PageLoading } from "@/components/shell/page-loading";
import { Skeleton } from "@/components/ui/skeleton";

// Mirrors the real board: a tab row, then tiles on the 12-column grid in the
// sizes the default widgets use.
const TILE_SPANS = [
  "sm:col-span-3 sm:row-span-2",
  "sm:col-span-3 sm:row-span-2",
  "sm:col-span-4 sm:row-span-3",
  "sm:col-span-4 sm:row-span-3",
];

export default function DashboardLoading() {
  return (
    <PageLoading description actions={2}>
      <div className="flex gap-2">
        {Array.from({ length: 3 }, (_, index) => (
          <Skeleton key={index} className="h-8 w-28 rounded-md" />
        ))}
      </div>
      <div className="grid auto-rows-[72px] grid-cols-1 gap-4 sm:grid-cols-12">
        {TILE_SPANS.map((span, index) => (
          <Skeleton
            key={index}
            className={`h-full min-h-36 rounded-lg ${span}`}
          />
        ))}
      </div>
    </PageLoading>
  );
}
