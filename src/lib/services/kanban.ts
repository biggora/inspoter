import { Prisma } from "@/generated/prisma/client";
import type {
  KanbanBoard,
  KanbanChecklistItem,
  KanbanColumn,
  KanbanComment,
  KanbanLinkType,
  KanbanPriority,
} from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { parseLabelColor, type LabelColor } from "@/lib/label-color";
import { normalizeCardDescription } from "@/lib/kanban/sanitize";
import {
  toSummary,
  type KanbanLabelSummary,
} from "@/lib/services/kanban-labels";

// Sole Prisma caller for KanbanBoard/Column/Card and the card's checklist and
// comments. Modeled on src/lib/services/bookmarks.ts: every function takes the
// workspace id first and scopes every query by it, so a foreign id resolves to
// "not found" rather than another workspace's row.

export const KANBAN_BOARD_LIMIT = 50;
export const KANBAN_COLUMN_LIMIT = 20;

export class KanbanNotFoundError extends Error {
  readonly code = "RESOURCE_NOT_FOUND";

  constructor() {
    super("Resource not found.");
    this.name = "KanbanNotFoundError";
  }
}

export class KanbanValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "KanbanValidationError";
  }
}

export class KanbanLimitReachedError extends Error {
  readonly code = "KANBAN_LIMIT_REACHED";

  constructor(message: string) {
    super(message);
    this.name = "KanbanLimitReachedError";
  }
}

// --- Read models ---

export interface KanbanAssignee {
  operatorId: string;
  username: string;
}

