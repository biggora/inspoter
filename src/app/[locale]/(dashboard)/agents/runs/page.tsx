import { requireAuth } from "@/lib/auth/dal";
import * as agentRunsService from "@/lib/services/agent-runs";
import { RunsView } from "@/components/agents/runs-view";

export const dynamic = "force-dynamic";

export default async function AgentRunsPage() {
  const { workspace } = await requireAuth();
  const { items } = await agentRunsService.listRuns(workspace.id);

  return <RunsView runs={items} />;
}
