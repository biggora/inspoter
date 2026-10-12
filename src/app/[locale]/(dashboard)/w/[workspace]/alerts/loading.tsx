import { PageLoading } from "@/components/shell/page-loading";
import { TableSkeleton } from "@/components/ui/skeletons";

export default function AlertsLoading() {
  return (
    <PageLoading description actions={2}>
      <TableSkeleton rows={6} />
    </PageLoading>
  );
}
