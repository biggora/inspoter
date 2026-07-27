import { PageLoading } from "@/components/shell/page-loading";
import { CardGridSkeleton } from "@/components/ui/skeletons";

export default function ServicesLoading() {
  return (
    <PageLoading description actions={2}>
      <CardGridSkeleton metricRows={4} footerActions={1} />
    </PageLoading>
  );
}
