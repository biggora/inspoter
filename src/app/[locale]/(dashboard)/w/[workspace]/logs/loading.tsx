import { PageLoading } from "@/components/shell/page-loading";
import { TableSkeleton } from "@/components/ui/skeletons";

export default function LogsLoading() {
  return (
    <PageLoading description actions={1}>
      <TableSkeleton rows={6} />
    </PageLoading>
  );
}
