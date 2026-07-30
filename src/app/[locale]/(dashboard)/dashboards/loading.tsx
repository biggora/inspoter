import { PageLoading } from "@/components/shell/page-loading";
import { Skeleton } from "@/components/ui/skeleton";

// The section index only decides where to send the operator, so its fallback is
// deliberately minimal — a header plus one block, never a fake grid of tiles.
export default function DashboardsLoading() {
  return (
    <PageLoading description actions={1}>
      <Skeleton className="h-48 w-full rounded-lg" />
    </PageLoading>
  );
}
