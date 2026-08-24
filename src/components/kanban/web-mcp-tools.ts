import { z } from "zod";

import { defineWebMcpTool, type WebMcpTool } from "@/lib/web-mcp/define-tool";
import { LABEL_PRESET_COLORS } from "@/lib/label-color";
import type {
  KanbanBoardDetail,
  KanbanBoardSummary,
  KanbanCardDetail,
  KanbanColumnWithCards,
} from "@/lib/services/kanban";
import type { KanbanLabelListItem } from "@/lib/services/kanban-labels";
import { KANBAN_PRIORITIES } from "@/lib/validation/kanban";
import type {
  CardInput,
  ChecklistItemDto,
  ColumnInput,
  CommentDto,
} from "./api";

// WebMCP tools for the Kanban board. `createKanbanTools` is page-independent
// and registered from the dashboard shell: the tools fetch through the
// /api/kanban client rather than reading page state, and they take ids only —
// every id parameter names the tool it comes from, the same discipline as the
// server-side catalog in src/lib/mcp/tools/kanban.ts, whose tool names these
// deliberately match.

// --- shared move planning ---

/** Post-move card order of the affected columns — the `cardsApi.move` payload. */
export interface MoveColumnPayload {
  columnId: string;
  cardIds: string[];
}

interface CardMovePlan {
  payload: MoveColumnPayload[];
  card: { id: string; title: string };
  sourceColumn: { id: string; name: string };
  targetColumn: { id: string; name: string };
}

// Builds the `{columnId, cardIds}[]` payload PATCH /api/kanban/cards/move
// expects: the source column without the card, and the destination column with
// it inserted, from the columns of a freshly fetched board.
function planCardMove(
  columns: KanbanColumnWithCards[],
  cardId: string,
  targetColumnId: string,
  position: "start" | "end",
): CardMovePlan {
  const sourceColumn = columns.find((column) =>
    column.cards.some((card) => card.id === cardId),
  );
  const card = sourceColumn?.cards.find((item) => item.id === cardId);
  if (!sourceColumn || !card) {
    throw new Error(
      `No card with id "${cardId}" on this board. Card ids come from kanban_cards_search.`,
    );
  }

  const targetColumn = columns.find((column) => column.id === targetColumnId);
  if (!targetColumn) {
    throw new Error(
      `No column with id "${targetColumnId}" on this board. Column ids come from kanban_boards_list.`,
    );
  }

  if (sourceColumn.id === targetColumn.id) {
    throw new Error(
      `"${card.title}" is already in "${targetColumn.name}". Reordering within a column isn't supported yet.`,
    );
  }

  const remaining = sourceColumn.cards
    .filter((item) => item.id !== cardId)
    .map((item) => item.id);
  const targetIds = targetColumn.cards.map((item) => item.id);
  if (position === "start") {
    targetIds.unshift(cardId);
  } else {
    targetIds.push(cardId);
  }

  return {
    payload: [
      { columnId: sourceColumn.id, cardIds: remaining },
      { columnId: targetColumn.id, cardIds: targetIds },
    ],
    card,
    sourceColumn,
    targetColumn,
  };
}

// ---------------------------------------------------------------------------
// Page-independent kanban tools
// ---------------------------------------------------------------------------

/**
 * Every client API call the global kanban tools make, injected rather than
 * imported so the factory unit-tests without React or `fetch`. Each member
 * matches the signature of the same-named method in
 * `src/components/kanban/api.ts`.
 */
