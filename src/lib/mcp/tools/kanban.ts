import { z } from "zod";
import * as kanbanService from "@/lib/services/kanban";
import * as kanbanLabelsService from "@/lib/services/kanban-labels";
import { listLinkTargets } from "@/lib/services/kanban-link-targets";
import { defineTool, type McpToolDefinition } from "@/lib/mcp/tool";
import { McpResourceNotFoundError } from "@/lib/mcp/errors";
import { emitCardCreated, emitCardMoves } from "@/lib/kanban/card-events";
import {
  createKanbanLabelSchema,
  KANBAN_LINK_TYPES,
  KANBAN_PRIORITIES,
  kanbanCardSchema,
  kanbanCardUpdateSchema,
  kanbanColumnSchema,
  kanbanColumnUpdateSchema,
  updateKanbanLabelSchema,
} from "@/lib/validation/kanban";
import { LABEL_PRESET_COLORS } from "@/lib/label-color";

// The board is a small, already-loaded structure, so search filters here
// rather than in the service — same trade-off as tools/bookmarks.ts, and the
// flat shape is what makes a result readable to a model.
//
// Two things a token cannot be: an operator and a workspace member. Comments
// are therefore authored under the token's own id and name (KanbanComment
// carries a plain string, not a foreign key), and only the comments a token
// wrote can be deleted by it. Assigning a card still needs a real member id
// from the workspace, because that column is a foreign key.
//
// Deleting a board or a column is deliberately absent: either takes every card,
// checklist item and comment inside it, which stays an operator decision in the
// dashboard — the same line the Messages tools draw at deleting a channel.

interface FlatCard {
  id: string;
  title: string;
  boardId: string;
  boardName: string;
  columnId: string;
  columnName: string;
  isDone: boolean;
  priority: string;
  dueDate: string | null;
  assignee: string | null;
  labels: string[];
  linkedType: string | null;
  linkedLabel: string | null;
}

