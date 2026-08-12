import { z } from "zod";
import * as kanbanService from "@/lib/services/kanban";
import { defineTool, type McpToolDefinition } from "@/lib/mcp/tool";
import { McpResourceNotFoundError } from "@/lib/mcp/errors";
import { KANBAN_PRIORITIES } from "@/lib/validation/kanban";

// The board is a small, already-loaded structure, so search filters here
// rather than in the service — same trade-off as tools/bookmarks.ts, and the
// flat shape is what makes a result readable to a model.

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
    handler: async (args, ctx) => {
      const card = await kanbanService.getCard(ctx.workspaceId, args.id);
      if (!card) throw new McpResourceNotFoundError("Kanban card", args.id);
      return card;
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
      description: z
        .string()
        .nullish()
        .describe("Plain text or simple HTML; sanitized on write."),
      priority: z.enum(KANBAN_PRIORITIES).optional(),
      dueDate: z.iso.datetime().nullish(),
    }),
    readOnly: false,
    handler: async (args, ctx) =>
      kanbanService.createCard(ctx.workspaceId, {
        columnId: args.columnId,
        title: args.title,
        description: args.description ?? null,
        priority: args.priority,
        dueDate: args.dueDate ? new Date(args.dueDate) : null,
      }),
  }),

  defineTool({
    name: "kanban_card_move",
    scope: "kanban:write",
    title: "Move a kanban card",
    description:
      "Move one card to another column on the same board, appending it to the end of that column.",
    inputSchema: z.object({
      cardId: z.string(),
      columnId: z.string(),
    }),
    readOnly: false,
    handler: async (args, ctx) => {
      const card = await kanbanService.getCard(ctx.workspaceId, args.cardId);
      if (!card) {
        throw new McpResourceNotFoundError("Kanban card", args.cardId);
      }
      await kanbanService.moveCardToColumn(
        ctx.workspaceId,
        args.cardId,
        args.columnId,
      );
      return kanbanService.getCard(ctx.workspaceId, args.cardId);
    },
  }),
];
