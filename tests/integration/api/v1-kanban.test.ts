import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import * as webhookTokensService from "@/lib/services/webhookTokens";
import {
  GET as listBoards,
  POST as createBoard,
} from "@/app/api/v1/kanban/boards/route";
import {
  GET as getBoard,
  PATCH as renameBoard,
} from "@/app/api/v1/kanban/boards/[boardId]/route";
import { PATCH as reorderBoards } from "@/app/api/v1/kanban/boards/reorder/route";
import { POST as createColumn } from "@/app/api/v1/kanban/columns/route";
import { PATCH as updateColumn } from "@/app/api/v1/kanban/columns/[columnId]/route";
import { PATCH as reorderColumns } from "@/app/api/v1/kanban/columns/reorder/route";
import {
  GET as searchCards,
  POST as createCard,
} from "@/app/api/v1/kanban/cards/route";
import { PATCH as moveCards } from "@/app/api/v1/kanban/cards/move/route";
import {
  DELETE as deleteCard,
  GET as getCard,
  PATCH as updateCard,
} from "@/app/api/v1/kanban/cards/[cardId]/route";
import { PUT as setCardLabels } from "@/app/api/v1/kanban/cards/[cardId]/labels/route";
import {
  GET as listChecklist,
  POST as addChecklistItem,
} from "@/app/api/v1/kanban/cards/[cardId]/checklist/route";
import {
  DELETE as deleteChecklistItem,
  PATCH as updateChecklistItem,
} from "@/app/api/v1/kanban/checklist/[itemId]/route";
import {
  GET as listComments,
  POST as addComment,
} from "@/app/api/v1/kanban/cards/[cardId]/comments/route";
import { DELETE as deleteComment } from "@/app/api/v1/kanban/comments/[commentId]/route";
import {
  GET as listLabels,
  POST as createLabel,
} from "@/app/api/v1/kanban/labels/route";
import {
  DELETE as deleteLabel,
  PATCH as updateLabel,
} from "@/app/api/v1/kanban/labels/[labelId]/route";
import { GET as listLinkTargets } from "@/app/api/v1/kanban/link-targets/route";

// /api/v1/kanban/** end-to-end: the bearer token is the only authority, it
// carries the workspace, and the scope decides read from write. No session
// cookie and no X-Inspoter-Workspace header are involved anywhere here.

const PREFIX = `v1-kanban-${randomUUID()}`;

let workspaceId: string;
let otherWorkspaceId: string;
let writeToken: string;
let readToken: string;
let otherWorkspaceToken: string;
let boardId: string;
let todoColumnId: string;
let doneColumnId: string;

function request(
  path: string,
  init: { method?: string; token?: string | null; body?: unknown } = {},
): NextRequest {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (init.token) headers.set("Authorization", `Bearer ${init.token}`);
  return new NextRequest(`http://localhost${path}`, {
    method: init.method ?? "GET",
    headers,
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
  });
}

function params<T extends Record<string, string>>(value: T) {
  return { params: Promise.resolve(value) };
}

async function body<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

async function newBoard(name: string) {
  const response = await createBoard(
    request("/api/v1/kanban/boards", {
      method: "POST",
      token: writeToken,
      body: { name },
    }),
  );
  return (await body<{ id: string }>(response)).id;
}

async function newColumn(board: string, name: string, isDone = false) {
  const response = await createColumn(
    request("/api/v1/kanban/columns", {
      method: "POST",
      token: writeToken,
      body: { boardId: board, name, color: "BLUE", isDone },
    }),
  );
  return (await body<{ id: string }>(response)).id;
}

async function newCard(column: string, title: string) {
  const response = await createCard(
    request("/api/v1/kanban/cards", {
      method: "POST",
      token: writeToken,
      body: { columnId: column, title },
    }),
  );
  return (await body<{ id: string }>(response)).id;
}

beforeAll(async () => {
  const [workspace, otherWorkspace] = await Promise.all([
    db.workspace.create({
      data: { name: `${PREFIX}-workspace`, slug: `${PREFIX}-workspace` },
    }),
    db.workspace.create({
      data: { name: `${PREFIX}-other`, slug: `${PREFIX}-other` },
    }),
  ]);
  workspaceId = workspace.id;
  otherWorkspaceId = otherWorkspace.id;

  writeToken = (
    await webhookTokensService.create(workspaceId, "agent", [
      "kanban:read",
      "kanban:write",
    ])
  ).token;
  readToken = (
    await webhookTokensService.create(workspaceId, "agent-ro", ["kanban:read"])
  ).token;
  otherWorkspaceToken = (
    await webhookTokensService.create(otherWorkspaceId, "other", [
      "kanban:read",
      "kanban:write",
    ])
  ).token;

  boardId = await newBoard(`${PREFIX}-board`);
  todoColumnId = await newColumn(boardId, "Todo");
  doneColumnId = await newColumn(boardId, "Done", true);
});

