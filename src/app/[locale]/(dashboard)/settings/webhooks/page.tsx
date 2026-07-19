import { requireAuth } from "@/lib/auth/dal";
import { WebhookTokensView } from "@/components/settings/webhook-tokens-view";

export const dynamic = "force-dynamic";

export default async function WebhookTokensPage() {
  await requireAuth();
  return <WebhookTokensView />;
}