export interface KanbanCardDetail {
  id: string;
  boardId: string;
  columnId: string;
  title: string;
  description: string | null;
  position: number;
  priority: KanbanPriority;
  dueDate: Date | null;
  /**
   * Past its due date and not completed. Decided here rather than in the card
   * component: React forbids reading the clock during render, and a
   * server-side flag also keeps the boundary on one clock (UTC) instead of the
   * operator's.
   */
  isOverdue: boolean;
  assignee: KanbanAssignee | null;
  linkedType: KanbanLinkType | null;
  linkedId: string | null;
  linkedLabel: string | null;
  completedAt: Date | null;
  labels: KanbanLabelSummary[];
  checklistTotal: number;
  checklistDone: number;
  commentCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface KanbanColumnWithCards {
  id: string;
  name: string;
  color: LabelColor;
  position: number;
  wipLimit: number | null;
  isDone: boolean;
  cards: KanbanCardDetail[];
}

export interface KanbanBoardSummary {
  id: string;
  name: string;
  position: number;
  columnCount: number;
  cardCount: number;
  createdAt: Date;
}

export interface KanbanBoardDetail {
  id: string;
  name: string;
  position: number;
  columns: KanbanColumnWithCards[];
}

const CARD_INCLUDE = {
  assignee: {
    select: { operatorId: true, operator: { select: { username: true } } },
  },
  labels: {
    include: { label: { select: { id: true, name: true, color: true } } },
  },
  checklistItems: { select: { isDone: true } },
  _count: { select: { comments: true } },
} satisfies Prisma.KanbanCardInclude;

type CardRow = Prisma.KanbanCardGetPayload<{ include: typeof CARD_INCLUDE }>;

function toCardDetail(card: CardRow, now: Date = new Date()): KanbanCardDetail {
  return {
    id: card.id,
    boardId: card.boardId,
    columnId: card.columnId,
    title: card.title,
    description: card.description,
    position: card.position,
    priority: card.priority,
    dueDate: card.dueDate,
    isOverdue:
      card.dueDate !== null &&
      card.completedAt === null &&
      card.dueDate.getTime() < now.getTime(),
    assignee: card.assignee
      ? {
          operatorId: card.assignee.operatorId,
          username: card.assignee.operator.username,
        }
      : null,
    linkedType: card.linkedType,
    linkedId: card.linkedId,
    linkedLabel: card.linkedLabel,
    completedAt: card.completedAt,
    labels: card.labels.map((assignment) => toSummary(assignment.label)),
    checklistTotal: card.checklistItems.length,
    checklistDone: card.checklistItems.filter((item) => item.isDone).length,
    commentCount: card._count.comments,
    createdAt: card.createdAt,
    updatedAt: card.updatedAt,
  };
}

export async function listBoards(
  workspaceId: string,
): Promise<KanbanBoardSummary[]> {
  const boards = await db.kanbanBoard.findMany({
    where: { workspaceId },
    orderBy: [{ position: "asc" }, { id: "asc" }],
    include: { _count: { select: { columns: true, cards: true } } },
  });
  return boards.map((board) => ({
    id: board.id,
    name: board.name,
    position: board.position,
    columnCount: board._count.columns,
    cardCount: board._count.cards,
    createdAt: board.createdAt,
  }));
}

export async function getBoard(
  workspaceId: string,
  boardId: string,
): Promise<KanbanBoardDetail | null> {
  const board = await db.kanbanBoard.findFirst({
    where: { id: boardId, workspaceId },
    include: {
      columns: {
        orderBy: [{ position: "asc" }, { id: "asc" }],
        include: {
          cards: {
            orderBy: [{ position: "asc" }, { id: "asc" }],
            include: CARD_INCLUDE,
          },
        },
      },
    },
  });
  if (!board) return null;

  // One clock for the whole board, so two cards with the same due date can
  // never disagree about being overdue.
  const now = new Date();

  return {
    id: board.id,
    name: board.name,
    position: board.position,
    columns: board.columns.map((column) => ({
      id: column.id,
      name: column.name,
      color: parseLabelColor(column.color),
      position: column.position,
      wipLimit: column.wipLimit,
      isDone: column.isDone,
      cards: column.cards.map((card) => toCardDetail(card, now)),
    })),
  };
}

// --- Boards ---

// A brand new board is useless without somewhere to put a card, so it is
// created with the three columns every board starts from. The last one is the
// terminal column (isDone), which is what stamps completedAt on arrival.
const DEFAULT_COLUMNS: { name: string; color: LabelColor; isDone: boolean }[] =
  [
    { name: "Backlog", color: "SLATE", isDone: false },
    { name: "In progress", color: "BLUE", isDone: false },
    { name: "Done", color: "GREEN", isDone: true },
  ];

export async function createBoard(
  workspaceId: string,
  input: { name: string },
): Promise<KanbanBoard> {
  return db.$transaction(async (tx) => {
    const count = await tx.kanbanBoard.count({ where: { workspaceId } });
    if (count >= KANBAN_BOARD_LIMIT) {
      throw new KanbanLimitReachedError("Workspace board limit reached.");
    }
    const last = await tx.kanbanBoard.findFirst({
      where: { workspaceId },
      orderBy: { position: "desc" },
      select: { position: true },
    });
    const board = await tx.kanbanBoard.create({
      data: {
        workspaceId,
        name: input.name,
        position: (last?.position ?? -1) + 1,
      },
    });
    await tx.kanbanColumn.createMany({
      data: DEFAULT_COLUMNS.map((column, index) => ({
        workspaceId,
        boardId: board.id,
        boardWorkspaceId: workspaceId,
        name: column.name,
        color: column.color,
        isDone: column.isDone,
        position: index,
      })),
    });
    return board;
  });
}

export async function renameBoard(
  workspaceId: string,
  boardId: string,
  input: { name: string },
): Promise<KanbanBoard> {
  try {
    return await db.kanbanBoard.update({
      where: { id_workspaceId: { id: boardId, workspaceId } },
      data: { name: input.name },
    });
  } catch (error) {
    throw toNotFound(error);
  }
}

export async function deleteBoard(
  workspaceId: string,
  boardId: string,
): Promise<void> {
  try {
    await db.kanbanBoard.delete({
      where: { id_workspaceId: { id: boardId, workspaceId } },
    });
  } catch (error) {
    throw toNotFound(error);
  }
}

export async function reorderBoards(
  workspaceId: string,
  order: string[],
): Promise<void> {
  await applyOrder(order, async (tx, ids) => {
    const found = await tx.kanbanBoard.findMany({
      where: { workspaceId, id: { in: ids } },
      select: { id: true },
    });
    if (found.length !== ids.length) {
      throw new KanbanValidationError("Unknown board in the requested order.");
    }
    for (const [index, id] of ids.entries()) {
      await tx.kanbanBoard.update({
        where: { id_workspaceId: { id, workspaceId } },
        data: { position: index },
      });
    }
  });
}

// --- Columns ---

export async function createColumn(
  workspaceId: string,
  input: {
    boardId: string;
    name: string;
    color: LabelColor;
    wipLimit?: number | null;
    isDone?: boolean;
  },
): Promise<KanbanColumn> {
  return db.$transaction(async (tx) => {
    await requireBoard(tx, workspaceId, input.boardId);
    const count = await tx.kanbanColumn.count({
      where: { workspaceId, boardId: input.boardId },
    });
    if (count >= KANBAN_COLUMN_LIMIT) {
      throw new KanbanLimitReachedError("Board column limit reached.");
    }
    const last = await tx.kanbanColumn.findFirst({
      where: { workspaceId, boardId: input.boardId },
      orderBy: { position: "desc" },
      select: { position: true },
    });
    return tx.kanbanColumn.create({
      data: {
        workspaceId,
        boardId: input.boardId,
        boardWorkspaceId: workspaceId,
        name: input.name,
        color: input.color,
        wipLimit: input.wipLimit ?? null,
        isDone: input.isDone ?? false,
        position: (last?.position ?? -1) + 1,
      },
    });
  });
}

// Flipping isDone retroactively settles the cards already sitting in the
// column: a column that becomes terminal completes them, one that stops being
// terminal reopens them. Leaving completedAt stale would make "done" mean two
// different things on the same board.
export async function updateColumn(
  workspaceId: string,
  columnId: string,
  input: {
    name?: string;
    color?: LabelColor;
    wipLimit?: number | null;
    isDone?: boolean;
  },
): Promise<KanbanColumn> {
  return db.$transaction(async (tx) => {
    const existing = await tx.kanbanColumn.findFirst({
      where: { id: columnId, workspaceId },
    });
    if (!existing) throw new KanbanNotFoundError();

    const updated = await tx.kanbanColumn.update({
      where: { id_workspaceId: { id: columnId, workspaceId } },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.color !== undefined ? { color: input.color } : {}),
        ...(input.wipLimit !== undefined ? { wipLimit: input.wipLimit } : {}),
        ...(input.isDone !== undefined ? { isDone: input.isDone } : {}),
      },
    });

    if (input.isDone !== undefined && input.isDone !== existing.isDone) {
      await tx.kanbanCard.updateMany({
        where: { workspaceId, columnId },
        data: { completedAt: input.isDone ? new Date() : null },
      });
    }
    return updated;
  });
}

