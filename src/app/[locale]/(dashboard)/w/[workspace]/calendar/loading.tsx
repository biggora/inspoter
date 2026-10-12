import { PageLoading } from "@/components/shell/page-loading";

export default function CalendarLoading() {
  return (
    <PageLoading description actions={2}>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_19rem]">
        <div className="h-[42rem] animate-pulse rounded-xl bg-muted" />
        <div className="h-72 animate-pulse rounded-xl bg-muted" />
      </div>
    </PageLoading>
  );
}
