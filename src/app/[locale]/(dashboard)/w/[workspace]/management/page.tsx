import { ManagementView } from "@/components/management/management-view";
import { requireWorkspaceBySlug } from "@/lib/auth/dal";
import { listManagementKanbanTargets } from "@/lib/services/management";

export const dynamic = "force-dynamic";

export default async function ManagementPage({
  params,
}: {
  params: Promise<{ workspace: string }>;
}) {
  const { workspace } = await requireWorkspaceBySlug((await params).workspace);
  // System health is no longer fetched here: the snapshot's health line reads
  // the shared indicator store, the same source the sidebar footer reads. This
  // page used to run its own getSidebarHealth() in a different render pass
  // from the layout's, which is how the two blocks ended up disagreeing.
  const kanbanTargets = await listManagementKanbanTargets(workspace.id);

  return <ManagementView kanbanTargets={kanbanTargets} />;
}
