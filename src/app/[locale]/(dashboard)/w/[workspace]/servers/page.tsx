import { requireWorkspaceBySlug } from "@/lib/auth/dal";
import { ServersView } from "@/components/servers/servers-view";

export const dynamic = "force-dynamic";

export default async function ServersPage({
  params,
}: {
  params: Promise<{ workspace: string }>;
}) {
  await requireWorkspaceBySlug((await params).workspace);
  return <ServersView />;
}
