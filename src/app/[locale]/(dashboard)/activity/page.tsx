import { requireAuth } from "@/lib/auth/dal";
import { ActivityView } from "@/components/activity/activity-view";

export const dynamic = "force-dynamic";

export default async function ActivityPage() {
  await requireAuth();
  return <ActivityView />;
}
