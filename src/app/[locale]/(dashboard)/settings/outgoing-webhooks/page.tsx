import { requireAuth } from "@/lib/auth/dal";
import { OutgoingWebhooksView } from "@/components/settings/outgoing-webhooks-view";

export const dynamic = "force-dynamic";

export default async function OutgoingWebhooksPage() {
  await requireAuth();
  return <OutgoingWebhooksView />;
}