afterAll(async () => {
  await Promise.all([
    db.workspace.delete({ where: { id: workspaceId } }).catch(() => {}),
    db.workspace.delete({ where: { id: otherWorkspaceId } }).catch(() => {}),
  ]);
});

describe("authentication and scopes", () => {
  it("rejects a request with no Authorization header", async () => {
    const response = await listBoards(request("/api/v1/kanban/boards"));

    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toContain("Bearer");
  });

  it("rejects a read-only token on a write operation", async () => {
    const response = await createBoard(
      request("/api/v1/kanban/boards", {
        method: "POST",
        token: readToken,
        body: { name: "Should not exist" },
      }),
    );

    expect(response.status).toBe(403);
    expect(
      await db.kanbanBoard.count({ where: { name: "Should not exist" } }),
    ).toBe(0);
  });
});

describe("boards and columns", () => {
  it("lists boards, reads one in full and renames it", async () => {
    const listed = await listBoards(
      request("/api/v1/kanban/boards", { token: readToken }),
    );
    expect(
      (await body<Array<{ id: string }>>(listed)).map((entry) => entry.id),
    ).toContain(boardId);

    const detail = await getBoard(
      request(`/api/v1/kanban/boards/${boardId}`, { token: readToken }),
      params({ boardId }),
    );
    expect(detail.status).toBe(200);
    const board = await body<{ columns: Array<{ id: string }> }>(detail);
    expect(board.columns.map((column) => column.id)).toEqual([
      todoColumnId,
      doneColumnId,
    ]);

    const renamed = await renameBoard(
      request(`/api/v1/kanban/boards/${boardId}`, {
        method: "PATCH",
        token: writeToken,
        body: { name: `${PREFIX}-renamed` },
      }),
      params({ boardId }),
    );
    expect(await body<{ name: string }>(renamed)).toMatchObject({
      name: `${PREFIX}-renamed`,
    });
  });

  it("updates a column and reorders the board's columns", async () => {
    const updated = await updateColumn(
      request(`/api/v1/kanban/columns/${todoColumnId}`, {
        method: "PATCH",
        token: writeToken,
        body: { name: "Backlog", wipLimit: 5 },
      }),
      params({ columnId: todoColumnId }),
    );
    expect(
      await body<{ name: string; wipLimit: number }>(updated),
    ).toMatchObject({ name: "Backlog", wipLimit: 5 });

    const reordered = await reorderColumns(
      request("/api/v1/kanban/columns/reorder", {
        method: "PATCH",
        token: writeToken,
        body: { boardId, order: [doneColumnId, todoColumnId] },
      }),
    );
    expect(await body(reordered)).toEqual({ reordered: true });
    const columns = await db.kanbanColumn.findMany({
      where: { boardId },
      orderBy: { position: "asc" },
      select: { id: true },
    });
    expect(columns.map((entry) => entry.id)).toEqual([
      doneColumnId,
      todoColumnId,
    ]);

    // Put the board back the way the other tests expect it.
    await reorderColumns(
      request("/api/v1/kanban/columns/reorder", {
        method: "PATCH",
        token: writeToken,
        body: { boardId, order: [todoColumnId, doneColumnId] },
      }),
    );
  });

  it("reorders boards", async () => {
    const second = await newBoard(`${PREFIX}-second`);

    const response = await reorderBoards(
      request("/api/v1/kanban/boards/reorder", {
        method: "PATCH",
        token: writeToken,
        body: { order: [second, boardId] },
      }),
    );

    expect(await body(response)).toEqual({ reordered: true });
    const boards = await db.kanbanBoard.findMany({
      where: { id: { in: [second, boardId] } },
      orderBy: { position: "asc" },
      select: { id: true },
    });
    expect(boards.map((entry) => entry.id)).toEqual([second, boardId]);
  });

  it("answers 404 for a board of another workspace", async () => {
    const response = await getBoard(
      request(`/api/v1/kanban/boards/${boardId}`, {
        token: otherWorkspaceToken,
      }),
      params({ boardId }),
    );

    expect(response.status).toBe(404);
    expect(await body<{ error: { code: string } }>(response)).toMatchObject({
      error: { code: "NOT_FOUND" },
    });
  });
});

