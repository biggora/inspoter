import { PageBody } from "@/components/shell/page-body";
import { Skeleton } from "@/components/ui/skeleton";

export default function MailTemplatesLoading() {
  return (
    <PageBody>
      <div className="space-y-3">
        <Skeleton className="h-5 w-28" />
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-10 w-full max-w-md" />
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton key={index} className="h-56 rounded-xl" />
        ))}
      </div>
    </PageBody>
  );
}
