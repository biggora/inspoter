import { requireWorkspaceBySlug } from "@/lib/auth/dal";
import { OutgoingWebhooksView } from "@/components/settings/outgoing-webhooks-view";

export const dynamic = "force-dynamic";

export default async function OutgoingWebhooksPage({
  params,
}: {
  params: Promise<{ workspace: string }>;
}) {
  await requireWorkspaceBySlug((await params).workspace);
  return <OutgoingWebhooksView />;
}
