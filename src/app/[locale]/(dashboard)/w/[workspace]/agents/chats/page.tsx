import { requireWorkspaceBySlug } from "@/lib/auth/dal";
import * as agentsService from "@/lib/services/agents";
import * as conversations from "@/lib/services/agent-conversations";
import { ChatsView } from "@/components/agents/chats-view";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ workspace: string }>;
  searchParams: Promise<{ agentId?: string }>;
}

export default async function AgentChatsPage({
  params,
  searchParams,
}: PageProps) {
  const { workspace } = await requireWorkspaceBySlug((await params).workspace);
  const [{ items }, agents, query] = await Promise.all([
    conversations.listConversations(workspace.id, {}),
    agentsService.listAgents(workspace.id),
    searchParams,
  ]);
  return (
    <ChatsView
      key="new"
      conversations={items}
      selected={null}
      agents={agents}
      initialAgentId={query.agentId}
    />
  );
}