describe("cards", () => {
  it("creates, searches, updates, moves and deletes a card", async () => {
    const cardId = await newCard(todoColumnId, `${PREFIX}-card`);

    const found = await searchCards(
      request(`/api/v1/kanban/cards?query=${PREFIX}-card`, {
        token: readToken,
      }),
    );
    const page = await body<{
      items: Array<{ id: string; columnName: string }>;
      total: number;
    }>(found);
    expect(page.total).toBe(1);
    expect(page.items[0].id).toBe(cardId);

    const updated = await updateCard(
      request(`/api/v1/kanban/cards/${cardId}`, {
        method: "PATCH",
        token: writeToken,
        body: { priority: "URGENT" },
      }),
      params({ cardId }),
    );
    expect(await body<{ priority: string }>(updated)).toMatchObject({
      priority: "URGENT",
    });

    // Moving into a terminal column completes the card.
    const moved = await moveCards(
      request("/api/v1/kanban/cards/move", {
        method: "PATCH",
        token: writeToken,
        body: {
          boardId,
          columns: [
            { columnId: todoColumnId, cardIds: [] },
            { columnId: doneColumnId, cardIds: [cardId] },
          ],
        },
      }),
    );
    expect(
      await body<{ moved: Array<{ completed: boolean }> }>(moved),
    ).toMatchObject({ moved: [{ cardId, completed: true }] });
    expect(
      (await db.kanbanCard.findUnique({ where: { id: cardId } }))?.completedAt,
    ).not.toBeNull();

    const removed = await deleteCard(
      request(`/api/v1/kanban/cards/${cardId}`, {
        method: "DELETE",
        token: writeToken,
      }),
      params({ cardId }),
    );
    expect(await body(removed)).toEqual({ deleted: cardId });

    const activity = await db.activity.findMany({
      where: { workspaceId, entityType: "kanban_card", entityId: cardId },
      select: { action: true, operatorName: true },
    });
    expect(activity.map((entry) => entry.action).sort()).toEqual([
      "create",
      "delete",
      "move",
      "update",
    ]);
    expect(new Set(activity.map((entry) => entry.operatorName))).toEqual(
      new Set(["agent"]),
    );
  });

  it("rejects a card carrying half a link", async () => {
    const response = await createCard(
      request("/api/v1/kanban/cards", {
        method: "POST",
        token: writeToken,
        body: {
          columnId: todoColumnId,
          title: `${PREFIX}-half-link`,
          linkedType: "SERVICE",
        },
      }),
    );

    expect(response.status).toBe(400);
    expect(
      await db.kanbanCard.count({ where: { title: `${PREFIX}-half-link` } }),
    ).toBe(0);
  });

  it("replaces a card's labels wholesale", async () => {
    const cardId = await newCard(todoColumnId, `${PREFIX}-labelled`);
    const created = await createLabel(
      request("/api/v1/kanban/labels", {
        method: "POST",
        token: writeToken,
        body: { name: `${PREFIX}-ops`, color: "AMBER" },
      }),
    );
    expect(created.status).toBe(201);
    const labelId = (await body<{ id: string }>(created)).id;

    const applied = await setCardLabels(
      request(`/api/v1/kanban/cards/${cardId}/labels`, {
        method: "PUT",
        token: writeToken,
        body: { labelIds: [labelId] },
      }),
      params({ cardId }),
    );
    expect(
      (await body<{ labels: Array<{ id: string }> }>(applied)).labels,
    ).toEqual([expect.objectContaining({ id: labelId })]);

    const cleared = await setCardLabels(
      request(`/api/v1/kanban/cards/${cardId}/labels`, {
        method: "PUT",
        token: writeToken,
        body: { labelIds: [] },
      }),
      params({ cardId }),
    );
    expect((await body<{ labels: unknown[] }>(cleared)).labels).toEqual([]);

    const listed = await listLabels(
      request("/api/v1/kanban/labels", { token: readToken }),
    );
    expect(
      (await body<Array<{ id: string }>>(listed)).map((entry) => entry.id),
    ).toContain(labelId);

    const renamed = await updateLabel(
      request(`/api/v1/kanban/labels/${labelId}`, {
        method: "PATCH",
        token: writeToken,
        body: { color: "GREEN" },
      }),
      params({ labelId }),
    );
    expect(await body<{ color: string }>(renamed)).toMatchObject({
      color: "GREEN",
    });

    const removed = await deleteLabel(
      request(`/api/v1/kanban/labels/${labelId}`, {
        method: "DELETE",
        token: writeToken,
      }),
      params({ labelId }),
    );
    expect(await body(removed)).toEqual({ deleted: labelId });
  });

  it("answers 404 for a card of another workspace", async () => {
    const cardId = await newCard(todoColumnId, `${PREFIX}-private`);

    const response = await getCard(
      request(`/api/v1/kanban/cards/${cardId}`, {
        token: otherWorkspaceToken,
      }),
      params({ cardId }),
    );

    expect(response.status).toBe(404);
    expect(await db.kanbanCard.findUnique({ where: { id: cardId } })).not.toBe(
      null,
    );
  });
});

