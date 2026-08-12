import { requireAuth } from "@/lib/auth/dal";
import * as kanbanService from "@/lib/services/kanban";
import * as workspacesService from "@/lib/services/workspaces";
import { BoardsList } from "@/components/kanban/boards-list";

export const dynamic = "force-dynamic";

// Unlike Dashboards, the section index is a real screen rather than a
// redirect: boards are peers with no "start board", and an operator lands here
// to choose which stream of work to open.
//
// Ownership is resolved the same way the backup settings page does it, so a
// member sees no Delete action instead of one that would 403 on click — the
// authoritative gate stays requireWorkspaceOwner in the DELETE route.
export default async function KanbanPage() {
  const { operator, workspace } = await requireAuth();
  const [boards, members] = await Promise.all([
    kanbanService.listBoards(workspace.id),
    workspacesService.listMembers(workspace.id),
  ]);
  const isOwner = members.some(
    (member) => member.operator.id === operator.id && member.role === "OWNER",
  );

  return <BoardsList boards={boards} canDelete={isOwner} />;
}
