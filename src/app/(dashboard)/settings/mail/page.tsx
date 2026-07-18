import { requireAuth } from "@/lib/auth/dal";
import { MailAccountsView } from "@/components/settings/mail-accounts-view";

export const dynamic = "force-dynamic";

export default async function MailAccountsPage() {
  await requireAuth();
  return <MailAccountsView />;
}
