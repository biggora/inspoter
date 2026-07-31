import { requireAuth } from "@/lib/auth/dal";
import { ServerDetailView } from "@/components/servers/server-detail-view";

export const dynamic = "force-dynamic";

interface ServerDetailPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ range?: string }>;
}

// Auth gate only: the view fetches through the API with the tab's active
// workspace header, the same way the servers grid does. Resolving the server
// here instead would answer from the session's workspace, which is not
// necessarily the one this tab is showing.
export default async function ServerDetailPage({
  params,
  searchParams,
}: ServerDetailPageProps) {
  await requireAuth();
  const [{ id }, { range }] = await Promise.all([params, searchParams]);
  return <ServerDetailView localServerId={id} initialRange={range} />;
}
