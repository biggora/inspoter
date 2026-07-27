import { PageLoading } from "@/components/shell/page-loading";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { FormSkeleton, TableSkeleton } from "@/components/ui/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

// Workspace settings stack form cards (rename, section visibility, add member)
// around the members listing.
export default function WorkspaceSettingsLoading() {
  return (
    <PageLoading description>
      <Card>
        <CardHeader>
          <Skeleton className="h-4 w-40" />
        </CardHeader>
        <CardContent>
          <FormSkeleton fields={1} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <Skeleton className="h-4 w-48" />
        </CardHeader>
        <CardContent>
          <TableSkeleton rows={4} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <Skeleton className="h-4 w-44" />
        </CardHeader>
        <CardContent>
          <FormSkeleton fields={2} />
        </CardContent>
      </Card>
    </PageLoading>
  );
}
