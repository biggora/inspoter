import { requireAuth } from "@/lib/auth/dal";
import * as agentsService from "@/lib/services/agents";
import { AgentsView } from "@/components/agents/agents-view";

export const dynamic = "force-dynamic";

export default async function AgentsPage() {
  const { workspace } = await requireAuth();
  const agents = await agentsService.listAgents(workspace.id);

  return <AgentsView agents={agents} />;
}
