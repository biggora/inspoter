import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import * as kanbanService from "@/lib/services/kanban";

let workspaceId: string;
let otherWorkspaceId: string;
let operatorId: string;
let strangerOperatorId: string;

async function makeWorkspace(slugPrefix: string): Promise<string> {
  const workspace = await db.workspace.create({
    data: {
      name: "Kanban test workspace",
      slug: `${slugPrefix}-${randomUUID()}`,
      updatedAt: new Date(),
    },
  });
  return workspace.id;
}

beforeAll(async () => {
  workspaceId = await makeWorkspace("kanban");
  otherWorkspaceId = await makeWorkspace("kanban-other");

  const operator = await db.operator.create({
    data: { username: `kanban-op-${randomUUID()}` },
  });
  operatorId = operator.id;
  await db.workspaceMember.create({
    data: { workspaceId, operatorId, role: "OWNER" },
  });

  // A member of the other workspace only — used to prove the assignee gate.
  const stranger = await db.operator.create({
    data: { username: `kanban-stranger-${randomUUID()}` },
  });
  strangerOperatorId = stranger.id;
  await db.workspaceMember.create({
    data: {
      workspaceId: otherWorkspaceId,
      operatorId: strangerOperatorId,
      role: "MEMBER",
    },
  });
});

afterAll(async () => {
  for (const id of [workspaceId, otherWorkspaceId]) {
    if (id) await db.workspace.delete({ where: { id } }).catch(() => {});
  }
  for (const id of [operatorId, strangerOperatorId]) {
    if (id) await db.operator.delete({ where: { id } }).catch(() => {});
  }
});

beforeEach(async () => {
  await db.kanbanBoard.deleteMany({
    where: { workspaceId: { in: [workspaceId, otherWorkspaceId] } },
  });
  await db.kanbanLabel.deleteMany({
    where: { workspaceId: { in: [workspaceId, otherWorkspaceId] } },
  });
});

async function boardWithColumns() {
  const board = await kanbanService.createBoard(workspaceId, { name: "Ops" });
  const detail = await kanbanService.getBoard(workspaceId, board.id);
  return { board, columns: detail!.columns };
}

describe("createBoard", () => {
  it("seeds the three default columns with the last one terminal", async () => {
    const { columns } = await boardWithColumns();
    expect(columns.map((column) => column.name)).toEqual([
      "Backlog",
      "In progress",
      "Done",
    ]);
    expect(columns.map((column) => column.isDone)).toEqual([
      false,
      false,
      true,
    ]);
    expect(columns.map((column) => column.position)).toEqual([0, 1, 2]);
  });

  it("appends each new board after the last", async () => {
    await kanbanService.createBoard(workspaceId, { name: "First" });
    await kanbanService.createBoard(workspaceId, { name: "Second" });
    const boards = await kanbanService.listBoards(workspaceId);
    expect(boards.map((board) => board.name)).toEqual(["First", "Second"]);
  });
});

describe("workspace isolation", () => {
  it("does not return another workspace's board", async () => {
    const { board } = await boardWithColumns();
    expect(await kanbanService.getBoard(otherWorkspaceId, board.id)).toBe(null);
  });

  it("refuses to rename a board through the wrong workspace", async () => {
    const { board } = await boardWithColumns();
    await expect(
      kanbanService.renameBoard(otherWorkspaceId, board.id, { name: "x" }),
    ).rejects.toBeInstanceOf(kanbanService.KanbanNotFoundError);
  });

  it("refuses to create a column on another workspace's board", async () => {
    const { board } = await boardWithColumns();
    await expect(
      kanbanService.createColumn(otherWorkspaceId, {
        boardId: board.id,
        name: "Nope",
        color: "SLATE",
      }),
    ).rejects.toBeInstanceOf(kanbanService.KanbanNotFoundError);
  });
});

