// Thin fetch wrapper for the /api/{categories,bookmarks} routes (frozen
// contract, plan.md §5.1; routes are backend-dev-owned, src/app/api/**).
// Mutation success re-fetches the Bookmarks server component's data via
// `router.refresh()` from the calling dialog — no client-held copy of the
// category/bookmark list (Simplicity First: no state management beyond
// useState).

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
        // src/app/api/{categories,bookmarks}/**/route.ts 400 shape:
        // { error: ZodIssue[] } (plan.md §5.1).
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

export interface BookmarkInput {
  name: string;
  url: string;
  icon: string | null;
  color: string | null;
  description: string | null;
  categoryId: string;
}

export const categoriesApi = {
  // Phase 4: `parentCategoryId` is optional (omitted/null = top-level).
  // `null` on rename explicitly clears an existing parent (promotes the
  // category back to top-level) — see renameCategory in bookmarks.ts.
  create: (name: string, parentCategoryId: string | null = null) =>
    request("/api/categories", {
      method: "POST",
      body: JSON.stringify({ name, parentCategoryId }),
    }),
  rename: (id: string, name: string, parentCategoryId: string | null = null) =>
    request(`/api/categories/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ name, parentCategoryId }),
    }),
  remove: (id: string) =>
    request(`/api/categories/${id}`, { method: "DELETE" }),
  reorder: (order: string[]) =>
    request("/api/categories/reorder", {
      method: "PATCH",
      body: JSON.stringify({ order }),
    }),
};

export const bookmarksApi = {
  create: (input: BookmarkInput) =>
    request("/api/bookmarks", { method: "POST", body: JSON.stringify(input) }),
  update: (id: string, input: BookmarkInput) =>
    request(`/api/bookmarks/${id}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
  remove: (id: string) => request(`/api/bookmarks/${id}`, { method: "DELETE" }),
  reorder: (categories: { categoryId: string; bookmarkIds: string[] }[]) =>
    request("/api/bookmarks/reorder", {
      method: "PATCH",
      body: JSON.stringify({ categories }),
    }),
};

export const bookmarkFaviconApi = {
  suggest: (url: string) =>
    request<{ icon: string | null }>(
      `/api/bookmarks/favicon-suggest?url=${encodeURIComponent(url)}`,
    ),
};
