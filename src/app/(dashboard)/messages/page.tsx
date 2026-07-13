import { requireAuth } from "@/lib/auth/dal";
import { MessagesView } from "@/components/messages/messages-view";

export const dynamic = "force-dynamic";

export default async function MessagesPage() {
  await requireAuth();
  return <MessagesView />;
}
