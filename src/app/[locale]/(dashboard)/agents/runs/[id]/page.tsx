import { notFound } from "next/navigation";
import { requireAuth } from "@/lib/auth/dal";
import { AgentRunNotFoundError, getRunDetail } from "@/lib/services/agent-runs";
import { RunDetailView } from "@/components/agents/run-detail-view";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function AgentRunPage({ params }: PageProps) {
  const { workspace } = await requireAuth();
  const { id } = await params;

  const run = await getRunDetail(workspace.id, id).catch((error) => {
    if (error instanceof AgentRunNotFoundError) return null;
    throw error;
  });
  if (!run) notFound();

  return <RunDetailView run={run} />;
}