export async function deleteColumn(
  workspaceId: string,
  columnId: string,
): Promise<void> {
  try {
    await db.kanbanColumn.delete({
      where: { id_workspaceId: { id: columnId, workspaceId } },
    });
  } catch (error) {
    throw toNotFound(error);
  }
}

export async function reorderColumns(
  workspaceId: string,
  boardId: string,
  order: string[],
): Promise<void> {
  await applyOrder(order, async (tx, ids) => {
    const found = await tx.kanbanColumn.findMany({
      where: { workspaceId, boardId, id: { in: ids } },
      select: { id: true },
    });
    if (found.length !== ids.length) {
      throw new KanbanValidationError("Unknown column in the requested order.");
    }
    for (const [index, id] of ids.entries()) {
      await tx.kanbanColumn.update({
        where: { id_workspaceId: { id, workspaceId } },
        data: { position: index },
      });
    }
  });
}

// --- Cards ---

export interface CreateCardInput {
  columnId: string;
  title: string;
  description?: string | null;
  priority?: KanbanPriority;
  dueDate?: Date | null;
  assigneeOperatorId?: string | null;
  labelIds?: string[];
  linkedType?: KanbanLinkType | null;
  linkedId?: string | null;
  linkedLabel?: string | null;
}

export interface UpdateCardInput {
  title?: string;
  description?: string | null;
  priority?: KanbanPriority;
  dueDate?: Date | null;
  assigneeOperatorId?: string | null;
  linkedType?: KanbanLinkType | null;
  linkedId?: string | null;
  linkedLabel?: string | null;
}

