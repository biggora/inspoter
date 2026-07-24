import { requireAuth } from "@/lib/auth/dal";
import { canManageWorkspace } from "@/lib/services/workspace-auth";
import { MailClientView } from "@/components/mail/mail-client-view";

export const dynamic = "force-dynamic";

export default async function MailPage() {
  const { operator, workspace } = await requireAuth();
  const canManageRules = await canManageWorkspace(
    workspace.id,
    operator.id,
  );
  return (
    <MailClientView
      workspaceId={workspace.id}
      canManageRules={canManageRules}
    />
  );
}