describe("createCard", () => {
  it("appends to the end of its column", async () => {
    const { columns } = await boardWithColumns();
    await kanbanService.createCard(workspaceId, {
      columnId: columns[0].id,
      title: "First",
    });
    const second = await kanbanService.createCard(workspaceId, {
      columnId: columns[0].id,
      title: "Second",
    });
    expect(second.position).toBe(1);
  });

  it("stamps completedAt when created straight into a terminal column", async () => {
    const { columns } = await boardWithColumns();
    const card = await kanbanService.createCard(workspaceId, {
      columnId: columns[2].id,
      title: "Already done",
    });
    expect(card.completedAt).not.toBe(null);
  });

  it("rejects an assignee who is not a member of the workspace", async () => {
    const { columns } = await boardWithColumns();
    await expect(
      kanbanService.createCard(workspaceId, {
        columnId: columns[0].id,
        title: "Nope",
        assigneeOperatorId: strangerOperatorId,
      }),
    ).rejects.toBeInstanceOf(kanbanService.KanbanValidationError);
  });

  it("sanitizes the description and drops empty markup", async () => {
    const { columns } = await boardWithColumns();
    const dirty = await kanbanService.createCard(workspaceId, {
      columnId: columns[0].id,
      title: "Dirty",
      description: "<p>keep</p><script>alert(1)</script>",
    });
    expect(dirty.description).toBe("<p>keep</p>");

    const blank = await kanbanService.createCard(workspaceId, {
      columnId: columns[0].id,
      title: "Blank",
      description: "<p></p>",
    });
    expect(blank.description).toBe(null);
  });
});

describe("moveCards", () => {
  it("renumbers within one column without touching completedAt", async () => {
    const { board, columns } = await boardWithColumns();
    const a = await kanbanService.createCard(workspaceId, {
      columnId: columns[0].id,
      title: "A",
    });
    const b = await kanbanService.createCard(workspaceId, {
      columnId: columns[0].id,
      title: "B",
    });

    const outcomes = await kanbanService.moveCards(workspaceId, board.id, [
      { columnId: columns[0].id, cardIds: [b.id, a.id] },
    ]);
    expect(outcomes).toEqual([]);

    const detail = await kanbanService.getBoard(workspaceId, board.id);
    expect(detail!.columns[0].cards.map((card) => card.title)).toEqual([
      "B",
      "A",
    ]);
  });

  it("stamps completedAt on arrival in a terminal column and clears it on exit", async () => {
    const { board, columns } = await boardWithColumns();
    const card = await kanbanService.createCard(workspaceId, {
      columnId: columns[0].id,
      title: "Ship it",
    });

    const toDone = await kanbanService.moveCards(workspaceId, board.id, [
      { columnId: columns[0].id, cardIds: [] },
      { columnId: columns[2].id, cardIds: [card.id] },
    ]);
    expect(toDone).toHaveLength(1);
    expect(toDone[0].completed).toBe(true);
    expect(
      (await kanbanService.getCard(workspaceId, card.id))?.completedAt,
    ).not.toBe(null);

    await kanbanService.moveCards(workspaceId, board.id, [
      { columnId: columns[2].id, cardIds: [] },
      { columnId: columns[0].id, cardIds: [card.id] },
    ]);
    expect(
      (await kanbanService.getCard(workspaceId, card.id))?.completedAt,
    ).toBe(null);
  });

  // A payload that omits a card the column still holds would strand that row
  // at a stale position, so the whole move is refused.
  it("rejects a payload that does not list every card of the affected columns", async () => {
    const { board, columns } = await boardWithColumns();
    const a = await kanbanService.createCard(workspaceId, {
      columnId: columns[0].id,
      title: "A",
    });
    await kanbanService.createCard(workspaceId, {
      columnId: columns[0].id,
      title: "B",
    });

    await expect(
      kanbanService.moveCards(workspaceId, board.id, [
        { columnId: columns[0].id, cardIds: [a.id] },
      ]),
    ).rejects.toBeInstanceOf(kanbanService.KanbanValidationError);
  });

  it("rejects a card from another board", async () => {
    const { board, columns } = await boardWithColumns();
    const other = await boardWithColumns();
    const foreign = await kanbanService.createCard(workspaceId, {
      columnId: other.columns[0].id,
      title: "Elsewhere",
    });

    await expect(
      kanbanService.moveCards(workspaceId, board.id, [
        { columnId: columns[0].id, cardIds: [foreign.id] },
      ]),
    ).rejects.toBeInstanceOf(kanbanService.KanbanValidationError);
  });
});

