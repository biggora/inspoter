import { PageLoading } from "@/components/shell/page-loading";
import { Skeleton } from "@/components/ui/skeleton";

export default function SkillsLoading() {
  return (
    <PageLoading description>
      <div className="flex flex-col gap-2">
        {Array.from({ length: 5 }, (_, index) => (
          <Skeleton key={index} className="h-12 w-full rounded-lg" />
        ))}
      </div>
    </PageLoading>
  );
}