export interface KanbanToolDeps {
  /** boardsApi.list */
  listBoards: () => Promise<KanbanBoardSummary[]>;
  /** boardsApi.get */
  getBoard: (id: string) => Promise<KanbanBoardDetail>;
  /** cardsApi.get */
  getCard: (id: string) => Promise<KanbanCardDetail>;
  /** cardsApi.create */
  createCard: (input: CardInput) => Promise<KanbanCardDetail>;
  /** cardsApi.update */
  updateCard: (id: string, input: CardInput) => Promise<KanbanCardDetail>;
  /** cardsApi.remove */
  deleteCard: (id: string) => Promise<unknown>;
  /** cardsApi.move */
  moveCards: (
    boardId: string,
    columns: MoveColumnPayload[],
  ) => Promise<unknown>;
  /** cardsApi.setLabels */
  setCardLabels: (id: string, labelIds: string[]) => Promise<KanbanCardDetail>;
  /** kanbanLabelsApi.list */
  listLabels: () => Promise<KanbanLabelListItem[]>;
  /** checklistApi.list */
  listChecklist: (cardId: string) => Promise<ChecklistItemDto[]>;
  /** checklistApi.add */
  addChecklistItem: (cardId: string, text: string) => Promise<ChecklistItemDto>;
  /** checklistApi.update */
  updateChecklistItem: (
    id: string,
    input: { text?: string; isDone?: boolean },
  ) => Promise<ChecklistItemDto>;
  /** commentsApi.list */
  listComments: (cardId: string) => Promise<CommentDto[]>;
  /** commentsApi.add */
  addComment: (cardId: string, body: string) => Promise<CommentDto>;
  /** columnsApi.create */
  createColumn: (input: ColumnInput) => Promise<unknown>;
  /** Re-runs the page fetches so a visible board reflects a mutation. */
  refresh: () => void;
}

// --- output budget ---
// A single tool result should stay near ~1500 characters, so free text is
// trimmed and every list is capped rather than returned whole.

const MAX_TITLE_LENGTH = 90;
const MAX_TEXT_LENGTH = 200;
const MAX_ROWS = 25;

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

/**
 * The row shape every card-listing tool emits — ids and names side by side, so
 * a search result can be chained straight into a move without a second lookup.
 * Mirrors `FlatCard` in src/lib/mcp/tools/kanban.ts.
 */
interface FlatCard {
  id: string;
  title: string;
  boardId: string;
  boardName: string;
  columnId: string;
  columnName: string;
  isDone: boolean;
  priority: string;
  dueDate: Date | null;
  assignee: string | null;
  labels: string[];
}

function flattenBoard(board: KanbanBoardDetail): FlatCard[] {
  return board.columns.flatMap((column) =>
    column.cards.map((card) => ({
      id: card.id,
      title: truncate(card.title, MAX_TITLE_LENGTH),
      boardId: board.id,
      boardName: board.name,
      columnId: column.id,
      columnName: column.name,
      isDone: column.isDone,
      priority: card.priority,
      dueDate: card.dueDate,
      assignee: card.assignee?.username ?? null,
      labels: card.labels.map((label) => label.name),
    })),
  );
}

function matchesQuery(card: FlatCard, query: string): boolean {
  const needle = query.toLowerCase();
  return [card.title, ...card.labels].some((field) =>
    field.toLowerCase().includes(needle),
  );
}

/**
 * The date input carries no time component; midnight UTC keeps the stored
 * value stable regardless of where the operator sits — the same conversion
 * `card-detail-dialog.tsx` uses.
 */
function toDueDate(
  value: string | null | undefined,
): string | null | undefined {
  if (value === undefined || value === null) return value;
  return new Date(`${value}T00:00:00.000Z`).toISOString();
}

const cardIdField = z
  .string()
  .min(1)
  .describe("Card id from kanban_cards_search or kanban_board_get");

const boardIdField = z
  .string()
  .min(1)
  .describe("Board id from kanban_boards_list or a kanban_cards_search row");

const dueDateField = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .describe("Due date as YYYY-MM-DD");

// --- reads ---

function createBoardsListTool(deps: KanbanToolDeps): WebMcpTool {
  return defineWebMcpTool({
    name: "kanban_boards_list",
    title: "List kanban boards",
    description:
      "Lists the workspace's kanban boards with their columns. The board and column ids returned here are what the other kanban tools take.",
    inputSchema: z.object({}).strict(),
    readOnly: true,
    async handler() {
      const summaries = await deps.listBoards();
      const boards = await Promise.all(
        summaries.slice(0, MAX_ROWS).map(async (summary) => {
          const board = await deps.getBoard(summary.id);
          return {
            id: summary.id,
            name: summary.name,
            cardCount: summary.cardCount,
            columns: board.columns.map((column) => ({
              id: column.id,
              name: column.name,
              isDone: column.isDone,
              cardCount: column.cards.length,
            })),
          };
        }),
      );
      return { total: summaries.length, boards };
    },
  });
}