describe("checklist and comments", () => {
  it("keeps a checklist on a card", async () => {
    const cardId = await newCard(todoColumnId, `${PREFIX}-checklist`);

    const added = await addChecklistItem(
      request(`/api/v1/kanban/cards/${cardId}/checklist`, {
        method: "POST",
        token: writeToken,
        body: { text: "Tag the release" },
      }),
      params({ cardId }),
    );
    expect(added.status).toBe(201);
    const itemId = (await body<{ id: string }>(added)).id;

    const ticked = await updateChecklistItem(
      request(`/api/v1/kanban/checklist/${itemId}`, {
        method: "PATCH",
        token: writeToken,
        body: { isDone: true },
      }),
      params({ itemId }),
    );
    expect(await body<{ isDone: boolean }>(ticked)).toMatchObject({
      isDone: true,
    });

    const listed = await listChecklist(
      request(`/api/v1/kanban/cards/${cardId}/checklist`, {
        token: readToken,
      }),
      params({ cardId }),
    );
    expect(await body<unknown[]>(listed)).toHaveLength(1);

    const removed = await deleteChecklistItem(
      request(`/api/v1/kanban/checklist/${itemId}`, {
        method: "DELETE",
        token: writeToken,
      }),
      params({ itemId }),
    );
    expect(await body(removed)).toEqual({ deleted: itemId });
  });

  it("attributes a comment to the token and lets only that token remove it", async () => {
    const cardId = await newCard(todoColumnId, `${PREFIX}-commented`);

    const added = await addComment(
      request(`/api/v1/kanban/cards/${cardId}/comments`, {
        method: "POST",
        token: writeToken,
        body: { body: "Blocked on the migration." },
      }),
      params({ cardId }),
    );
    expect(added.status).toBe(201);
    const comment = await body<{ id: string; authorName: string }>(added);
    expect(comment.authorName).toBe("agent");

    const listed = await listComments(
      request(`/api/v1/kanban/cards/${cardId}/comments`, { token: readToken }),
      params({ cardId }),
    );
    expect(await body<unknown[]>(listed)).toHaveLength(1);

    // A comment written by someone else is invisible to this token's delete.
    const foreign = await db.kanbanComment.create({
      data: {
        workspaceId,
        cardId,
        cardWorkspaceId: workspaceId,
        authorOperatorId: "some-operator",
        authorName: "Operator",
        body: "Written by a person.",
      },
    });
    const refused = await deleteComment(
      request(`/api/v1/kanban/comments/${foreign.id}`, {
        method: "DELETE",
        token: writeToken,
      }),
      params({ commentId: foreign.id }),
    );
    expect(refused.status).toBe(404);
    expect(
      await db.kanbanComment.findUnique({ where: { id: foreign.id } }),
    ).not.toBe(null);

    const removed = await deleteComment(
      request(`/api/v1/kanban/comments/${comment.id}`, {
        method: "DELETE",
        token: writeToken,
      }),
      params({ commentId: comment.id }),
    );
    expect(await body(removed)).toEqual({ deleted: comment.id });
  });
});

describe("link targets", () => {
  it("answers the linkable records grouped by type", async () => {
    const response = await listLinkTargets(
      request("/api/v1/kanban/link-targets", { token: readToken }),
    );

    expect(response.status).toBe(200);
    expect(Object.keys(await body<Record<string, unknown>>(response))).toEqual(
      expect.arrayContaining(["SERVER", "SERVICE", "ALERT"]),
    );
  });
});
