import { requireWorkspaceBySlug } from "@/lib/auth/dal";
import * as skillsService from "@/lib/services/skills";
import { SkillsView } from "@/components/agents/skills-view";

export const dynamic = "force-dynamic";

export default async function SkillsPage({
  params,
}: {
  params: Promise<{ workspace: string }>;
}) {
  const { workspace } = await requireWorkspaceBySlug((await params).workspace);
  const skills = await skillsService.listSkills(workspace.id);

  return <SkillsView skills={skills} />;
}