function createBoardGetTool(deps: KanbanToolDeps): WebMcpTool {
  return defineWebMcpTool({
    name: "kanban_board_get",
    title: "Read a kanban board",
    description:
      "Reads one board: every column in board order, plus the cards it holds as flat rows carrying both ids and names.",
    inputSchema: z.object({ boardId: boardIdField }).strict(),
    readOnly: true,
    // Card titles and labels are operator-authored free text.
    untrustedOutput: true,
    async handler({ boardId }) {
      const board = await deps.getBoard(boardId);
      const cards = flattenBoard(board);
      return {
        id: board.id,
        name: board.name,
        columns: board.columns.map((column) => ({
          id: column.id,
          name: column.name,
          isDone: column.isDone,
          cardCount: column.cards.length,
        })),
        total: cards.length,
        cards: cards.slice(0, MAX_ROWS),
      };
    },
  });
}

const cardsSearchInputSchema = z
  .object({
    query: z
      .string()
      .min(1)
      .max(200)
      .optional()
      .describe("Matches card title or label; omit to list every card"),
    boardId: z
      .string()
      .min(1)
      .optional()
      .describe("Board id from kanban_boards_list; omit to search all boards"),
    columnId: z
      .string()
      .min(1)
      .optional()
      .describe("Column id from kanban_boards_list, to narrow to one column"),
    openOnly: z
      .boolean()
      .optional()
      .describe("Exclude cards sitting in a terminal (done) column"),
    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .default(20)
      .describe("Maximum number of cards to return"),
  })
  .strict();

function createCardsSearchTool(deps: KanbanToolDeps): WebMcpTool {
  return defineWebMcpTool({
    name: "kanban_cards_search",
    title: "Search kanban cards",
    description:
      "Searches cards across every board by title or label. Each row carries the board and column name alongside their ids, so a result can be passed straight to kanban_card_move.",
    inputSchema: cardsSearchInputSchema,
    readOnly: true,
    untrustedOutput: true,
    async handler({ query, boardId, columnId, openOnly, limit }) {
      // No endpoint returns cards across boards, so fetch the boards and
      // filter in-process — the same trade-off the server-side tool makes.
      const boardIds =
        boardId === undefined
          ? (await deps.listBoards()).map((summary) => summary.id)
          : [boardId];

      const boards = await Promise.all(boardIds.map((id) => deps.getBoard(id)));
      let cards = boards.flatMap(flattenBoard);

      if (columnId !== undefined) {
        cards = cards.filter((card) => card.columnId === columnId);
      }
      if (openOnly === true) {
        cards = cards.filter((card) => !card.isDone);
      }
      if (query !== undefined) {
        cards = cards.filter((card) => matchesQuery(card, query));
      }

      return { total: cards.length, cards: cards.slice(0, limit) };
    },
  });
}

function createCardGetTool(deps: KanbanToolDeps): WebMcpTool {
  return defineWebMcpTool({
    name: "kanban_card_get",
    title: "Read a kanban card",
    description:
      "Reads one card by id: its description, priority, due date, assignee, labels, checklist counts and comment count.",
    inputSchema: z.object({ cardId: cardIdField }).strict(),
    readOnly: true,
    untrustedOutput: true,
    async handler({ cardId }) {
      const card = await deps.getCard(cardId);
      return {
        id: card.id,
        title: truncate(card.title, MAX_TITLE_LENGTH),
        description:
          card.description === null
            ? null
            : truncate(card.description, MAX_TEXT_LENGTH * 4),
        boardId: card.boardId,
        columnId: card.columnId,
        priority: card.priority,
        dueDate: card.dueDate,
        isOverdue: card.isOverdue,
        assignee: card.assignee?.username ?? null,
        labels: card.labels.map((label) => label.name),
        checklistDone: card.checklistDone,
        checklistTotal: card.checklistTotal,
        commentCount: card.commentCount,
      };
    },
  });
}

