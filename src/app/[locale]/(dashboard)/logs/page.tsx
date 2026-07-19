import { requireAuth } from "@/lib/auth/dal";
import { LogsView } from "@/components/logs/logs-view";

export const dynamic = "force-dynamic";

export default async function LogsPage() {
  await requireAuth();
  return <LogsView />;
}