export async function createCard(
  workspaceId: string,
  input: CreateCardInput,
): Promise<KanbanCardDetail> {
  const card = await db.$transaction(async (tx) => {
    const column = await tx.kanbanColumn.findFirst({
      where: { id: input.columnId, workspaceId },
      select: { id: true, boardId: true, isDone: true },
    });
    if (!column) throw new KanbanNotFoundError();

    const assignee = await resolveAssignee(
      tx,
      workspaceId,
      input.assigneeOperatorId,
    );
    const last = await tx.kanbanCard.findFirst({
      where: { workspaceId, columnId: column.id },
      orderBy: { position: "desc" },
      select: { position: true },
    });

    const created = await tx.kanbanCard.create({
      data: {
        workspaceId,
        boardId: column.boardId,
        boardWorkspaceId: workspaceId,
        columnId: column.id,
        columnWorkspaceId: workspaceId,
        title: input.title,
        description: normalizeCardDescription(input.description),
        position: (last?.position ?? -1) + 1,
        priority: input.priority ?? "MEDIUM",
        dueDate: input.dueDate ?? null,
        assigneeOperatorId: assignee,
        assigneeWorkspaceId: assignee === null ? null : workspaceId,
        linkedType: input.linkedType ?? null,
        linkedId: input.linkedId ?? null,
        linkedLabel: input.linkedLabel ?? null,
        completedAt: column.isDone ? new Date() : null,
      },
    });

    if (input.labelIds?.length) {
      await setCardLabels(tx, workspaceId, created.id, input.labelIds);
    }
    return created;
  });

  return requireCardDetail(workspaceId, card.id);
}

export async function updateCard(
  workspaceId: string,
  cardId: string,
  input: UpdateCardInput,
): Promise<KanbanCardDetail> {
  await db.$transaction(async (tx) => {
    const existing = await tx.kanbanCard.findFirst({
      where: { id: cardId, workspaceId },
      select: { id: true },
    });
    if (!existing) throw new KanbanNotFoundError();

    const assigneePatch =
      input.assigneeOperatorId === undefined
        ? {}
        : await (async () => {
            const assignee = await resolveAssignee(
              tx,
              workspaceId,
              input.assigneeOperatorId,
            );
            return {
              assigneeOperatorId: assignee,
              assigneeWorkspaceId: assignee === null ? null : workspaceId,
            };
          })();

    await tx.kanbanCard.update({
      where: { id_workspaceId: { id: cardId, workspaceId } },
      data: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.description !== undefined
          ? { description: normalizeCardDescription(input.description) }
          : {}),
        ...(input.priority !== undefined ? { priority: input.priority } : {}),
        ...(input.dueDate !== undefined ? { dueDate: input.dueDate } : {}),
        ...assigneePatch,
        ...(input.linkedType !== undefined
          ? { linkedType: input.linkedType }
          : {}),
        ...(input.linkedId !== undefined ? { linkedId: input.linkedId } : {}),
        ...(input.linkedLabel !== undefined
          ? { linkedLabel: input.linkedLabel }
          : {}),
      },
    });
  });

  return requireCardDetail(workspaceId, cardId);
}

export async function deleteCard(
  workspaceId: string,
  cardId: string,
): Promise<void> {
  try {
    await db.kanbanCard.delete({
      where: { id_workspaceId: { id: cardId, workspaceId } },
    });
  } catch (error) {
    throw toNotFound(error);
  }
}

export interface CardMoveOutcome {
  cardId: string;
  fromColumnId: string;
  toColumnId: string;
  completed: boolean;
}

