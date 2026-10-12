import { requireWorkspaceBySlug } from "@/lib/auth/dal";
import * as agentsService from "@/lib/services/agents";
import { AgentsView } from "@/components/agents/agents-view";

export const dynamic = "force-dynamic";

export default async function AgentsListPage({
  params,
}: {
  params: Promise<{ workspace: string }>;
}) {
  const { workspace } = await requireWorkspaceBySlug((await params).workspace);
  const agents = await agentsService.listAgents(workspace.id);

  return <AgentsView agents={agents} />;
}
