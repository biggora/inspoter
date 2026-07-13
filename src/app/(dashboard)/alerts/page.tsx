import { requireAuth } from "@/lib/auth/dal";
import { AlertsView } from "@/components/alerts/alerts-view";

export const dynamic = "force-dynamic";

export default async function AlertsPage() {
  await requireAuth();
  return <AlertsView />;
}