// Drag-and-drop write path. `columns` carries the post-drop card order of the
// source and destination columns (at most two, enforced by the schema); the
// whole rewrite runs in one transaction so a concurrent move can never leave
// half the board renumbered.
//
// Returns the cards whose column actually changed, so the route can emit the
// moved/completed webhooks without re-reading the board.
export async function moveCards(
  workspaceId: string,
  boardId: string,
  columns: { columnId: string; cardIds: string[] }[],
): Promise<CardMoveOutcome[]> {
  return db.$transaction(async (tx) => {
    const columnIds = columns.map((column) => column.columnId);
    if (new Set(columnIds).size !== columnIds.length) {
      throw new KanbanValidationError("Duplicate column in the move payload.");
    }

    const targets = await tx.kanbanColumn.findMany({
      where: { workspaceId, boardId, id: { in: columnIds } },
      select: { id: true, isDone: true },
    });
    if (targets.length !== columnIds.length) {
      throw new KanbanValidationError("Unknown column in the move payload.");
    }
    const isDoneByColumn = new Map(
      targets.map((column) => [column.id, column.isDone]),
    );

    const cardIds = columns.flatMap((column) => column.cardIds);
    if (new Set(cardIds).size !== cardIds.length) {
      throw new KanbanValidationError("Duplicate card in the move payload.");
    }

    const cards = await tx.kanbanCard.findMany({
      where: { workspaceId, boardId, id: { in: cardIds } },
      select: { id: true, columnId: true, completedAt: true },
    });
    if (cards.length !== cardIds.length) {
      throw new KanbanValidationError("Unknown card in the move payload.");
    }
    const currentById = new Map(cards.map((card) => [card.id, card]));

    // Every card the affected columns hold must appear in the payload,
    // otherwise the rewrite would silently strand rows at stale positions.
    const held = await tx.kanbanCard.count({
      where: { workspaceId, boardId, columnId: { in: columnIds } },
    });
    if (held !== cardIds.length) {
      throw new KanbanValidationError(
        "The move payload must list every card of the affected columns.",
      );
    }

    const outcomes: CardMoveOutcome[] = [];
    for (const column of columns) {
      const isDone = isDoneByColumn.get(column.columnId) === true;
      for (const [index, cardId] of column.cardIds.entries()) {
        const current = currentById.get(cardId)!;
        const changedColumn = current.columnId !== column.columnId;
        // completedAt only moves when the card crosses a column boundary, so
        // reordering inside the terminal column keeps the original timestamp.
        const completedAt = changedColumn
          ? isDone
            ? new Date()
            : null
          : current.completedAt;

        await tx.kanbanCard.update({
          where: { id_workspaceId: { id: cardId, workspaceId } },
          data: {
            columnId: column.columnId,
            columnWorkspaceId: workspaceId,
            position: index,
            completedAt,
          },
        });

        if (changedColumn) {
          outcomes.push({
            cardId,
            fromColumnId: current.columnId,
            toColumnId: column.columnId,
            completed: isDone,
          });
        }
      }
    }
    return outcomes;
  });
}

// Single-card move for callers that have no board state to diff — the MCP
// tools and the "create task from alert" flow. Builds the same two-column
// payload the drag-and-drop path posts, appending the card to the end of the
// destination, so both routes share one transaction and one set of rules.
export async function moveCardToColumn(
  workspaceId: string,
  cardId: string,
  columnId: string,
): Promise<CardMoveOutcome[]> {
  const card = await db.kanbanCard.findFirst({
    where: { id: cardId, workspaceId },
    select: { id: true, boardId: true, columnId: true },
  });
  if (!card) throw new KanbanNotFoundError();

  const destination = await db.kanbanColumn.findFirst({
    where: { id: columnId, workspaceId, boardId: card.boardId },
    select: { id: true },
  });
  if (!destination) {
    throw new KanbanValidationError(
      "The destination column belongs to another board.",
    );
  }
  if (card.columnId === columnId) return [];

  const [sourceCards, destinationCards] = await Promise.all([
    orderedCardIds(workspaceId, card.columnId),
    orderedCardIds(workspaceId, columnId),
  ]);

  return moveCards(workspaceId, card.boardId, [
    {
      columnId: card.columnId,
      cardIds: sourceCards.filter((id) => id !== cardId),
    },
    { columnId, cardIds: [...destinationCards, cardId] },
  ]);
}

async function orderedCardIds(
  workspaceId: string,
  columnId: string,
): Promise<string[]> {
  const cards = await db.kanbanCard.findMany({
    where: { workspaceId, columnId },
    orderBy: [{ position: "asc" }, { id: "asc" }],
    select: { id: true },
  });
  return cards.map((card) => card.id);
}

// --- Card labels ---

export async function setCardLabels(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  cardId: string,
  labelIds: string[],
): Promise<void> {
  const wanted = [...new Set(labelIds)];

  if (wanted.length > 0) {
    const found = await tx.kanbanLabel.findMany({
      where: { workspaceId, id: { in: wanted } },
      select: { id: true },
    });
    if (found.length !== wanted.length) throw new KanbanNotFoundError();
  }

  await tx.kanbanCardLabel.deleteMany({
    where: {
      workspaceId,
      cardId,
      ...(wanted.length > 0 ? { labelId: { notIn: wanted } } : {}),
    },
  });

  if (wanted.length === 0) return;

  await tx.kanbanCardLabel.createMany({
    data: wanted.map((labelId) => ({
      workspaceId,
      cardId,
      cardWorkspaceId: workspaceId,
      labelId,
      labelWorkspaceId: workspaceId,
    })),
    skipDuplicates: true,
  });
}

