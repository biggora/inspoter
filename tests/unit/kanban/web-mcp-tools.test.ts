import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  KanbanBoardDetail,
  KanbanBoardSummary,
  KanbanCardDetail,
  KanbanColumnWithCards,
} from "@/lib/services/kanban";
import {
  createKanbanTools,
  type KanbanToolDeps,
} from "@/components/kanban/web-mcp-tools";
import type { WebMcpTool } from "@/lib/web-mcp/define-tool";
import { expectToolError, expectToolJson } from "../web-mcp/test-utils";

function makeCard(
  overrides: Partial<KanbanCardDetail> & {
    id: string;
    title: string;
    columnId: string;
  },
): KanbanCardDetail {
  return {
    boardId: "board-1",
    description: null,
    position: 0,
    priority: "MEDIUM",
    dueDate: null,
    isOverdue: false,
    assignee: null,
    linkedType: null,
    linkedId: null,
    linkedLabel: null,
    completedAt: null,
    labels: [],
    checklistTotal: 0,
    checklistDone: 0,
    commentCount: 0,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

function makeColumn(
  overrides: Partial<KanbanColumnWithCards> & {
    id: string;
    name: string;
    cards: KanbanCardDetail[];
  },
): KanbanColumnWithCards {
  return {
    color: "SLATE",
    position: 0,
    wipLimit: null,
    isDone: false,
    ...overrides,
  };
}

function makeBoardSummary(
  overrides: Partial<KanbanBoardSummary> & { id: string; name: string },
): KanbanBoardSummary {
  return {
    position: 0,
    columnCount: 2,
    cardCount: 2,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

describe("createKanbanTools", () => {
  let boardOne: KanbanBoardDetail;
  let boardTwo: KanbanBoardDetail;
  let deps: KanbanToolDeps;

  /** Looks a tool up by its advertised name, failing loudly when it is absent. */
  function toolNamed(tools: WebMcpTool[], name: string): WebMcpTool {
    const tool = tools.find((candidate) => candidate.name === name);
    if (!tool) throw new Error(`No tool named "${name}" was registered.`);
    return tool;
  }

  beforeEach(() => {
    boardOne = {
      id: "board-1",
      name: "Platform",
      position: 0,
      columns: [
        makeColumn({
          id: "col-backlog",
          name: "Backlog",
          cards: [
            makeCard({
              id: "card-1",
              title: "Fix login bug",
              columnId: "col-backlog",
            }),
            makeCard({
              id: "card-2",
              title: "Rotate certificates",
              columnId: "col-backlog",
            }),
          ],
        }),
        makeColumn({
          id: "col-done",
          name: "Done",
          isDone: true,
          cards: [
            makeCard({
              id: "card-3",
              title: "Deploy release",
              columnId: "col-done",
            }),
          ],
        }),
      ],
    };

    boardTwo = {
      id: "board-2",
      name: "Support",
      position: 1,
      columns: [
        makeColumn({
          id: "col-inbox",
          name: "Inbox",
          cards: [
            makeCard({
              id: "card-4",
              title: "Answer login ticket",
              columnId: "col-inbox",
              boardId: "board-2",
            }),
          ],
        }),
      ],
    };

    deps = {
      listBoards: vi
        .fn()
        .mockResolvedValue([
          makeBoardSummary({ id: "board-1", name: "Platform" }),
          makeBoardSummary({ id: "board-2", name: "Support" }),
        ]),
      getBoard: vi
        .fn()
        .mockImplementation(async (id: string) =>
          id === "board-1" ? boardOne : boardTwo,
        ),
      getCard: vi
        .fn()
        .mockResolvedValue(
          makeCard({
            id: "card-1",
            title: "Fix login bug",
            columnId: "col-backlog",
          }),
        ),
      createCard: vi
        .fn()
        .mockResolvedValue(
          makeCard({
            id: "card-new",
            title: "New card",
            columnId: "col-backlog",
          }),
        ),
      updateCard: vi
        .fn()
        .mockResolvedValue(
          makeCard({ id: "card-1", title: "Renamed", columnId: "col-backlog" }),
        ),
      deleteCard: vi.fn().mockResolvedValue(undefined),
      moveCards: vi.fn().mockResolvedValue(undefined),
      setCardLabels: vi.fn().mockResolvedValue(
        makeCard({
          id: "card-1",
          title: "Fix login bug",
          columnId: "col-backlog",
          labels: [{ id: "label-1", name: "urgent", color: "RED" }],
        }),
      ),
      listLabels: vi
        .fn()
        .mockResolvedValue([
          { id: "label-1", name: "urgent", color: "RED", cardCount: 3 },
        ]),
      listChecklist: vi
        .fn()
        .mockResolvedValue([
          {
            id: "item-1",
            text: "Write the migration",
            isDone: false,
            position: 0,
          },
        ]),
      addChecklistItem: vi
        .fn()
        .mockResolvedValue({
          id: "item-2",
          text: "Ship it",
          isDone: false,
          position: 1,
        }),
      updateChecklistItem: vi
        .fn()
        .mockResolvedValue({
          id: "item-1",
          text: "Write the migration",
          isDone: true,
          position: 0,
        }),
      listComments: vi.fn().mockResolvedValue([
        {
          id: "comment-1",
          authorOperatorId: "op-1",
          authorName: "ada",
          body: "Looks good.",
          createdAt: "2026-01-02T00:00:00.000Z",
        },
      ]),
      addComment: vi.fn().mockResolvedValue({
        id: "comment-2",
        authorOperatorId: "op-1",
        authorName: "ada",
        body: "On it.",
        createdAt: "2026-01-03T00:00:00.000Z",
      }),
      createColumn: vi.fn().mockResolvedValue(undefined),
      refresh: vi.fn(),
    };
  });

  it("registers the tool names the server-side catalog uses", () => {
    expect(createKanbanTools(deps).map((tool) => tool.name)).toEqual([
      "kanban_boards_list",
      "kanban_board_get",
      "kanban_cards_search",
      "kanban_card_get",
      "kanban_labels_list",
      "kanban_checklist_list",
      "kanban_comments_list",
      "kanban_card_create",
      "kanban_card_update",
      "kanban_card_move",
      "kanban_card_delete",
      "kanban_card_labels_set",
      "kanban_checklist_add",
      "kanban_checklist_update",
      "kanban_comment_add",
      "kanban_column_create",
    ]);
  });

  it("gives every tool a non-empty title for agent clients that caption them", () => {
    for (const tool of createKanbanTools(deps)) {
      expect(tool.title.length).toBeGreaterThan(0);
    }
  });

  it("marks exactly the read tools readOnly", () => {
    const readOnly = createKanbanTools(deps)
      .filter((tool) => tool.annotations.readOnlyHint)
      .map((tool) => tool.name);

    expect(readOnly).toEqual([
      "kanban_boards_list",
      "kanban_board_get",
      "kanban_cards_search",
      "kanban_card_get",
      "kanban_labels_list",
      "kanban_checklist_list",
      "kanban_comments_list",
    ]);
  });

  it("flags the tools returning operator-authored text as untrusted", () => {
    const untrusted = createKanbanTools(deps)
      .filter((tool) => tool.annotations.untrustedContentHint)
      .map((tool) => tool.name);

    expect(untrusted).toEqual([
      "kanban_board_get",
      "kanban_cards_search",
      "kanban_card_get",
      "kanban_checklist_list",
      "kanban_comments_list",
    ]);
  });

  // --- kanban_card_move ---

  describe("kanban_card_move", () => {
    it("builds the {columnId, cardIds}[] payload from the fetched board", async () => {
      const tool = toolNamed(createKanbanTools(deps), "kanban_card_move");

      const result = await tool.execute({
        boardId: "board-1",
        cardId: "card-1",
        targetColumnId: "col-done",
      });

      expect(deps.getBoard).toHaveBeenCalledWith("board-1");
      expect(deps.moveCards).toHaveBeenCalledWith("board-1", [
        { columnId: "col-backlog", cardIds: ["card-2"] },
        { columnId: "col-done", cardIds: ["card-3", "card-1"] },
      ]);
      expect(deps.refresh).toHaveBeenCalledTimes(1);
      expect(expectToolJson(result)).toEqual({
        cardId: "card-1",
        movedCard: "Fix login bug",
        fromColumn: "Backlog",
        toColumn: "Done",
      });
    });

    it("puts the card first in the destination column when position is 'start'", async () => {
      const tool = toolNamed(createKanbanTools(deps), "kanban_card_move");

      await tool.execute({
        boardId: "board-1",
        cardId: "card-1",
        targetColumnId: "col-done",
        position: "start",
      });

      expect(deps.moveCards).toHaveBeenCalledWith("board-1", [
        { columnId: "col-backlog", cardIds: ["card-2"] },
        { columnId: "col-done", cardIds: ["card-1", "card-3"] },
      ]);
    });

    it("reports an unknown card id without calling move", async () => {
      const tool = toolNamed(createKanbanTools(deps), "kanban_card_move");

      const result = await tool.execute({
        boardId: "board-1",
        cardId: "card-999",
        targetColumnId: "col-done",
      });

      expect(expectToolError(result)).toContain("card-999");
      expect(deps.moveCards).not.toHaveBeenCalled();
    });

    it("reports an unknown target column without calling move", async () => {
      const tool = toolNamed(createKanbanTools(deps), "kanban_card_move");

      const result = await tool.execute({
        boardId: "board-1",
        cardId: "card-1",
        targetColumnId: "col-nope",
      });

      expect(expectToolError(result)).toContain("col-nope");
      expect(deps.moveCards).not.toHaveBeenCalled();
    });

    it("refuses a move into the column the card already sits in", async () => {
      const tool = toolNamed(createKanbanTools(deps), "kanban_card_move");

      const result = await tool.execute({
        boardId: "board-1",
        cardId: "card-1",
        targetColumnId: "col-backlog",
      });

      expect(expectToolError(result)).toContain("already in");
      expect(deps.moveCards).not.toHaveBeenCalled();
    });

    it("advertises position as optional, since the schema supplies the default", () => {
      const schema = toolNamed(createKanbanTools(deps), "kanban_card_move")
        .inputSchema as {
        required?: string[];
        properties?: Record<string, { default?: unknown }>;
      };

      expect(schema.required).toEqual(["boardId", "cardId", "targetColumnId"]);
      expect(schema.properties?.position?.default).toBe("end");
    });
  });

  // --- kanban_cards_search ---

  describe("kanban_cards_search", () => {
    it("returns flat rows carrying board and column names next to their ids", async () => {
      const tool = toolNamed(createKanbanTools(deps), "kanban_cards_search");

      const result = await tool.execute({ query: "login" });
      const payload = expectToolJson<{
        total: number;
        cards: Record<string, unknown>[];
      }>(result);

      expect(payload.total).toBe(2);
      expect(payload.cards[0]).toMatchObject({
        id: "card-1",
        title: "Fix login bug",
        boardId: "board-1",
        boardName: "Platform",
        columnId: "col-backlog",
        columnName: "Backlog",
        priority: "MEDIUM",
        assignee: null,
        labels: [],
      });
      expect(payload.cards[1]).toMatchObject({
        id: "card-4",
        boardId: "board-2",
        boardName: "Support",
        columnName: "Inbox",
      });
    });

    it("fetches every board when no boardId is given", async () => {
      const tool = toolNamed(createKanbanTools(deps), "kanban_cards_search");

      await tool.execute({});

      expect(deps.listBoards).toHaveBeenCalledTimes(1);
      expect(deps.getBoard).toHaveBeenCalledWith("board-1");
      expect(deps.getBoard).toHaveBeenCalledWith("board-2");
    });

    it("fetches only the named board when boardId is given", async () => {
      const tool = toolNamed(createKanbanTools(deps), "kanban_cards_search");

      const result = await tool.execute({ boardId: "board-2" });

      expect(deps.listBoards).not.toHaveBeenCalled();
      expect(deps.getBoard).toHaveBeenCalledTimes(1);
      expect(expectToolJson<{ total: number }>(result).total).toBe(1);
    });

    it("narrows to one column and drops done cards on request", async () => {
      const tool = toolNamed(createKanbanTools(deps), "kanban_cards_search");

      const byColumn = await tool.execute({ columnId: "col-done" });
      expect(expectToolJson<{ total: number }>(byColumn).total).toBe(1);

      const open = await tool.execute({ openOnly: true });
      const payload = expectToolJson<{ cards: { id: string }[] }>(open);
      expect(payload.cards.map((card) => card.id)).toEqual([
        "card-1",
        "card-2",
        "card-4",
      ]);
    });

    it("caps the returned rows at the requested limit but reports the true total", async () => {
      const tool = toolNamed(createKanbanTools(deps), "kanban_cards_search");

      const result = await tool.execute({ limit: 1 });
      const payload = expectToolJson<{ total: number; cards: unknown[] }>(
        result,
      );

      expect(payload.total).toBe(4);
      expect(payload.cards).toHaveLength(1);
    });
  });

  // --- the rest ---

  it("kanban_boards_list reports each board's columns with their card counts", async () => {
    const tool = toolNamed(createKanbanTools(deps), "kanban_boards_list");

    const result = await tool.execute({});

    expect(expectToolJson(result)).toEqual({
      total: 2,
      boards: [
        {
          id: "board-1",
          name: "Platform",
          cardCount: 2,
          columns: [
            { id: "col-backlog", name: "Backlog", isDone: false, cardCount: 2 },
            { id: "col-done", name: "Done", isDone: true, cardCount: 1 },
          ],
        },
        {
          id: "board-2",
          name: "Support",
          cardCount: 2,
          columns: [
            { id: "col-inbox", name: "Inbox", isDone: false, cardCount: 1 },
          ],
        },
      ],
    });
  });

  it("kanban_card_create converts the due date to midnight UTC and passes label ids", async () => {
    const tool = toolNamed(createKanbanTools(deps), "kanban_card_create");

    await tool.execute({
      columnId: "col-backlog",
      title: "New card",
      dueDate: "2026-09-01",
      labelIds: ["label-1"],
    });

    expect(deps.createCard).toHaveBeenCalledWith({
      columnId: "col-backlog",
      title: "New card",
      description: undefined,
      priority: undefined,
      dueDate: "2026-09-01T00:00:00.000Z",
      labelIds: ["label-1"],
    });
    expect(deps.refresh).toHaveBeenCalledTimes(1);
  });

  it("kanban_card_create rejects a malformed due date without calling the API", async () => {
    const tool = toolNamed(createKanbanTools(deps), "kanban_card_create");

    const result = await tool.execute({
      columnId: "col-backlog",
      title: "New card",
      dueDate: "next tuesday",
    });

    expect(expectToolError(result)).toContain("Invalid input");
    expect(deps.createCard).not.toHaveBeenCalled();
  });

  it("kanban_card_update clears a due date when null is passed", async () => {
    const tool = toolNamed(createKanbanTools(deps), "kanban_card_update");

    await tool.execute({ cardId: "card-1", dueDate: null });

    expect(deps.updateCard).toHaveBeenCalledWith("card-1", {
      title: undefined,
      description: undefined,
      priority: undefined,
      dueDate: null,
    });
  });

  it("kanban_card_labels_set replaces the label set and reports the new names", async () => {
    const tool = toolNamed(createKanbanTools(deps), "kanban_card_labels_set");

    const result = await tool.execute({
      cardId: "card-1",
      labelIds: ["label-1"],
    });

    expect(deps.setCardLabels).toHaveBeenCalledWith("card-1", ["label-1"]);
    expect(expectToolJson(result)).toEqual({
      cardId: "card-1",
      labels: ["urgent"],
    });
  });

  it("kanban_checklist_update insists on at least one of text or isDone", async () => {
    const tool = toolNamed(createKanbanTools(deps), "kanban_checklist_update");

    const empty = await tool.execute({ itemId: "item-1" });
    expect(expectToolError(empty)).toContain("Invalid input");
    expect(deps.updateChecklistItem).not.toHaveBeenCalled();

    await tool.execute({ itemId: "item-1", isDone: true });
    expect(deps.updateChecklistItem).toHaveBeenCalledWith("item-1", {
      text: undefined,
      isDone: true,
    });
  });

  it("kanban_comment_add posts the body and refreshes", async () => {
    const tool = toolNamed(createKanbanTools(deps), "kanban_comment_add");

    const result = await tool.execute({ cardId: "card-1", body: "On it." });

    expect(deps.addComment).toHaveBeenCalledWith("card-1", "On it.");
    expect(deps.refresh).toHaveBeenCalledTimes(1);
    expect(expectToolJson(result)).toEqual({
      commentId: "comment-2",
      author: "ada",
    });
  });

  it("kanban_card_delete removes the card and refreshes", async () => {
    const tool = toolNamed(createKanbanTools(deps), "kanban_card_delete");

    const result = await tool.execute({ cardId: "card-1" });

    expect(deps.deleteCard).toHaveBeenCalledWith("card-1");
    expect(deps.refresh).toHaveBeenCalledTimes(1);
    expect(expectToolJson(result)).toEqual({ deleted: "card-1" });
  });

  it("kanban_column_create forwards the whole column input", async () => {
    const tool = toolNamed(createKanbanTools(deps), "kanban_column_create");

    await tool.execute({
      boardId: "board-1",
      name: "Review",
      color: "BLUE",
      isDone: false,
    });

    expect(deps.createColumn).toHaveBeenCalledWith({
      boardId: "board-1",
      name: "Review",
      color: "BLUE",
      isDone: false,
    });
  });

  it("surfaces an API failure as an error result", async () => {
    deps.moveCards = vi.fn().mockRejectedValue(new Error("network down"));
    const tool = toolNamed(createKanbanTools(deps), "kanban_card_move");

    const result = await tool.execute({
      boardId: "board-1",
      cardId: "card-1",
      targetColumnId: "col-done",
    });

    expect(expectToolError(result)).toBe("network down");
    expect(deps.refresh).not.toHaveBeenCalled();
  });
});
