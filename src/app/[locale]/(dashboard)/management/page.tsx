import { ManagementView } from "@/components/management/management-view";
import { requireAuth } from "@/lib/auth/dal";
import { listManagementKanbanTargets } from "@/lib/services/management";
import { getSidebarHealth } from "@/lib/services/notification-counts";

export const dynamic = "force-dynamic";

export default async function ManagementPage() {
  const { workspace } = await requireAuth();
  const [kanbanTargets, health] = await Promise.all([
    listManagementKanbanTargets(workspace.id),
    // Same two facts the sidebar footer pins, restated in the snapshot's
    // system-health line (server-computed, no extra provider calls).
    getSidebarHealth(workspace.id),
  ]);

  return <ManagementView kanbanTargets={kanbanTargets} health={health} />;
}
