import { requireAuth } from "@/lib/auth/dal";
import { env } from "@/lib/config/env";
import { canManageWorkspace } from "@/lib/services/workspace-auth";
import { MailClientView } from "@/components/mail/mail-client-view";

export const dynamic = "force-dynamic";

export default async function MailPage() {
  const { operator, workspace } = await requireAuth();
  const canManageRules =
    env.MAIL_LABELS_ENABLED &&
    (await canManageWorkspace(workspace.id, operator.id));
  return (
    <MailClientView
      workspaceId={workspace.id}
      mailLabelsEnabled={env.MAIL_LABELS_ENABLED}
      canManageRules={canManageRules}
    />
  );
}
