import { startTransition } from "react";
import { z } from "zod";

import { defineWebMcpTool, type WebMcpTool } from "@/lib/web-mcp/define-tool";
import type { KanbanColumnWithCards } from "@/lib/services/kanban";
import { KANBAN_PRIORITIES } from "@/lib/validation/kanban";
import type { cardsApi } from "./api";

// WebMCP tools for the Kanban board, registered by `KanbanBoardView` via
// `useWebMcpTool`. Both factories resolve their `card`/`column` inputs by id
// first, then case-insensitive exact title, then unique case-insensitive
// substring — the same three-step lookup, so an agent can address a card or
// column by whatever the user said out loud without knowing its id.

interface EntityMatch<T> {
  match: T;
}

interface EntityError {
  error: string;
}

// Resolves `query` against `items` using id-exact -> title-exact(ci) ->
// unique title-substring(ci), in that order, stopping at the first step that
// yields exactly one candidate. Ambiguous or missing matches return a
// descriptive `error` listing the candidates found, so the calling agent can
// retry with a more specific value instead of guessing.
function resolveEntity<T extends { id: string }>(
  query: string,
  items: T[],
  getLabel: (item: T) => string,
): EntityMatch<T> | EntityError {
  const byId = items.find((item) => item.id === query);
  if (byId) return { match: byId };

  const lowerQuery = query.toLowerCase();

  const exactTitle = items.filter(
    (item) => getLabel(item).toLowerCase() === lowerQuery,
  );
  if (exactTitle.length === 1) return { match: exactTitle[0] };
  if (exactTitle.length > 1) {
    return {
      error: `"${query}" matches multiple items: ${exactTitle.map(getLabel).join(", ")}. Use a more specific title or the id.`,
    };
  }

  const substring = items.filter((item) =>
    getLabel(item).toLowerCase().includes(lowerQuery),
  );
  if (substring.length === 1) return { match: substring[0] };
  if (substring.length > 1) {
    return {
      error: `"${query}" matches multiple items: ${substring.map(getLabel).join(", ")}. Use a more specific title or the id.`,
    };
  }

  return { error: `No match found for "${query}".` };
}

// --- kanban_move_card ---

const moveCardInputSchema = z
  .object({
    card: z.string().min(1).describe("Title or id of the card to move"),
    targetColumn: z
      .string()
      .min(1)
      .describe("Title or id of the destination column"),
    position: z
      .enum(["start", "end"])
      .default("end")
      .describe("Where to place the card within the destination column"),
  })
  .strict();

export interface MoveCardToolContext {
  boardId: string;
  columns: KanbanColumnWithCards[];
  isFiltering: boolean;
  // Narrower than the component's full `ReorderAction` union — passing the
  // component's `applyOptimisticReorder` (which accepts that wider union)
  // here is safe by function-parameter contravariance.
  applyOptimisticReorder: (action: {
    type: "cards";
    columns: { columnId: string; cardIds: string[] }[];
  }) => void;
  move: typeof cardsApi.move;
  refresh: () => void;
}

export function createMoveCardTool(ctx: MoveCardToolContext): WebMcpTool {
  return defineWebMcpTool({
    name: "kanban_move_card",
    description:
      "Moves a kanban card to a different column on the currently open board. Identify the card and destination column by their visible title or id.",
    inputSchema: moveCardInputSchema,
    readOnly: false,
    async handler(input) {
      if (ctx.isFiltering) {
        throw new Error(
          "The board is currently filtered, so card positions on screen don't reflect the full column order. Clear the filters before moving a card.",
        );
      }

      const flatCards = ctx.columns.flatMap((column) =>
        column.cards.map((card) => ({
          id: card.id,
          title: card.title,
          columnId: column.id,
        })),
      );

      const cardResult = resolveEntity(
        input.card,
        flatCards,
        (card) => card.title,
      );
      if ("error" in cardResult) throw new Error(cardResult.error);

      const columnResult = resolveEntity(
        input.targetColumn,
        ctx.columns,
        (column) => column.name,
      );
      if ("error" in columnResult) throw new Error(columnResult.error);

      const card = cardResult.match;
      const targetColumn = columnResult.match;
      const sourceColumn = ctx.columns.find(
        (column) => column.id === card.columnId,
      );
      if (!sourceColumn) {
        throw new Error(
          `Could not locate the current column for "${card.title}".`,
        );
      }

      if (sourceColumn.id === targetColumn.id) {
        throw new Error(
          `"${card.title}" is already in "${targetColumn.name}". Reordering within a column isn't supported yet.`,
        );
      }

      const remaining = sourceColumn.cards
        .filter((c) => c.id !== card.id)
        .map((c) => c.id);
      const targetIds = targetColumn.cards.map((c) => c.id);
      if (input.position === "start") {
        targetIds.unshift(card.id);
      } else {
        targetIds.push(card.id);
      }

      const payload = [
        { columnId: sourceColumn.id, cardIds: remaining },
        { columnId: targetColumn.id, cardIds: targetIds },
      ];

      return new Promise((resolve, reject) => {
        startTransition(() => {
          ctx.applyOptimisticReorder({ type: "cards", columns: payload });
          void (async () => {
            try {
              await ctx.move(ctx.boardId, payload);
              ctx.refresh();
              resolve({
                movedCard: card.title,
                fromColumn: sourceColumn.name,
                toColumn: targetColumn.name,
              });
            } catch (err) {
              ctx.refresh();
              reject(err instanceof Error ? err : new Error("Failed to move card."));
            }
          })();
        });
      });
    },
  });
}

// --- kanban_create_card ---

const createCardInputSchema = z
  .object({
    column: z.string().min(1).describe("Title or id of the column to create the card in"),
    title: z.string().trim().min(1).max(200).describe("Card title"),
    description: z.string().max(2000).optional().describe("Card description"),
    priority: z.enum(KANBAN_PRIORITIES).optional().describe("Card priority"),
    dueDate: z.string().optional().describe("Due date, YYYY-MM-DD"),
  })
  .strict();

export interface CreateCardToolContext {
  columns: KanbanColumnWithCards[];
  create: typeof cardsApi.create;
  refresh: () => void;
}

export function createCreateCardTool(ctx: CreateCardToolContext): WebMcpTool {
  return defineWebMcpTool({
    name: "kanban_create_card",
    description:
      "Creates a new kanban card in the specified column on the currently open board.",
    inputSchema: createCardInputSchema,
    readOnly: false,
    async handler(input) {
      const columnResult = resolveEntity(
        input.column,
        ctx.columns,
        (column) => column.name,
      );
      if ("error" in columnResult) throw new Error(columnResult.error);

      const column = columnResult.match;

      const created = await ctx.create({
        columnId: column.id,
        title: input.title,
        description: input.description,
        priority: input.priority,
        // The date input has no time component; midnight UTC keeps the
        // stored value stable regardless of where the operator sits — same
        // conversion `card-detail-dialog.tsx` uses.
        dueDate: input.dueDate
          ? new Date(`${input.dueDate}T00:00:00.000Z`).toISOString()
          : undefined,
      });

      ctx.refresh();

      return {
        cardId: created.id,
        title: created.title,
        column: column.name,
      };
    },
  });
}
