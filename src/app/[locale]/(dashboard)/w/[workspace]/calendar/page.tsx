import { requireWorkspaceBySlug } from "@/lib/auth/dal";
import { CalendarView } from "@/components/calendar/calendar-view";

export const dynamic = "force-dynamic";

export default async function CalendarPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspace: string }>;
  searchParams: Promise<{ inbox?: string; date?: string }>;
}) {
  const { workspace } = await requireWorkspaceBySlug((await params).workspace);
  const { inbox, date } = await searchParams;
  const initialDate = /^\d{4}-\d{2}-\d{2}$/.test(date ?? "") ? date : undefined;
  return (
    <CalendarView
      timeZone={workspace.timeZone}
      initialInboxDue={inbox === "due"}
      initialDate={initialDate}
    />
  );
}
