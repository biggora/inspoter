// Thin fetch wrapper for the /api/notes/** routes, mirroring
// src/components/kanban/api.ts. Mutations re-fetch the layout's server
// component tree data via `router.refresh()` from the calling component —
// this module keeps no client-side copy of the tree.

import {
  getActiveWorkspaceId,
  WORKSPACE_HEADER_NAME,
} from "@/lib/client/active-workspace";
import type { NoteFolderNode } from "@/lib/services/note-folders";
import type { NoteDetail, NoteSummary } from "@/lib/services/notes";

export class ApiError extends Error {
  fieldErrors?: Record<string, string>;
  /** Machine-readable code ("NOTE_TITLE_CONFLICT", "RESOURCE_NOT_FOUND"…). */
  code?: string;
  /** Only set alongside code === "NOTE_TITLE_CONFLICT". */
  suggestedTitle?: string;
  /** Only set alongside code === "NOTE_VERSION_CONFLICT". */
  currentVersion?: number;

  constructor(
    message: string,
    options?: {
      fieldErrors?: Record<string, string>;
      code?: string;
      suggestedTitle?: string;
      currentVersion?: number;
    },
  ) {
    super(message);
    this.name = "ApiError";
    this.fieldErrors = options?.fieldErrors;
    this.code = options?.code;
    this.suggestedTitle = options?.suggestedTitle;
    this.currentVersion = options?.currentVersion;
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
    let suggestedTitle: string | undefined;
    let currentVersion: number | undefined;
    try {
      const body = await res.json();
      if (typeof body?.error === "string") {
        message = body.error;
        code = body.error;
        if (typeof body?.suggestedTitle === "string") {
          suggestedTitle = body.suggestedTitle;
        }
        if (typeof body?.currentVersion === "number") {
          currentVersion = body.currentVersion;
        }
      } else if (Array.isArray(body?.error)) {
        fieldErrors = {};
        for (const issue of body.error as ZodIssueLike[]) {
          const key = issue.path?.[0];
          if (typeof key === "string" && !fieldErrors[key]) {
            fieldErrors[key] = issue.message;
          }
        }
        message = (body.error as ZodIssueLike[])[0]?.message ?? message;
      }
    } catch {
      // Non-JSON error body — fall back to the generic message above.
    }
    throw new ApiError(message, {
      fieldErrors,
      code,
      suggestedTitle,
      currentVersion,
    });
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export interface NoteSearchParams {
  query?: string;
  folderId?: string;
  includeSubfolders?: boolean;
  sort?: "updatedAt" | "title";
  limit?: number;
  cursor?: string;
}

export interface NoteSearchResult {
  items: NoteSummary[];
  total: number;
  nextCursor: string | null;
}

export interface NoteTreeResponse {
  folders: NoteFolderNode[];
  notes: NoteSummary[];
}

function buildQuery(params: NoteSearchParams): string {
  const search = new URLSearchParams();
  if (params.query) search.set("query", params.query);
  if (params.folderId) search.set("folderId", params.folderId);
  if (params.includeSubfolders) search.set("includeSubfolders", "true");
  if (params.sort) search.set("sort", params.sort);
  if (params.limit) search.set("limit", String(params.limit));
  if (params.cursor) search.set("cursor", params.cursor);
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

export const notesApi = {
  search: (params: NoteSearchParams = {}) =>
    request<NoteSearchResult>(`/api/notes${buildQuery(params)}`),
  tree: () => request<NoteTreeResponse>("/api/notes/tree"),
  get: (id: string) => request<NoteDetail>(`/api/notes/${id}`),
  create: (input: {
    title: string;
    content?: string;
    folderId?: string | null;
  }) =>
    request<NoteDetail>("/api/notes", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  update: (
    id: string,
    input: { title?: string; content?: string; version: number },
  ) =>
    request<NoteDetail>(`/api/notes/${id}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
  remove: (id: string) => request(`/api/notes/${id}`, { method: "DELETE" }),
  move: (id: string, folderId: string | null) =>
    request<NoteSummary>(`/api/notes/${id}/move`, {
      method: "PATCH",
      body: JSON.stringify({ folderId }),
    }),
};

export const noteFoldersApi = {
  create: (input: { name: string; parentFolderId?: string | null }) =>
    request<NoteFolderNode>("/api/notes/folders", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  update: (
    id: string,
    input: { name?: string; parentFolderId?: string | null },
  ) =>
    request<NoteFolderNode>(`/api/notes/folders/${id}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
  remove: (id: string) =>
    request(`/api/notes/folders/${id}`, { method: "DELETE" }),
};
