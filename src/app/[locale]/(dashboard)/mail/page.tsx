import { requireAuth } from "@/lib/auth/dal";
import { MailClientView } from "@/components/mail/mail-client-view";

export const dynamic = "force-dynamic";

export default async function MailPage() {
  const { workspace } = await requireAuth();
  return <MailClientView workspaceId={workspace.id} />;
}
