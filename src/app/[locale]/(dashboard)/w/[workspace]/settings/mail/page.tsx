import { requireWorkspaceBySlug } from "@/lib/auth/dal";
import { MailAccountsView } from "@/components/settings/mail-accounts-view";

export const dynamic = "force-dynamic";

export default async function MailAccountsPage({
  params,
}: {
  params: Promise<{ workspace: string }>;
}) {
  await requireWorkspaceBySlug((await params).workspace);
  return <MailAccountsView />;
}
