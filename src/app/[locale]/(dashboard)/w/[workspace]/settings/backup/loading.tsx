import { PageLoading } from "@/components/shell/page-loading";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { FormSkeleton } from "@/components/ui/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

// Backup & restore renders two form cards: export and import.
export default function BackupSettingsLoading() {
  return (
    <PageLoading description>
      {[0, 1].map((card) => (
        <Card key={card}>
          <CardHeader className="gap-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-64" />
          </CardHeader>
          <CardContent>
            <FormSkeleton fields={2} />
          </CardContent>
        </Card>
      ))}
    </PageLoading>
  );
}
