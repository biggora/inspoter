import { requireAuth } from "@/lib/auth/dal";
import { AlertsView } from "@/components/alerts/alerts-view";

export const dynamic = "force-dynamic";

// Filters, the date and the cursor stack all live in the URL and are read by
// the client view, which is what makes a filtered page reloadable and
// shareable — there is nothing left for this page to parse.
export default async function AlertsPage() {
  await requireAuth();
  return <AlertsView />;
}
