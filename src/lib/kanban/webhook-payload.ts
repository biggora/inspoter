import type { KanbanCardDetail } from "@/lib/services/kanban";

// Wire shape of the kanban.* outgoing webhook events. Kept beside the other
// kanban helpers rather than inside the service so the payload can change
// without touching the write path, and so the Discord embed builder and the
// INSPOT envelope read the same object.
export interface KanbanCardWebhookPayload extends Record<string, unknown> {
  cardId: string;
  boardId: string;
  columnId: string;
  title: string;
  priority: string;
  dueDate: string | null;
  assignee: string | null;
  labels: string[];
  linkedType: string | null;
  linkedId: string | null;
  linkedLabel: string | null;
  completedAt: string | null;
}

export function cardWebhookPayload(
  card: KanbanCardDetail,
  overrides: Partial<KanbanCardWebhookPayload> = {},
): KanbanCardWebhookPayload {
  return {
    cardId: card.id,
    boardId: card.boardId,
    columnId: card.columnId,
    title: card.title,
    priority: card.priority,
    dueDate: card.dueDate?.toISOString() ?? null,
    assignee: card.assignee?.username ?? null,
    labels: card.labels.map((label) => label.name),
    linkedType: card.linkedType,
    linkedId: card.linkedId,
    linkedLabel: card.linkedLabel,
    completedAt: card.completedAt?.toISOString() ?? null,
    ...overrides,
  };
}
