import { notFound } from "next/navigation";
import { requireAuth } from "@/lib/auth/dal";
import * as agentsService from "@/lib/services/agents";
import * as conversations from "@/lib/services/agent-conversations";
import { ChatsView } from "@/components/agents/chats-view";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function AgentChatPage({ params }: PageProps) {
  const { workspace } = await requireAuth();
  const { id } = await params;
  const [list, agents, selected] = await Promise.all([
    conversations.listConversations(workspace.id, {}),
    agentsService.listAgents(workspace.id),
    conversations.getConversation(workspace.id, id).catch((error) => {
      if (error instanceof conversations.AgentConversationNotFoundError)
        return null;
      throw error;
    }),
  ]);
  if (!selected) notFound();
  return (
    <ChatsView
      key={selected.id}
      conversations={list.items}
      selected={selected}
      agents={agents}
    />
  );
}
