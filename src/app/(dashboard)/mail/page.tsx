import { requireAuth } from "@/lib/auth/dal";
import { MailView } from "@/components/mail/mail-view";

export const dynamic = "force-dynamic";

export default async function MailPage() {
  await requireAuth();
  return <MailView />;
}
