import { PageLoading } from "@/components/shell/page-loading";
import { Skeleton } from "@/components/ui/skeleton";

// A help article is two intro paragraphs followed by a numbered steps list.
export default function HelpArticleLoading() {
  return (
    <PageLoading>
      <div className="flex max-w-3xl flex-col gap-6">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-4 w-full" />
        </div>
        <div className="flex flex-col gap-2">
          {Array.from({ length: 5 }, (_, index) => (
            <Skeleton key={index} className="h-4 w-2/3" />
          ))}
        </div>
      </div>
    </PageLoading>
  );
}