function createLabelsListTool(deps: KanbanToolDeps): WebMcpTool {
  return defineWebMcpTool({
    name: "kanban_labels_list",
    title: "List kanban labels",
    description:
      "Lists the workspace's kanban labels with how many cards carry each. The ids returned here are the labelIds the card tools take.",
    inputSchema: z.object({}).strict(),
    readOnly: true,
    async handler() {
      const labels = await deps.listLabels();
      return {
        total: labels.length,
        labels: labels.slice(0, MAX_ROWS * 2).map((label) => ({
          id: label.id,
          name: label.name,
          cardCount: label.cardCount,
        })),
      };
    },
  });
}

function createChecklistListTool(deps: KanbanToolDeps): WebMcpTool {
  return defineWebMcpTool({
    name: "kanban_checklist_list",
    title: "Read a card's checklist",
    description: "Lists one card's checklist items in their display order.",
    inputSchema: z.object({ cardId: cardIdField }).strict(),
    readOnly: true,
    untrustedOutput: true,
    async handler({ cardId }) {
      const items = await deps.listChecklist(cardId);
      return {
        total: items.length,
        items: items.slice(0, MAX_ROWS).map((item) => ({
          id: item.id,
          text: truncate(item.text, MAX_TEXT_LENGTH),
          isDone: item.isDone,
        })),
      };
    },
  });
}

function createCommentsListTool(deps: KanbanToolDeps): WebMcpTool {
  return defineWebMcpTool({
    name: "kanban_comments_list",
    title: "Read a card's comments",
    description: "Lists one card's comments, oldest first.",
    inputSchema: z.object({ cardId: cardIdField }).strict(),
    readOnly: true,
    untrustedOutput: true,
    async handler({ cardId }) {
      const comments = await deps.listComments(cardId);
      return {
        total: comments.length,
        comments: comments.slice(0, MAX_ROWS).map((comment) => ({
          id: comment.id,
          author: comment.authorName,
          body: truncate(comment.body, MAX_TEXT_LENGTH),
          createdAt: comment.createdAt,
        })),
      };
    },
  });
}

// --- writes ---

const cardCreateInputSchema = z
  .object({
    columnId: z
      .string()
      .min(1)
      .describe("Column id from kanban_boards_list or kanban_board_get"),
    title: z.string().trim().min(1).max(200).describe("Card title"),
    description: z.string().max(2000).optional().describe("Card description"),
    priority: z.enum(KANBAN_PRIORITIES).optional().describe("Card priority"),
    dueDate: dueDateField.optional(),
    labelIds: z
      .array(z.string().min(1))
      .max(20)
      .optional()
      .describe("Label ids from kanban_labels_list"),
  })
  .strict();

function createCardCreateTool(deps: KanbanToolDeps): WebMcpTool {
  return defineWebMcpTool({
    name: "kanban_card_create",
    title: "Create a kanban card",
    description:
      "Creates a card in an existing column, on any board. The column id must come from kanban_boards_list or kanban_board_get.",
    inputSchema: cardCreateInputSchema,
    readOnly: false,
    async handler(input) {
      const created = await deps.createCard({
        columnId: input.columnId,
        title: input.title,
        description: input.description,
        priority: input.priority,
        dueDate: toDueDate(input.dueDate),
        labelIds: input.labelIds,
      });
      deps.refresh();
      return {
        cardId: created.id,
        title: created.title,
        boardId: created.boardId,
        columnId: created.columnId,
      };
    },
  });
}