describe("moveCardToColumn", () => {
  it("appends the card to the destination and closes the gap behind it", async () => {
    const { board, columns } = await boardWithColumns();
    const a = await kanbanService.createCard(workspaceId, {
      columnId: columns[0].id,
      title: "A",
    });
    const b = await kanbanService.createCard(workspaceId, {
      columnId: columns[0].id,
      title: "B",
    });
    await kanbanService.createCard(workspaceId, {
      columnId: columns[1].id,
      title: "C",
    });

    await kanbanService.moveCardToColumn(workspaceId, a.id, columns[1].id);

    const detail = await kanbanService.getBoard(workspaceId, board.id);
    expect(detail!.columns[0].cards.map((card) => card.title)).toEqual(["B"]);
    expect(detail!.columns[0].cards[0].position).toBe(0);
    expect(detail!.columns[1].cards.map((card) => card.title)).toEqual([
      "C",
      "A",
    ]);
    expect(b.id).toBeTruthy();
  });

  it("is a no-op when the card is already there", async () => {
    const { columns } = await boardWithColumns();
    const card = await kanbanService.createCard(workspaceId, {
      columnId: columns[0].id,
      title: "Stay",
    });
    expect(
      await kanbanService.moveCardToColumn(workspaceId, card.id, columns[0].id),
    ).toEqual([]);
  });

  it("refuses a destination column on another board", async () => {
    const { columns } = await boardWithColumns();
    const other = await boardWithColumns();
    const card = await kanbanService.createCard(workspaceId, {
      columnId: columns[0].id,
      title: "Stay put",
    });

    await expect(
      kanbanService.moveCardToColumn(workspaceId, card.id, other.columns[0].id),
    ).rejects.toBeInstanceOf(kanbanService.KanbanValidationError);
  });
});

describe("updateColumn", () => {
  it("completes the cards already sitting in a column that becomes terminal", async () => {
    const { columns } = await boardWithColumns();
    const card = await kanbanService.createCard(workspaceId, {
      columnId: columns[1].id,
      title: "In flight",
    });
    expect(card.completedAt).toBe(null);

    await kanbanService.updateColumn(workspaceId, columns[1].id, {
      isDone: true,
    });
    expect(
      (await kanbanService.getCard(workspaceId, card.id))?.completedAt,
    ).not.toBe(null);

    await kanbanService.updateColumn(workspaceId, columns[1].id, {
      isDone: false,
    });
    expect(
      (await kanbanService.getCard(workspaceId, card.id))?.completedAt,
    ).toBe(null);
  });
});

describe("cascades", () => {
  it("removes columns, cards, checklist items and comments with the board", async () => {
    const { board, columns } = await boardWithColumns();
    const card = await kanbanService.createCard(workspaceId, {
      columnId: columns[0].id,
      title: "Doomed",
    });
    await kanbanService.addChecklistItem(workspaceId, card.id, {
      text: "step",
    });
    await kanbanService.addComment(
      workspaceId,
      card.id,
      { operatorId, username: "op" },
      { body: "note" },
    );

    await kanbanService.deleteBoard(workspaceId, board.id);

    expect(await db.kanbanColumn.count({ where: { boardId: board.id } })).toBe(
      0,
    );
    expect(await db.kanbanCard.count({ where: { id: card.id } })).toBe(0);
    expect(
      await db.kanbanChecklistItem.count({ where: { cardId: card.id } }),
    ).toBe(0);
    expect(await db.kanbanComment.count({ where: { cardId: card.id } })).toBe(
      0,
    );
  });

  it("unassigns cards when the assignee leaves the workspace", async () => {
    const leaver = await db.operator.create({
      data: { username: `kanban-leaver-${randomUUID()}` },
    });
    await db.workspaceMember.create({
      data: { workspaceId, operatorId: leaver.id, role: "MEMBER" },
    });

    const { columns } = await boardWithColumns();
    const card = await kanbanService.createCard(workspaceId, {
      columnId: columns[0].id,
      title: "Owned",
      assigneeOperatorId: leaver.id,
    });
    expect(card.assignee?.operatorId).toBe(leaver.id);

    await db.workspaceMember.delete({
      where: { workspaceId_operatorId: { workspaceId, operatorId: leaver.id } },
    });

    const after = await kanbanService.getCard(workspaceId, card.id);
    expect(after).not.toBe(null);
    expect(after?.assignee).toBe(null);

    await db.operator.delete({ where: { id: leaver.id } }).catch(() => {});
  });
});

