import { PageBody } from "@/components/shell/page-body";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { LoadingRegion } from "@/components/ui/loading";
import { PageHeaderSkeleton, TableSkeleton } from "@/components/ui/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

// Service detail leads with a back link above the title row, then the summary
// card and the check history — PageLoading's header shape doesn't cover the
// back link, so this route builds its own.
export default function ServiceDetailLoading() {
  return (
    <PageBody>
      <LoadingRegion className="flex flex-col gap-6">
        <Skeleton className="h-8 w-32 rounded-lg" />
        <PageHeaderSkeleton description actions={3} />
        <Card>
          <CardHeader>
            <Skeleton className="h-4 w-40" />
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Skeleton className="h-10 w-full" />
            <TableSkeleton rows={3} />
          </CardContent>
        </Card>
        <TableSkeleton rows={5} />
      </LoadingRegion>
    </PageBody>
  );
}
