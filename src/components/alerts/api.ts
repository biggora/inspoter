// Thin fetch wrappers for the /api/alerts and /api/alert-categories routes
// (backend-dev-owned, src/app/api/{alerts,alert-categories}/**). Mirrors
// src/components/logs/api.ts: JSON-serialized entries have `timestamp` as an
// ISO string, hence dedicated DTOs rather than reusing generated Prisma
// types.

export interface AlertCategoryDto {
  id: string;
  name: string;
}

export interface AlertDto {
  id: string;
  alertCategoryId: string | null;
  alertCategory: AlertCategoryDto | null;
  severity: string;
  source: string;
  message: string;
  timestamp: string;
}

export interface FetchAlertsParams {
  cursor?: string;
  categoryId?: string;
  severity?: string;
  query?: string;
  sort?: "asc" | "desc";
}

export interface FetchAlertsResult {
  items: AlertDto[];
  nextCursor: string | null;
}

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

export function fetchAlerts(
  params: FetchAlertsParams,
): Promise<FetchAlertsResult> {
  const searchParams = new URLSearchParams();
  if (params.cursor) searchParams.set("cursor", params.cursor);
  if (params.categoryId) searchParams.set("categoryId", params.categoryId);
  if (params.severity) searchParams.set("severity", params.severity);
  if (params.query) searchParams.set("query", params.query);
  if (params.sort) searchParams.set("sort", params.sort);
  return request(`/api/alerts?${searchParams}`);
}

export const alertCategoriesApi = {
  list: () => request<AlertCategoryDto[]>("/api/alert-categories"),
  create: (name: string) =>
    request<AlertCategoryDto>("/api/alert-categories", {
      method: "POST",
      body: JSON.stringify({ name }),
    }),
  rename: (id: string, name: string) =>
    request<AlertCategoryDto>(`/api/alert-categories/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ name }),
    }),
  remove: (id: string) =>
    request<void>(`/api/alert-categories/${id}`, { method: "DELETE" }),
};
