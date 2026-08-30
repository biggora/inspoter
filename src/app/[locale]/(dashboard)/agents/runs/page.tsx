import { requireAuth } from "@/lib/auth/dal";
import * as agentRunsService from "@/lib/services/agent-runs";
import { RunsView } from "@/components/agents/runs-view";
import { parseRunCursors } from "@/components/agents/runs-params";

export const dynamic = "force-dynamic";

interface AgentRunsPageProps {
  searchParams: Promise<{ cursor?: string | string[] }>;
}

// The keyset cursor stack lives in the URL, so every page of runs is
// server-rendered, reloadable and reachable again from a run's detail page.
export default async function AgentRunsPage({
  searchParams,
}: AgentRunsPageProps) {
  const { workspace } = await requireAuth();
  const cursors = parseRunCursors((await searchParams).cursor);
  const current = cursors[cursors.length - 1];

  const { items, nextCursor } = await agentRunsService.listRuns(
    workspace.id,
    current ? { cursor: current } : {},
  );

  return <RunsView runs={items} nextCursor={nextCursor} cursors={cursors} />;
}
