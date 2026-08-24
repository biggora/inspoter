import { beforeEach, describe, expect, it, vi } from "vitest";

import type { KanbanCardDetail, KanbanColumnWithCards } from "@/lib/services/kanban";
import {
  createCreateCardTool,
  createMoveCardTool,
  type CreateCardToolContext,
  type MoveCardToolContext,
} from "@/components/kanban/web-mcp-tools";

function makeCard(
  overrides: Partial<KanbanCardDetail> & { id: string; title: string; columnId: string },
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

describe("createMoveCardTool", () => {
  let backlog: KanbanColumnWithCards;
  let done: KanbanColumnWithCards;
  let ctx: MoveCardToolContext;

  beforeEach(() => {
    backlog = makeColumn({
      id: "col-backlog",
      name: "Backlog",
      cards: [makeCard({ id: "card-1", title: "Fix login bug", columnId: "col-backlog" })],
    });
    done = makeColumn({
      id: "col-done",
      name: "Done",
      cards: [makeCard({ id: "card-2", title: "Deploy release", columnId: "col-done" })],
    });

    ctx = {
      boardId: "board-1",
      columns: [backlog, done],
      isFiltering: false,
      applyOptimisticReorder: vi.fn(),
      move: vi.fn().mockResolvedValue(undefined),
      refresh: vi.fn(),
    };
  });

  it("resolves card and column by exact id", async () => {
    const tool = createMoveCardTool(ctx);
    const result = await tool.execute({
      card: "card-1",
      targetColumn: "col-done",
    });

    expect(result).toMatchObject({
      movedCard: "Fix login bug",
      fromColumn: "Backlog",
      toColumn: "Done",
    });
  });

  it("resolves card and column by case-insensitive exact title", async () => {
    const tool = createMoveCardTool(ctx);
    const result = await tool.execute({
      card: "fix login bug",
      targetColumn: "done",
    });

    expect(result).toMatchObject({ movedCard: "Fix login bug" });
  });

  it("resolves card and column by a unique case-insensitive substring", async () => {
    const tool = createMoveCardTool(ctx);
    const result = await tool.execute({
      card: "login",
      targetColumn: "don",
    });

    expect(result).toMatchObject({ movedCard: "Fix login bug", toColumn: "Done" });
  });

  it("returns a listing error when the card query is ambiguous", async () => {
    backlog.cards.push(
      makeCard({ id: "card-3", title: "Fix logout bug", columnId: "col-backlog" }),
    );
    const tool = createMoveCardTool(ctx);
    const result = (await tool.execute({
      card: "fix",
      targetColumn: "col-done",
    })) as { error: string };

    expect(result.error).toContain("Fix login bug");
    expect(result.error).toContain("Fix logout bug");
    expect(ctx.move).not.toHaveBeenCalled();
  });

  it("returns a not-found error when the card query matches nothing", async () => {
    const tool = createMoveCardTool(ctx);
    const result = (await tool.execute({
      card: "does not exist",
      targetColumn: "col-done",
    })) as { error: string };

    expect(result.error).toContain("No match found");
    expect(ctx.move).not.toHaveBeenCalled();
  });

  it("blocks the move while the board is filtered", async () => {
    ctx.isFiltering = true;
    const tool = createMoveCardTool(ctx);
    const result = (await tool.execute({
      card: "card-1",
      targetColumn: "col-done",
    })) as { error: string };

    expect(result.error).toMatch(/filtered/i);
    expect(ctx.move).not.toHaveBeenCalled();
  });

  it("returns an error when the card is already in the target column", async () => {
    const tool = createMoveCardTool(ctx);
    const result = (await tool.execute({
      card: "card-1",
      targetColumn: "col-backlog",
    })) as { error: string };

    expect(result.error).toContain("already in");
    expect(ctx.move).not.toHaveBeenCalled();
  });

  it("calls ctx.move with the correct {columnId, cardIds}[] payload and refreshes on success", async () => {
    const tool = createMoveCardTool(ctx);
    await tool.execute({ card: "card-1", targetColumn: "col-done" });

    expect(ctx.move).toHaveBeenCalledWith("board-1", [
      { columnId: "col-backlog", cardIds: [] },
      { columnId: "col-done", cardIds: ["card-2", "card-1"] },
    ]);
    expect(ctx.applyOptimisticReorder).toHaveBeenCalledWith({
      type: "cards",
      columns: [
        { columnId: "col-backlog", cardIds: [] },
        { columnId: "col-done", cardIds: ["card-2", "card-1"] },
      ],
    });
    expect(ctx.refresh).toHaveBeenCalledTimes(1);
  });

  it("places the card at the start of the target column when position is 'start'", async () => {
    const tool = createMoveCardTool(ctx);
    await tool.execute({
      card: "card-1",
      targetColumn: "col-done",
      position: "start",
    });

    expect(ctx.move).toHaveBeenCalledWith("board-1", [
      { columnId: "col-backlog", cardIds: [] },
      { columnId: "col-done", cardIds: ["card-1", "card-2"] },
    ]);
  });

  it("still calls refresh (for rollback) and reports an error when ctx.move rejects", async () => {
    ctx.move = vi.fn().mockRejectedValue(new Error("network down"));
    const tool = createMoveCardTool(ctx);
    const result = (await tool.execute({
      card: "card-1",
      targetColumn: "col-done",
    })) as { error: string };

    expect(result.error).toBeTruthy();
    expect(ctx.refresh).toHaveBeenCalledTimes(1);
  });
});

describe("createCreateCardTool", () => {
  let backlog: KanbanColumnWithCards;
  let ctx: CreateCardToolContext;

  beforeEach(() => {
    backlog = makeColumn({ id: "col-backlog", name: "Backlog", cards: [] });
    ctx = {
      columns: [backlog],
      create: vi.fn().mockResolvedValue(
        makeCard({ id: "card-new", title: "New card", columnId: "col-backlog" }),
      ),
      refresh: vi.fn(),
    };
  });

  it("resolves the column by exact id", async () => {
    const tool = createCreateCardTool(ctx);
    await tool.execute({ column: "col-backlog", title: "New card" });

    expect(ctx.create).toHaveBeenCalledWith(
      expect.objectContaining({ columnId: "col-backlog", title: "New card" }),
    );
  });

  it("resolves the column by case-insensitive exact title", async () => {
    const tool = createCreateCardTool(ctx);
    await tool.execute({ column: "backlog", title: "New card" });

    expect(ctx.create).toHaveBeenCalledWith(
      expect.objectContaining({ columnId: "col-backlog" }),
    );
  });

  it("resolves the column by a unique case-insensitive substring", async () => {
    const tool = createCreateCardTool(ctx);
    await tool.execute({ column: "back", title: "New card" });

    expect(ctx.create).toHaveBeenCalledWith(
      expect.objectContaining({ columnId: "col-backlog" }),
    );
  });

  it("returns an error and does not call create when the column is not found", async () => {
    const tool = createCreateCardTool(ctx);
    const result = (await tool.execute({
      column: "nope",
      title: "New card",
    })) as { error: string };

    expect(result.error).toContain("No match found");
    expect(ctx.create).not.toHaveBeenCalled();
  });

  it("calls ctx.create with the expected fields and refreshes on the happy path", async () => {
    const tool = createCreateCardTool(ctx);
    const result = await tool.execute({
      column: "col-backlog",
      title: "New card",
      description: "Details here",
      priority: "HIGH",
      dueDate: "2026-09-01",
    });

    expect(ctx.create).toHaveBeenCalledWith({
      columnId: "col-backlog",
      title: "New card",
      description: "Details here",
      priority: "HIGH",
      dueDate: "2026-09-01T00:00:00.000Z",
    });
    expect(ctx.refresh).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      cardId: "card-new",
      title: "New card",
      column: "Backlog",
    });
  });

  it("omitting priority/description/dueDate does not error", async () => {
    const tool = createCreateCardTool(ctx);
    const result = await tool.execute({
      column: "col-backlog",
      title: "Minimal card",
    });

    expect(ctx.create).toHaveBeenCalledWith({
      columnId: "col-backlog",
      title: "Minimal card",
      description: undefined,
      priority: undefined,
      dueDate: undefined,
    });
    expect(result).not.toHaveProperty("error");
  });
});