export async function replaceCardLabels(
  workspaceId: string,
  cardId: string,
  labelIds: string[],
): Promise<KanbanCardDetail> {
  await db.$transaction(async (tx) => {
    const card = await tx.kanbanCard.findFirst({
      where: { id: cardId, workspaceId },
      select: { id: true },
    });
    if (!card) throw new KanbanNotFoundError();
    await setCardLabels(tx, workspaceId, cardId, labelIds);
  });
  return requireCardDetail(workspaceId, cardId);
}

// --- Checklist ---

export async function listChecklist(
  workspaceId: string,
  cardId: string,
): Promise<KanbanChecklistItem[]> {
  return db.kanbanChecklistItem.findMany({
    where: { workspaceId, cardId },
    orderBy: [{ position: "asc" }, { id: "asc" }],
  });
}

export async function addChecklistItem(
  workspaceId: string,
  cardId: string,
  input: { text: string },
): Promise<KanbanChecklistItem> {
  return db.$transaction(async (tx) => {
    const card = await tx.kanbanCard.findFirst({
      where: { id: cardId, workspaceId },
      select: { id: true },
    });
    if (!card) throw new KanbanNotFoundError();
    const last = await tx.kanbanChecklistItem.findFirst({
      where: { workspaceId, cardId },
      orderBy: { position: "desc" },
      select: { position: true },
    });
    return tx.kanbanChecklistItem.create({
      data: {
        workspaceId,
        cardId,
        cardWorkspaceId: workspaceId,
        text: input.text,
        position: (last?.position ?? -1) + 1,
      },
    });
  });
}

export async function updateChecklistItem(
  workspaceId: string,
  itemId: string,
  input: { text?: string; isDone?: boolean },
): Promise<KanbanChecklistItem> {
  try {
    return await db.kanbanChecklistItem.update({
      where: { id_workspaceId: { id: itemId, workspaceId } },
      data: {
        ...(input.text !== undefined ? { text: input.text } : {}),
        ...(input.isDone !== undefined ? { isDone: input.isDone } : {}),
      },
    });
  } catch (error) {
    throw toNotFound(error);
  }
}

export async function deleteChecklistItem(
  workspaceId: string,
  itemId: string,
): Promise<void> {
  try {
    await db.kanbanChecklistItem.delete({
      where: { id_workspaceId: { id: itemId, workspaceId } },
    });
  } catch (error) {
    throw toNotFound(error);
  }
}

// --- Comments ---

