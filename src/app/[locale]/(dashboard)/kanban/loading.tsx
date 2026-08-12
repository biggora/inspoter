import { PageLoading } from "@/components/shell/page-loading";
import { Skeleton } from "@/components/ui/skeleton";

export default function KanbanLoading() {
  return (
    <PageLoading description actions={1}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 3 }, (_, index) => (
          <Skeleton key={index} className="h-20 w-full rounded-xl" />
        ))}
      </div>
    </PageLoading>
  );
}
