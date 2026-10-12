import { requireWorkspaceBySlug } from "@/lib/auth/dal";
import { ActivityView } from "@/components/activity/activity-view";

export const dynamic = "force-dynamic";

export default async function ActivityPage({
  params,
}: {
  params: Promise<{ workspace: string }>;
}) {
  await requireWorkspaceBySlug((await params).workspace);
  return <ActivityView />;
}