export async function listComments(
  workspaceId: string,
  cardId: string,
): Promise<KanbanComment[]> {
  return db.kanbanComment.findMany({
    where: { workspaceId, cardId },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
}

export async function addComment(
  workspaceId: string,
  cardId: string,
  author: { operatorId: string; username: string },
  input: { body: string },
): Promise<KanbanComment> {
  return db.$transaction(async (tx) => {
    const card = await tx.kanbanCard.findFirst({
      where: { id: cardId, workspaceId },
      select: { id: true },
    });
    if (!card) throw new KanbanNotFoundError();
    return tx.kanbanComment.create({
      data: {
        workspaceId,
        cardId,
        cardWorkspaceId: workspaceId,
        authorOperatorId: author.operatorId,
        authorName: author.username,
        body: input.body,
      },
    });
  });
}

// Only the author may remove their own comment; anyone else gets the same
// non-disclosing 404 a foreign id would produce.
export async function deleteComment(
  workspaceId: string,
  commentId: string,
  operatorId: string,
): Promise<void> {
  const comment = await db.kanbanComment.findFirst({
    where: { id: commentId, workspaceId },
    select: { id: true, authorOperatorId: true },
  });
  if (!comment || comment.authorOperatorId !== operatorId) {
    throw new KanbanNotFoundError();
  }
  await db.kanbanComment.delete({
    where: { id_workspaceId: { id: commentId, workspaceId } },
  });
}

// --- Card detail ---

// The dashboard renders the board tree; the agent surfaces want a flat,
// searchable list instead. A workspace's boards are a small, already-loaded
// structure, so the flattening and the search predicate live here in memory
// rather than in SQL — and here rather than in either caller, so the MCP tools
// and /api/v1/kanban/cards cannot drift apart.
export interface FlatKanbanCard {
  id: string;
  title: string;
  boardId: string;
  boardName: string;
  columnId: string;
  columnName: string;
  isDone: boolean;
  priority: KanbanPriority;
  dueDate: string | null;
  assignee: string | null;
  labels: string[];
  linkedType: KanbanLinkType | null;
  linkedLabel: string | null;
}

export interface KanbanCardSearchFilters {
  /** Case-insensitive substring of the title, a label, or the linked record. */
  query?: string;
  boardId?: string;
  columnId?: string;
  /** Exclude cards sitting in a terminal (done) column. */
  openOnly?: boolean;
  limit?: number;
}

export async function searchCards(
  workspaceId: string,
  filters: KanbanCardSearchFilters,
): Promise<{ items: FlatKanbanCard[]; total: number }> {
  const summaries = await listBoards(workspaceId);
  const wanted = filters.boardId
    ? summaries.filter((board) => board.id === filters.boardId)
    : summaries;

  const flat: FlatKanbanCard[] = [];
  for (const summary of wanted) {
    const board = await getBoard(workspaceId, summary.id);
    if (!board) continue;
    for (const column of board.columns) {
      for (const card of column.cards) {
        flat.push({
          id: card.id,
          title: card.title,
          boardId: board.id,
          boardName: board.name,
          columnId: column.id,
          columnName: column.name,
          isDone: column.isDone,
          priority: card.priority,
          dueDate: card.dueDate?.toISOString() ?? null,
          assignee: card.assignee?.username ?? null,
          labels: card.labels.map((label) => label.name),
          linkedType: card.linkedType,
          linkedLabel: card.linkedLabel,
        });
      }
    }
  }

  const needle = filters.query?.trim().toLowerCase();
  const items = flat.filter((card) => {
    if (filters.columnId && card.columnId !== filters.columnId) return false;
    if (filters.openOnly && card.isDone) return false;
    if (!needle) return true;
    return [card.title, card.linkedLabel ?? "", ...card.labels].some((field) =>
      field.toLowerCase().includes(needle),
    );
  });

  return { items: items.slice(0, filters.limit ?? 100), total: items.length };
}

export async function getCard(
  workspaceId: string,
  cardId: string,
): Promise<KanbanCardDetail | null> {
  const card = await db.kanbanCard.findFirst({
    where: { id: cardId, workspaceId },
    include: CARD_INCLUDE,
  });
  return card ? toCardDetail(card) : null;
}

async function requireCardDetail(
  workspaceId: string,
  cardId: string,
): Promise<KanbanCardDetail> {
  const card = await getCard(workspaceId, cardId);
  if (!card) throw new KanbanNotFoundError();
  return card;
}

// --- Shared helpers ---

async function requireBoard(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  boardId: string,
): Promise<void> {
  const board = await tx.kanbanBoard.findFirst({
    where: { id: boardId, workspaceId },
    select: { id: true },
  });
  if (!board) throw new KanbanNotFoundError();
}

// The assignee has to be a member of this workspace. The composite foreign key
// would reject a stranger anyway, but that surfaces as an opaque P2003 rather
// than a field-level error.
async function resolveAssignee(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  operatorId: string | null | undefined,
): Promise<string | null> {
  if (operatorId === null || operatorId === undefined) return null;
  const membership = await tx.workspaceMember.findUnique({
    where: { workspaceId_operatorId: { workspaceId, operatorId } },
    select: { operatorId: true },
  });
  if (!membership) {
    throw new KanbanValidationError(
      "Assignee is not a member of this workspace.",
    );
  }
  return membership.operatorId;
}

async function applyOrder(
  order: string[],
  run: (tx: Prisma.TransactionClient, ids: string[]) => Promise<void>,
): Promise<void> {
  const ids = [...new Set(order)];
  if (ids.length !== order.length) {
    throw new KanbanValidationError("Duplicate id in the requested order.");
  }
  await db.$transaction((tx) => run(tx, ids));
}

function toNotFound(error: unknown): unknown {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2025"
  ) {
    return new KanbanNotFoundError();
  }
  return error;
}
