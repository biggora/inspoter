// Thin fetch wrapper for the /api/workspaces routes (routes are backend-dev
// -owned, src/app/api/workspaces/**). Mirrors src/components/bookmarks/api.ts:
// mutation success is followed by `router.refresh()` from the calling
// component — no client-held copy of the workspace/member list beyond the
// dialog's own form state (Simplicity First).

import type { Workspace, WorkspaceMember } from "@/generated/prisma/client";
import {
  getActiveWorkspaceId,
  WORKSPACE_HEADER_NAME,
} from "@/lib/client/active-workspace";

export class ApiError extends Error {
  fieldErrors?: Record<string, string>;

  constructor(message: string, fieldErrors?: Record<string, string>) {
    super(message);
    this.name = "ApiError";
    this.fieldErrors = fieldErrors;
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
    try {
      const body = await res.json();
      if (typeof body?.error === "string") {
        message = body.error;
      } else if (Array.isArray(body?.error)) {
        // src/app/api/workspaces/**/route.ts 400 shape: { error: ZodIssue[] }.
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
    throw new ApiError(message, fieldErrors);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export interface AddMemberInput {
  username: string;
  password?: string;
}

export const workspacesApi = {
  list: () => request<Workspace[]>("/api/workspaces"),
  create: (name: string) =>
    request<Workspace>("/api/workspaces", {
      method: "POST",
      body: JSON.stringify({ name }),
    }),
  rename: (id: string, name: string) =>
    request<Workspace>(`/api/workspaces/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ name }),
    }),
  setSections: (id: string, hiddenSections: string[]) =>
    request<Workspace>(`/api/workspaces/${id}/sections`, {
      method: "PATCH",
      body: JSON.stringify({ hiddenSections }),
    }),
  switchTo: (workspaceId: string) =>
    request<{ ok: true }>("/api/workspaces/switch", {
      method: "POST",
      body: JSON.stringify({ workspaceId }),
    }),
  addMember: (workspaceId: string, input: AddMemberInput) =>
    request<WorkspaceMember>(`/api/workspaces/${workspaceId}/members`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  searchOperators: (workspaceId: string, query?: string) => {
    const params = query ? `?q=${encodeURIComponent(query)}` : "";
    return request<Array<{ id: string; username: string; email: string | null }>>(
      `/api/workspaces/${workspaceId}/members/search${params}`,
    );
  },
  removeMember: (workspaceId: string, memberId: string) =>
    request<void>(`/api/workspaces/${workspaceId}/members/${memberId}`, {
      method: "DELETE",
    }),
};