describe("comments", () => {
  it("lets only the author delete their comment", async () => {
    const { columns } = await boardWithColumns();
    const card = await kanbanService.createCard(workspaceId, {
      columnId: columns[0].id,
      title: "Discussed",
    });
    const comment = await kanbanService.addComment(
      workspaceId,
      card.id,
      { operatorId, username: "op" },
      { body: "mine" },
    );

    await expect(
      kanbanService.deleteComment(workspaceId, comment.id, strangerOperatorId),
    ).rejects.toBeInstanceOf(kanbanService.KanbanNotFoundError);

    await kanbanService.deleteComment(workspaceId, comment.id, operatorId);
    expect(await kanbanService.listComments(workspaceId, card.id)).toHaveLength(
      0,
    );
  });
});

describe("card labels", () => {
  it("replaces the whole set and rejects a label from another workspace", async () => {
    const { columns } = await boardWithColumns();
    const card = await kanbanService.createCard(workspaceId, {
      columnId: columns[0].id,
      title: "Tagged",
    });
    const [one, two] = await Promise.all([
      db.kanbanLabel.create({
        data: {
          workspaceId,
          name: "ops",
          normalizedName: "ops",
          color: "BLUE",
        },
      }),
      db.kanbanLabel.create({
        data: {
          workspaceId,
          name: "urgent",
          normalizedName: "urgent",
          color: "RED",
        },
      }),
    ]);
    const foreign = await db.kanbanLabel.create({
      data: {
        workspaceId: otherWorkspaceId,
        name: "elsewhere",
        normalizedName: "elsewhere",
        color: "GREEN",
      },
    });

    let updated = await kanbanService.replaceCardLabels(workspaceId, card.id, [
      one.id,
      two.id,
    ]);
    expect(updated.labels.map((label) => label.name).sort()).toEqual([
      "ops",
      "urgent",
    ]);

    updated = await kanbanService.replaceCardLabels(workspaceId, card.id, [
      two.id,
    ]);
    expect(updated.labels.map((label) => label.name)).toEqual(["urgent"]);

    await expect(
      kanbanService.replaceCardLabels(workspaceId, card.id, [foreign.id]),
    ).rejects.toBeInstanceOf(kanbanService.KanbanNotFoundError);
  });
});

describe("isOverdue", () => {
  it("is true only for a past due date on an open card", async () => {
    const { columns } = await boardWithColumns();
    const past = new Date(Date.now() - 86_400_000);

    const open = await kanbanService.createCard(workspaceId, {
      columnId: columns[0].id,
      title: "Late",
      dueDate: past,
    });
    expect(open.isOverdue).toBe(true);

    const done = await kanbanService.createCard(workspaceId, {
      columnId: columns[2].id,
      title: "Late but finished",
      dueDate: past,
    });
    expect(done.isOverdue).toBe(false);

    const future = await kanbanService.createCard(workspaceId, {
      columnId: columns[0].id,
      title: "Plenty of time",
      dueDate: new Date(Date.now() + 86_400_000),
    });
    expect(future.isOverdue).toBe(false);
  });
});
