import { requireAuth } from "@/lib/auth/dal";
import { MessagesView } from "@/components/messages/messages-view";

export const dynamic = "force-dynamic";

interface MessagesPageProps {
  searchParams: Promise<{ channel?: string }>;
}

// `?channel=…` is the deep link the dashboard messages widget produces: it
// preselects that channel. A hint, not a command — the client falls back to its
// usual default (the first channel) when the id no longer resolves.
export default async function MessagesPage({
  searchParams,
}: MessagesPageProps) {
  const { workspace } = await requireAuth();
  const { channel } = await searchParams;
  return (
    <MessagesView
      workspaceId={workspace.id}
      initialChannelId={channel ?? null}
    />
  );
}
