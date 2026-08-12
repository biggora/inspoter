// Thin fetch wrapper for the /api/kanban/** routes, mirroring
// src/components/bookmarks/api.ts. Mutations re-fetch the page's server
// component data via `router.refresh()` from the calling component — the board
// keeps no client-side copy beyond the optimistic drag state.

import {
  getActiveWorkspaceId,
  WORKSPACE_HEADER_NAME,
} from "@/lib/client/active-workspace";
import type { LabelColor } from "@/lib/label-color";
import type {
  KanbanBoardDetail,
  KanbanBoardSummary,
  KanbanCardDetail,
} from "@/lib/services/kanban";
import type { KanbanLabelListItem } from "@/lib/services/kanban-labels";
import type { KanbanLinkTargets } from "@/lib/services/kanban-link-targets";

export class ApiError extends Error {
  fieldErrors?: Record<string, string>;
  /** Machine-readable code for the label routes ("LABEL_NAME_CONFLICT"…). */
  code?: string;

  constructor(
    message: string,
    fieldErrors?: Record<string, string>,
    code?: string,
  ) {
    super(message);
    this.name = "ApiError";
    this.fieldErrors = fieldErrors;
    this.code = code;
  }
}

interface ZodIssueLike {
  path?: Array<string | number>;
  message: string;
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      [WORKSPACE_HEADER_NAME]: getActiveWorkspaceId() ?? "",
      ...(init?.headers ?? {}),
    },
  });

  if (!res.ok) {
    let message = "Something went wrong. Try again.";
    let fieldErrors: Record<string, string> | undefined;
    let code: string | undefined;
    try {
      const body = await res.json();
      if (typeof body?.error === "string") {
        message = body.error;
        code = body.error;
      } else if (Array.isArray(body?.error)) {
        fieldErrors = {};
        for (const issue of body.error as ZodIssueLike[]) {
          const key = issue.path?.[0];
          if (typeof key === "string" && !fieldErrors[key]) {
            fieldErrors[key] = issue.message;
          }
        }
        message = (body.error as ZodIssueLike[])[0]?.message ?? message;
        code = message;
      }
    } catch {
      // Non-JSON error body — fall back to the generic message above.
    }
    throw new ApiError(message, fieldErrors, code);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export interface CardInput {
  columnId?: string;
  title?: string;
  description?: string | null;
  priority?: string;
  dueDate?: string | null;
  assigneeOperatorId?: string | null;
  labelIds?: string[];
  linkedType?: string | null;
  linkedId?: string | null;
  linkedLabel?: string | null;
}

export interface ColumnInput {
  boardId?: string;
  name?: string;
  color?: LabelColor;
  wipLimit?: number | null;
  isDone?: boolean;
}

export const boardsApi = {
  list: () => request<KanbanBoardSummary[]>("/api/kanban/boards"),
  get: (id: string) => request<KanbanBoardDetail>(`/api/kanban/boards/${id}`),
  create: (name: string) =>
    request<{ id: string }>("/api/kanban/boards", {
      method: "POST",
      body: JSON.stringify({ name }),
    }),
  rename: (id: string, name: string) =>
    request(`/api/kanban/boards/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ name }),
    }),
  remove: (id: string) =>
    request(`/api/kanban/boards/${id}`, { method: "DELETE" }),
  reorder: (order: string[]) =>
    request("/api/kanban/boards/reorder", {
      method: "PATCH",
      body: JSON.stringify({ order }),
    }),
};

export const columnsApi = {
  create: (input: ColumnInput) =>
    request("/api/kanban/columns", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  update: (id: string, input: ColumnInput) =>
    request(`/api/kanban/columns/${id}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
  remove: (id: string) =>
    request(`/api/kanban/columns/${id}`, { method: "DELETE" }),
  reorder: (boardId: string, order: string[]) =>
    request("/api/kanban/columns/reorder", {
      method: "PATCH",
      body: JSON.stringify({ boardId, order }),
    }),
};

export const cardsApi = {
  get: (id: string) => request<KanbanCardDetail>(`/api/kanban/cards/${id}`),
  create: (input: CardInput) =>
    request<KanbanCardDetail>("/api/kanban/cards", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  update: (id: string, input: CardInput) =>
    request<KanbanCardDetail>(`/api/kanban/cards/${id}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
  remove: (id: string) =>
    request(`/api/kanban/cards/${id}`, { method: "DELETE" }),
  // Post-drop card order of the affected columns (at most two: source and
  // destination), matching the PATCH /api/kanban/cards/move contract 1:1.
  move: (boardId: string, columns: { columnId: string; cardIds: string[] }[]) =>
    request("/api/kanban/cards/move", {
      method: "PATCH",
      body: JSON.stringify({ boardId, columns }),
    }),
  setLabels: (id: string, labelIds: string[]) =>
    request<KanbanCardDetail>(`/api/kanban/cards/${id}/labels`, {
      method: "PUT",
      body: JSON.stringify({ labelIds }),
    }),
};

export interface ChecklistItemDto {
  id: string;
  text: string;
  isDone: boolean;
  position: number;
}

export const checklistApi = {
  list: (cardId: string) =>
    request<ChecklistItemDto[]>(`/api/kanban/cards/${cardId}/checklist`),
  add: (cardId: string, text: string) =>
    request<ChecklistItemDto>(`/api/kanban/cards/${cardId}/checklist`, {
      method: "POST",
      body: JSON.stringify({ text }),
    }),
  update: (id: string, input: { text?: string; isDone?: boolean }) =>
    request<ChecklistItemDto>(`/api/kanban/checklist/${id}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
  remove: (id: string) =>
    request(`/api/kanban/checklist/${id}`, { method: "DELETE" }),
};

export interface CommentDto {
  id: string;
  authorOperatorId: string;
  authorName: string;
  body: string;
  createdAt: string;
}

export const commentsApi = {
  list: (cardId: string) =>
    request<CommentDto[]>(`/api/kanban/cards/${cardId}/comments`),
  add: (cardId: string, body: string) =>
    request<CommentDto>(`/api/kanban/cards/${cardId}/comments`, {
      method: "POST",
      body: JSON.stringify({ body }),
    }),
  remove: (id: string) =>
    request(`/api/kanban/comments/${id}`, { method: "DELETE" }),
};

export const kanbanLabelsApi = {
  list: () => request<KanbanLabelListItem[]>("/api/kanban/labels"),
  create: (name: string, color: LabelColor) =>
    request("/api/kanban/labels", {
      method: "POST",
      body: JSON.stringify({ name, color }),
    }),
  update: (id: string, input: { name?: string; color?: LabelColor }) =>
    request(`/api/kanban/labels/${id}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
  remove: (id: string) =>
    request(`/api/kanban/labels/${id}`, { method: "DELETE" }),
};

export const linkTargetsApi = {
  list: () => request<KanbanLinkTargets>("/api/kanban/link-targets"),
};