async function flattenBoards(
  workspaceId: string,
  boardId?: string,
): Promise<FlatCard[]> {
  const summaries = await kanbanService.listBoards(workspaceId);
  const wanted = boardId
    ? summaries.filter((board) => board.id === boardId)
    : summaries;

  const flat: FlatCard[] = [];
  for (const summary of wanted) {
    const board = await kanbanService.getBoard(workspaceId, summary.id);
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
  return flat;
}

function matches(card: FlatCard, query: string): boolean {
  const needle = query.toLowerCase();
  return [card.title, card.linkedLabel ?? "", ...card.labels].some((field) =>
    field.toLowerCase().includes(needle),
  );
}

async function requireCard(
  workspaceId: string,
  cardId: string,
): Promise<kanbanService.KanbanCardDetail> {
  const card = await kanbanService.getCard(workspaceId, cardId);
  if (!card) throw new McpResourceNotFoundError("Kanban card", cardId);
  return card;
}

const labelColor = z
  .string()
  .describe(
    `A preset name (${LABEL_PRESET_COLORS.join(", ")}) or a hex value such as #616367.`,
  );

// linkedType and linkedId travel together — the schema rejects one without
// the other, so both tools that accept them declare the trio at once.
const cardLinkFields = {
  linkedType: z
    .enum(KANBAN_LINK_TYPES)
    .nullish()
    .describe("Pair with linkedId; ids come from kanban_link_targets_list."),
  linkedId: z.string().nullish(),
  linkedLabel: z
    .string()
    .nullish()
    .describe("Snapshot of the target's name, so the chip survives a rename."),
};

const cardFields = {
  description: z
    .string()
    .nullish()
    .describe("Plain text or simple HTML; sanitized on write."),
  priority: z.enum(KANBAN_PRIORITIES).optional(),
  dueDate: z.iso.datetime().nullish(),
  assigneeOperatorId: z
    .string()
    .nullish()
    .describe(
      "Operator id of a member of this workspace, or null to unassign.",
    ),
  ...cardLinkFields,
};

const columnFields = {
  color: labelColor,
  wipLimit: z.number().int().min(1).max(999).nullish(),
  isDone: z
    .boolean()
    .optional()
    .describe(
      "Marks the column terminal: moving a card into it completes the card and fires the completed webhook.",
    ),
};

export const kanbanTools: McpToolDefinition[] = [
  defineTool({
    name: "kanban_boards_list",
    scope: "kanban:read",
    title: "List kanban boards",
    description:
      "List the workspace's kanban boards with their columns. Use the ids from here with the other kanban tools.",
    inputSchema: z.object({}),
    readOnly: true,
    handler: async (_args, ctx) => {
      const summaries = await kanbanService.listBoards(ctx.workspaceId);
      return Promise.all(
        summaries.map(async (summary) => {
          const board = await kanbanService.getBoard(
            ctx.workspaceId,
            summary.id,
          );
          return {
            id: summary.id,
            name: summary.name,
            cardCount: summary.cardCount,
            columns:
              board?.columns.map((column) => ({
                id: column.id,
                name: column.name,
                isDone: column.isDone,
                wipLimit: column.wipLimit,
                cardCount: column.cards.length,
              })) ?? [],
          };
        }),
      );
    },
  }),

  defineTool({
    name: "kanban_board_get",
    scope: "kanban:read",
    title: "Read a kanban board",
    description:
      "Read one board in full — every column with the cards it holds, in board order.",
    inputSchema: z.object({ boardId: z.string() }),
    readOnly: true,
    handler: async (args, ctx) => {
      const board = await kanbanService.getBoard(ctx.workspaceId, args.boardId);
      if (!board) {
        throw new McpResourceNotFoundError("Kanban board", args.boardId);
      }
      return board;
    },
  }),

  defineTool({
    name: "kanban_cards_search",
    scope: "kanban:read",
    title: "Search kanban cards",
    description:
      "Search cards by title, label or linked record. Omit `query` to list them all. Narrow with `boardId` or `columnId`.",
    inputSchema: z.object({
      query: z.string().optional(),
      boardId: z.string().optional(),
      columnId: z.string().optional(),
      openOnly: z
        .boolean()
        .optional()
        .describe("Exclude cards sitting in a terminal (done) column."),
      limit: z.number().int().min(1).max(500).optional(),
    }),
    readOnly: true,
    handler: async (args, ctx) => {
      let items = await flattenBoards(ctx.workspaceId, args.boardId);
      if (args.columnId) {
        items = items.filter((card) => card.columnId === args.columnId);
      }
      if (args.openOnly) {
        items = items.filter((card) => !card.isDone);
      }
      if (args.query) {
        items = items.filter((card) => matches(card, args.query as string));
      }
      return { items: items.slice(0, args.limit ?? 100), total: items.length };
    },
  }),

  defineTool({
    name: "kanban_card_get",
    scope: "kanban:read",
    title: "Read a kanban card",
    description:
      "Read one card by id, including its description, checklist counts and comment count.",
    inputSchema: z.object({ id: z.string() }),
    readOnly: true,
    handler: (args, ctx) => requireCard(ctx.workspaceId, args.id),
  }),

  defineTool({
    name: "kanban_labels_list",
    scope: "kanban:read",
    title: "List kanban labels",
    description:
      "List the workspace's kanban labels with how many cards carry each. Ids from here are the labelIds the card tools accept.",
    inputSchema: z.object({}),
    readOnly: true,
    handler: (_args, ctx) => kanbanLabelsService.listLabels(ctx.workspaceId),
  }),

  defineTool({
    name: "kanban_checklist_list",
    scope: "kanban:read",
    title: "Read a card's checklist",
    description: "List one card's checklist items in their display order.",
    inputSchema: z.object({ cardId: z.string() }),
    readOnly: true,
    handler: async (args, ctx) => {
      await requireCard(ctx.workspaceId, args.cardId);
      return kanbanService.listChecklist(ctx.workspaceId, args.cardId);
    },
  }),

  defineTool({
    name: "kanban_comments_list",
    scope: "kanban:read",
    title: "Read a card's comments",
    description: "List one card's comments, oldest first.",
    inputSchema: z.object({ cardId: z.string() }),
    readOnly: true,
    handler: async (args, ctx) => {
      await requireCard(ctx.workspaceId, args.cardId);
      return kanbanService.listComments(ctx.workspaceId, args.cardId);
    },
  }),

  defineTool({
    name: "kanban_link_targets_list",
    scope: "kanban:read",
    title: "List records a card can link to",
    description:
      "List the servers, domains, services, alerts and hosting accounts a card can be linked to, grouped by type. Use an entry's id as linkedId and its name as linkedLabel.",
    inputSchema: z.object({}),
    readOnly: true,
    handler: (_args, ctx) => listLinkTargets(ctx.workspaceId),
  }),

  defineTool({
    name: "kanban_board_create",
    scope: "kanban:write",
    title: "Create a kanban board",
    description:
      "Create an empty board. Add columns to it with kanban_column_create before creating cards.",
    inputSchema: z.object({ name: z.string().min(1).max(60) }),
    readOnly: false,
    handler: (args, ctx) => kanbanService.createBoard(ctx.workspaceId, args),
  }),

  defineTool({
    name: "kanban_board_rename",
    scope: "kanban:write",
    title: "Rename a kanban board",
    description:
      "Rename one board. Deleting a board is not exposed — it takes every card on it with it.",
    inputSchema: z.object({
      boardId: z.string(),
      name: z.string().min(1).max(60),
    }),
    readOnly: false,
    handler: ({ boardId, ...input }, ctx) =>
      kanbanService.renameBoard(ctx.workspaceId, boardId, input),
  }),

  defineTool({
    name: "kanban_boards_reorder",
    scope: "kanban:write",
    title: "Reorder kanban boards",
    description:
      "Set the order of the boards. `order` is the full list of board ids in their new order.",
    inputSchema: z.object({ order: z.array(z.string()).min(1) }),
    readOnly: false,
    handler: async (args, ctx) => {
      await kanbanService.reorderBoards(ctx.workspaceId, args.order);
      return { reordered: true };
    },
  }),

  defineTool({
    name: "kanban_column_create",
    scope: "kanban:write",
    title: "Create a kanban column",
    description:
      "Add a column to an existing board. Set `isDone` on the column that means the work is finished.",
    inputSchema: z.object({
      boardId: z.string(),
      name: z.string().min(1).max(40),
      ...columnFields,
    }),
    readOnly: false,
    handler: (args, ctx) =>
      kanbanService.createColumn(
        ctx.workspaceId,
        kanbanColumnSchema.parse(args),
      ),
  }),

  defineTool({
    name: "kanban_column_update",
    scope: "kanban:write",
    title: "Update a kanban column",
    description:
      "Change a column's name, color, WIP limit or terminal flag. Deleting a column is not exposed — it takes the cards in it with it.",
    inputSchema: z.object({
      columnId: z.string(),
      name: z.string().min(1).max(40).optional(),
      ...columnFields,
      color: labelColor.optional(),
    }),
    readOnly: false,
    handler: ({ columnId, ...input }, ctx) =>
      kanbanService.updateColumn(
        ctx.workspaceId,
        columnId,
        kanbanColumnUpdateSchema.parse(input),
      ),
  }),

  defineTool({
    name: "kanban_columns_reorder",
    scope: "kanban:write",
    title: "Reorder kanban columns",
    description:
      "Set the order of one board's columns. `order` is the full list of that board's column ids.",
    inputSchema: z.object({
      boardId: z.string(),
      order: z.array(z.string()).min(1),
    }),
    readOnly: false,
    handler: async (args, ctx) => {
      await kanbanService.reorderColumns(
        ctx.workspaceId,
        args.boardId,
        args.order,
      );
      return { reordered: true };
    },
  }),

  defineTool({
    name: "kanban_card_create",
    scope: "kanban:write",
    title: "Create a kanban card",
    description:
      "Add a card to an existing column. The column id must come from kanban_boards_list.",
    inputSchema: z.object({
      columnId: z.string(),
      title: z.string().min(1).max(200),
      labelIds: z.array(z.string()).optional(),
      ...cardFields,
    }),
    readOnly: false,
    handler: async (args, ctx) => {
      const card = await kanbanService.createCard(
        ctx.workspaceId,
        kanbanCardSchema.parse(args),
      );
      emitCardCreated(ctx.workspaceId, card);
      return card;
    },
  }),

  defineTool({
    name: "kanban_card_update",
    scope: "kanban:write",
    title: "Update a kanban card",
    description:
      "Change a card's title, description, priority, due date, assignee or linked record. Labels are set with kanban_card_labels_set and the column with kanban_card_move.",
    inputSchema: z.object({
      id: z.string(),
      title: z.string().min(1).max(200).optional(),
      ...cardFields,
    }),
    readOnly: false,
    handler: ({ id, ...input }, ctx) =>
      kanbanService.updateCard(
        ctx.workspaceId,
        id,
        kanbanCardUpdateSchema.parse(input),
      ),
  }),

  defineTool({
    name: "kanban_card_move",
    scope: "kanban:write",
    title: "Move a kanban card",
    description:
      "Move one card to another column on the same board, appending it to the end of that column. Moving into a terminal column completes the card and fires the completed webhook.",
    inputSchema: z.object({
      cardId: z.string(),
      columnId: z.string(),
    }),
    readOnly: false,
    handler: async (args, ctx) => {
      await requireCard(ctx.workspaceId, args.cardId);
      const outcomes = await kanbanService.moveCardToColumn(
        ctx.workspaceId,
        args.cardId,
        args.columnId,
      );
      await emitCardMoves(ctx.workspaceId, outcomes);
      return requireCard(ctx.workspaceId, args.cardId);
    },
  }),

  defineTool({
    name: "kanban_card_delete",
    scope: "kanban:write",
    title: "Delete a kanban card",
    description:
      "Delete one card with its checklist and comments. This cannot be undone.",
    inputSchema: z.object({ id: z.string() }),
    readOnly: false,
    handler: async (args, ctx) => {
      await requireCard(ctx.workspaceId, args.id);
      await kanbanService.deleteCard(ctx.workspaceId, args.id);
      return { deleted: args.id };
    },
  }),

  defineTool({
    name: "kanban_card_labels_set",
    scope: "kanban:write",
    title: "Set a card's labels",
    description:
      "Replace the whole label set of one card. Pass an empty array to clear it.",
    inputSchema: z.object({
      cardId: z.string(),
      labelIds: z.array(z.string()),
    }),
    readOnly: false,
    handler: (args, ctx) =>
      kanbanService.replaceCardLabels(
        ctx.workspaceId,
        args.cardId,
        args.labelIds,
      ),
  }),

  defineTool({
    name: "kanban_checklist_add",
    scope: "kanban:write",
    title: "Add a checklist item",
    description: "Append one item to a card's checklist.",
    inputSchema: z.object({
      cardId: z.string(),
      text: z.string().min(1).max(200),
    }),
    readOnly: false,
    handler: ({ cardId, ...input }, ctx) =>
      kanbanService.addChecklistItem(ctx.workspaceId, cardId, input),
  }),

  defineTool({
    name: "kanban_checklist_update",
    scope: "kanban:write",
    title: "Update a checklist item",
    description: "Rewrite a checklist item's text, tick it off, or untick it.",
    inputSchema: z.object({
      itemId: z.string(),
      text: z.string().min(1).max(200).optional(),
      isDone: z.boolean().optional(),
    }),
    readOnly: false,
    handler: ({ itemId, ...input }, ctx) =>
      kanbanService.updateChecklistItem(ctx.workspaceId, itemId, input),
  }),

  defineTool({
    name: "kanban_checklist_delete",
    scope: "kanban:write",
    title: "Delete a checklist item",
    description: "Remove one item from a card's checklist.",
    inputSchema: z.object({ itemId: z.string() }),
    readOnly: false,
    handler: async (args, ctx) => {
      await kanbanService.deleteChecklistItem(ctx.workspaceId, args.itemId);
      return { deleted: args.itemId };
    },
  }),

  defineTool({
    name: "kanban_comment_add",
    scope: "kanban:write",
    title: "Comment on a kanban card",
    description:
      "Add a comment to a card. It is attributed to the API token's name, so the board shows which agent wrote it.",
    inputSchema: z.object({
      cardId: z.string(),
      body: z.string().min(1).max(5000),
    }),
    readOnly: false,
    handler: ({ cardId, ...input }, ctx) =>
      kanbanService.addComment(
        ctx.workspaceId,
        cardId,
        { operatorId: ctx.tokenId, username: ctx.tokenName },
        input,
      ),
  }),

  defineTool({
    name: "kanban_comment_delete",
    scope: "kanban:write",
    title: "Delete a kanban comment",
    description:
      "Remove a comment this token wrote. Comments written by an operator or by another token cannot be removed here.",
    inputSchema: z.object({ commentId: z.string() }),
    readOnly: false,
    handler: async (args, ctx) => {
      await kanbanService.deleteComment(
        ctx.workspaceId,
        args.commentId,
        ctx.tokenId,
      );
      return { deleted: args.commentId };
    },
  }),

  defineTool({
    name: "kanban_label_create",
    scope: "kanban:write",
    title: "Create a kanban label",
    description:
      "Create a workspace kanban label. Names are unique regardless of case.",
    inputSchema: z.object({ name: z.string().min(1), color: labelColor }),
    readOnly: false,
    handler: (args, ctx) =>
      kanbanLabelsService.createLabel(
        ctx.workspaceId,
        null,
        createKanbanLabelSchema.parse(args),
      ),
  }),

  defineTool({
    name: "kanban_label_update",
    scope: "kanban:write",
    title: "Update a kanban label",
    description: "Rename or recolor one kanban label.",
    inputSchema: z.object({
      id: z.string(),
      name: z.string().min(1).optional(),
      color: labelColor.optional(),
    }),
    readOnly: false,
    handler: ({ id, ...input }, ctx) =>
      kanbanLabelsService.updateLabel(
        ctx.workspaceId,
        null,
        id,
        updateKanbanLabelSchema.parse(input),
      ),
  }),

  defineTool({
    name: "kanban_label_delete",
    scope: "kanban:write",
    title: "Delete a kanban label",
    description:
      "Delete one kanban label. The cards carrying it keep their other labels.",
    inputSchema: z.object({ id: z.string() }),
    readOnly: false,
    handler: async (args, ctx) => {
      await kanbanLabelsService.deleteLabel(ctx.workspaceId, null, args.id);
      return { deleted: args.id };
    },
  }),
];
