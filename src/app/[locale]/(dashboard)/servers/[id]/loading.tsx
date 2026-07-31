import { PageBody } from "@/components/shell/page-body";
import { LoadingRegion } from "@/components/ui/loading";
import { PageHeaderSkeleton } from "@/components/ui/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

// Server detail leads with a back link above the title row, then the summary
// block and the four charts — PageLoading's header shape doesn't cover the
// back link, so this route builds its own (same as the service detail route).
export default function ServerDetailLoading() {
  return (
    <PageBody>
      <LoadingRegion className="flex flex-col gap-6">
        <Skeleton className="h-8 w-32 rounded-lg" />
        <PageHeaderSkeleton description actions={3} />
        <Skeleton className="h-32 w-full rounded-xl" />
        <Skeleton className="h-96 w-full rounded-xl" />
      </LoadingRegion>
    </PageBody>
  );
}
