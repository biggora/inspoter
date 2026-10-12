import { PageLoading } from "@/components/shell/page-loading";
import { Skeleton } from "@/components/ui/skeleton";

export default function KanbanBoardLoading() {
  return (
    <PageLoading actions={2}>
      <div className="flex gap-4 overflow-hidden">
        {Array.from({ length: 3 }, (_, index) => (
          <Skeleton key={index} className="h-72 w-72 shrink-0 rounded-xl" />
        ))}
      </div>
    </PageLoading>
  );
}