const cardUpdateInputSchema = z
  .object({
    cardId: cardIdField,
    title: z.string().trim().min(1).max(200).optional().describe("New title"),
    description: z
      .string()
      .max(2000)
      .nullable()
      .optional()
      .describe("New description, or null to clear it"),
    priority: z.enum(KANBAN_PRIORITIES).optional().describe("New priority"),
    // Re-described after `.nullable()`: the wrapper does not inherit the inner
    // schema's description, so without this the advertised parameter has none.
    dueDate: dueDateField
      .nullable()
      .optional()
      .describe("New due date as YYYY-MM-DD, or null to clear it"),
  })
  .strict();

function createCardUpdateTool(deps: KanbanToolDeps): WebMcpTool {
  return defineWebMcpTool({
    name: "kanban_card_update",
    title: "Update a kanban card",
    description:
      "Changes a card's title, description, priority or due date. Labels are set with kanban_card_labels_set and the column with kanban_card_move.",
    inputSchema: cardUpdateInputSchema,
    readOnly: false,
    async handler({ cardId, ...input }) {
      const updated = await deps.updateCard(cardId, {
        title: input.title,
        description: input.description,
        priority: input.priority,
        dueDate: toDueDate(input.dueDate),
      });
      deps.refresh();
      return {
        cardId: updated.id,
        title: updated.title,
        priority: updated.priority,
        dueDate: updated.dueDate,
      };
    },
  });
}

const cardMoveInputSchema = z
  .object({
    boardId: boardIdField,
    cardId: cardIdField,
    targetColumnId: z
      .string()
      .min(1)
      .describe("Destination column id, from kanban_boards_list"),
    position: z
      .enum(["start", "end"])
      .default("end")
      .describe("Where to place the card within the destination column"),
  })
  .strict();

function createCardMoveTool(deps: KanbanToolDeps): WebMcpTool {
  return defineWebMcpTool({
    name: "kanban_card_move",
    title: "Move a kanban card",
    description:
      "Moves a card to another column on the same board, from any dashboard page. Takes ids only — one kanban_cards_search row carries all three. Moving into a terminal (done) column completes the card.",
    inputSchema: cardMoveInputSchema,
    readOnly: false,
    async handler({ boardId, cardId, targetColumnId, position }) {
      // The move endpoint wants the post-move order of both affected columns,
      // which page state would have supplied; fetch the board for it instead.
      const board = await deps.getBoard(boardId);
      const plan = planCardMove(
        board.columns,
        cardId,
        targetColumnId,
        position,
      );

      await deps.moveCards(boardId, plan.payload);
      deps.refresh();

      return {
        cardId: plan.card.id,
        movedCard: plan.card.title,
        fromColumn: plan.sourceColumn.name,
        toColumn: plan.targetColumn.name,
      };
    },
  });
}

function createCardDeleteTool(deps: KanbanToolDeps): WebMcpTool {
  return defineWebMcpTool({
    name: "kanban_card_delete",
    title: "Delete a kanban card",
    description:
      "Deletes one card along with its checklist and comments. This cannot be undone.",
    inputSchema: z.object({ cardId: cardIdField }).strict(),
    readOnly: false,
    async handler({ cardId }) {
      await deps.deleteCard(cardId);
      deps.refresh();
      return { deleted: cardId };
    },
  });
}

function createCardLabelsSetTool(deps: KanbanToolDeps): WebMcpTool {
  return defineWebMcpTool({
    name: "kanban_card_labels_set",
    title: "Set a card's labels",
    description:
      "Replaces the whole label set of one card. Pass an empty array to clear it.",
    inputSchema: z
      .object({
        cardId: cardIdField,
        labelIds: z
          .array(z.string().min(1))
          .max(20)
          .describe("Label ids from kanban_labels_list; [] clears them"),
      })
      .strict(),
    readOnly: false,
    async handler({ cardId, labelIds }) {
      const updated = await deps.setCardLabels(cardId, labelIds);
      deps.refresh();
      return {
        cardId: updated.id,
        labels: updated.labels.map((label) => label.name),
      };
    },
  });
}

