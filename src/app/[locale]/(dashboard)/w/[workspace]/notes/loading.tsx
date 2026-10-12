import { PageLoading } from "@/components/shell/page-loading";
import { Skeleton } from "@/components/ui/skeleton";

export default function NotesLoading() {
  return (
    <PageLoading description>
      <div className="flex gap-4">
        <div className="hidden w-[260px] shrink-0 flex-col gap-2 lg:flex">
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} className="h-8 w-full rounded-lg" />
          ))}
        </div>
        <Skeleton className="h-64 w-full flex-1 rounded-xl" />
      </div>
    </PageLoading>
  );
}
