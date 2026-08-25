import { notFound } from "next/navigation";
import { requireAuth } from "@/lib/auth/dal";
import { AgentNotFoundError, getAgent } from "@/lib/services/agents";
import * as skillsService from "@/lib/services/skills";
import * as schedulesService from "@/lib/services/agent-schedules";
import { AgentDetailView } from "@/components/agents/agent-detail-view";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function AgentPage({ params }: PageProps) {
  const { workspace } = await requireAuth();
  const { id } = await params;

  // The whole skill catalogue rides along: the detail page's attach control
  // needs the names of the skills that are NOT attached, and the workspace cap
  // is 200 rows of three short columns.
  const [agent, skills, schedules] = await Promise.all([
    getAgent(workspace.id, id).catch((error) => {
      if (error instanceof AgentNotFoundError) return null;
      throw error;
    }),
    skillsService.listSkills(workspace.id),
    schedulesService.listSchedules(workspace.id, id),
  ]);
  if (!agent) notFound();

  return (
    <AgentDetailView agent={agent} skills={skills} schedules={schedules} />
  );
}
