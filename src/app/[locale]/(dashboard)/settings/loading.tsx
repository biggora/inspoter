import { PageLoading } from "@/components/shell/page-loading";
import { CardGrid } from "@/components/shell/card-grid";
import { Skeleton } from "@/components/ui/skeleton";

// The settings index is a two-column grid of navigation cards (icon + title +
// description), not a data listing — its skeleton matches that shape.
export default function SettingsLoading() {
  return (
    <PageLoading>
      <CardGrid columns={2}>
        {[0, 1, 2, 3, 4, 5, 6].map((card) => (
          <div
            key={card}
            className="flex items-center gap-3 rounded-lg border border-background-200 bg-background-50 p-4"
          >
            <Skeleton className="size-6 shrink-0 rounded-md" />
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-48" />
            </div>
          </div>
        ))}
      </CardGrid>
    </PageLoading>
  );
}
