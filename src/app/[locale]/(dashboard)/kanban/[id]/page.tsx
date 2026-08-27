import { notFound } from "next/navigation";
import { requireAuth } from "@/lib/auth/dal";
import * as kanbanService from "@/lib/services/kanban";
import * as kanbanLabelsService from "@/lib/services/kanban-labels";
import * as workspacesService from "@/lib/services/workspaces";
import { KanbanBoardView } from "@/components/kanban/kanban-board-view";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ card?: string | string[] }>;
}

// Everything the board needs in one server pass: the board with its columns
// and cards, the workspace's labels (shared across boards) and its members
// (the assignee picker and the assignee filter). The card dialog's link
// targets are deliberately NOT loaded here — see /api/kanban/link-targets.
export default async function KanbanBoardPage({
  params,
  searchParams,
}: PageProps) {
  const { workspace } = await requireAuth();
  const { id } = await params;
  const cardParam = (await searchParams).card;
  const initialCardId = Array.isArray(cardParam) ? cardParam[0] : cardParam;

  const board = await kanbanService.getBoard(workspace.id, id);
  if (!board) notFound();

  const [labels, members] = await Promise.all([
    kanbanLabelsService.listLabels(workspace.id),
    workspacesService.listMembers(workspace.id),
  ]);

  return (
    <KanbanBoardView
      board={board}
      labels={labels}
      initialCardId={initialCardId}
      members={members.map((member) => ({
        operatorId: member.operator.id,
        username: member.operator.username,
      }))}
    />
  );
}
