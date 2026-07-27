import { PageLoading } from "@/components/shell/page-loading";
import { ListSkeleton } from "@/components/ui/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

// The API reference is a long list of collapsed operation rows below the
// credential warning.
export default function ApiDocsLoading() {
  return (
    <PageLoading description>
      <Skeleton className="h-12 w-full" />
      <ListSkeleton rows={8} />
    </PageLoading>
  );
}
