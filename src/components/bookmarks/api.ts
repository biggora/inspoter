// Thin fetch wrapper for the /api/{categories,bookmarks} routes (frozen
// contract, plan.md §5.1; routes are backend-dev-owned, src/app/api/**).
// Mutation success re-fetches the Bookmarks server component's data via
// `router.refresh()` from the calling dialog — no client-held copy of the
// category/bookmark list (Simplicity First: no state management beyond
// useState).

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
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
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
  description: string | null;
  categoryId: string;
}

export const categoriesApi = {
  create: (name: string) =>
    request("/api/categories", {
      method: "POST",
      body: JSON.stringify({ name }),
    }),
  rename: (id: string, name: string) =>
    request(`/api/categories/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ name }),
    }),
  remove: (id: string) =>
    request(`/api/categories/${id}`, { method: "DELETE" }),
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
};