function createChecklistAddTool(deps: KanbanToolDeps): WebMcpTool {
  return defineWebMcpTool({
    name: "kanban_checklist_add",
    title: "Add a checklist item",
    description: "Appends one item to a card's checklist.",
    inputSchema: z
      .object({
        cardId: cardIdField,
        text: z.string().trim().min(1).max(200).describe("Item text"),
      })
      .strict(),
    readOnly: false,
    async handler({ cardId, text }) {
      const item = await deps.addChecklistItem(cardId, text);
      deps.refresh();
      return { itemId: item.id, text: item.text, isDone: item.isDone };
    },
  });
}

function createChecklistUpdateTool(deps: KanbanToolDeps): WebMcpTool {
  return defineWebMcpTool({
    name: "kanban_checklist_update",
    title: "Update a checklist item",
    description:
      "Rewrites a checklist item's text, ticks it off, or unticks it. Pass at least one of text or isDone.",
    inputSchema: z
      .object({
        itemId: z
          .string()
          .min(1)
          .describe("Checklist item id from kanban_checklist_list"),
        text: z.string().trim().min(1).max(200).optional().describe("New text"),
        isDone: z
          .boolean()
          .optional()
          .describe("Tick (true) or untick (false)"),
      })
      .strict()
      .refine(
        (input) => input.text !== undefined || input.isDone !== undefined,
        "Pass text, isDone, or both.",
      ),
    readOnly: false,
    async handler({ itemId, text, isDone }) {
      const item = await deps.updateChecklistItem(itemId, { text, isDone });
      deps.refresh();
      return { itemId: item.id, text: item.text, isDone: item.isDone };
    },
  });
}

function createCommentAddTool(deps: KanbanToolDeps): WebMcpTool {
  return defineWebMcpTool({
    name: "kanban_comment_add",
    title: "Comment on a kanban card",
    description:
      "Adds a comment to a card. It is attributed to the signed-in operator, so the board shows who wrote it.",
    inputSchema: z
      .object({
        cardId: cardIdField,
        body: z.string().trim().min(1).max(5000).describe("Comment body"),
      })
      .strict(),
    readOnly: false,
    async handler({ cardId, body }) {
      const comment = await deps.addComment(cardId, body);
      deps.refresh();
      return { commentId: comment.id, author: comment.authorName };
    },
  });
}

function createColumnCreateTool(deps: KanbanToolDeps): WebMcpTool {
  return defineWebMcpTool({
    name: "kanban_column_create",
    title: "Create a kanban column",
    description:
      "Adds a column to an existing board. Set isDone on the column that means the work is finished — moving a card into it completes the card.",
    inputSchema: z
      .object({
        boardId: boardIdField,
        name: z.string().trim().min(1).max(40).describe("Column name"),
        color: z
          .enum(LABEL_PRESET_COLORS)
          .optional()
          .describe("Column color; one of the preset names"),
        wipLimit: z
          .number()
          .int()
          .min(1)
          .max(999)
          .nullable()
          .optional()
          .describe("Work-in-progress limit, or null for none"),
        isDone: z
          .boolean()
          .optional()
          .describe("Marks the column terminal (done)"),
      })
      .strict(),
    readOnly: false,
    async handler(input) {
      await deps.createColumn(input);
      deps.refresh();
      return { created: input.name, boardId: input.boardId };
    },
  });
}

/**
 * The page-independent kanban tool set, registered from the dashboard shell.
 * Every tool takes ids from its paired search tool rather than resolving free
 * text, so a move can be chained straight off a `kanban_cards_search` row.
 */
export function createKanbanTools(deps: KanbanToolDeps): WebMcpTool[] {
  return [
    createBoardsListTool(deps),
    createBoardGetTool(deps),
    createCardsSearchTool(deps),
    createCardGetTool(deps),
    createLabelsListTool(deps),
    createChecklistListTool(deps),
    createCommentsListTool(deps),
    createCardCreateTool(deps),
    createCardUpdateTool(deps),
    createCardMoveTool(deps),
    createCardDeleteTool(deps),
    createCardLabelsSetTool(deps),
    createChecklistAddTool(deps),
    createChecklistUpdateTool(deps),
    createCommentAddTool(deps),
    createColumnCreateTool(deps),
  ];
}
