import { requireAuth } from "@/lib/auth/dal";
import * as skillsService from "@/lib/services/skills";
import { SkillsView } from "@/components/agents/skills-view";

export const dynamic = "force-dynamic";

export default async function SkillsPage() {
  const { workspace } = await requireAuth();
  const skills = await skillsService.listSkills(workspace.id);

  return <SkillsView skills={skills} />;
}
