import { ManagementView } from "@/components/management/management-view";
import { requireAuth } from "@/lib/auth/dal";
import { listManagementKanbanTargets } from "@/lib/services/management";

export const dynamic = "force-dynamic";

export default async function ManagementPage() {
  const { workspace } = await requireAuth();
  const kanbanTargets = await listManagementKanbanTargets(workspace.id);

  return <ManagementView kanbanTargets={kanbanTargets} />;
}
