import { PageLoading } from "@/components/shell/page-loading";
import { CardGridSkeleton } from "@/components/ui/skeletons";

export default function ServersLoading() {
  return (
    <PageLoading description actions={2}>
      <CardGridSkeleton metricRows={5} footerActions={2} />
    </PageLoading>
  );
}
