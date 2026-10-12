import { requireWorkspaceBySlug } from "@/lib/auth/dal";
import { MailClientView } from "@/components/mail/mail-client-view";

export const dynamic = "force-dynamic";

interface MailPageProps {
  params: Promise<{ workspace: string }>;
  searchParams: Promise<{ account?: string; message?: string }>;
}

// `?account=…&message=…` is the deep link the dashboard mail widget produces:
// it preselects that mailbox and opens that message. Both are hints, not
// commands — the client falls back to its usual defaults when either id no
// longer resolves.
export default async function MailPage({
  params,
  searchParams,
}: MailPageProps) {
  const { workspace } = await requireWorkspaceBySlug((await params).workspace);
  const { account, message } = await searchParams;
  return (
    <MailClientView
      workspaceId={workspace.id}
      initialAccountId={account ?? null}
      initialMessageId={message ?? null}
    />
  );
}
