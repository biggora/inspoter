// Thin fetch wrappers for the /api/alerts and /api/alert-categories routes
// (backend-dev-owned, src/app/api/{alerts,alert-categories}/**). Mirrors
// src/components/logs/api.ts: JSON-serialized entries have `timestamp` as an
// ISO string, hence dedicated DTOs rather than reusing generated Prisma
// types.

import {
  getActiveWorkspaceId,
  WORKSPACE_HEADER_NAME,
} from "@/lib/client/active-workspace";

export interface AlertCategoryDto {
  id: string;
  name: string;
  /**
   * Set on the categories Inspoter creates for its own alerts; `name` then
   * holds the English base wording and the UI renders the translation instead.
   * See categoryLabel() in alerts-view.tsx.
   */
  systemKey: string | null;
}

/** Mirrors AlertCategorySource in prisma/schema.prisma. */
export type AlertCategorySourceDto = "WEBHOOK" | "MANUAL" | "RULE" | "MODEL";

export interface AlertDto {
  id: string;
  alertCategoryId: string | null;
  alertCategory: AlertCategoryDto | null;
  categorySource: AlertCategorySourceDto | null;
  severity: string;
  source: string;
  /** Always the English base rendering — see Alert.message in the schema. */
  message: string;
  /** `alerts.system.*` key behind `message`, null for webhook-sent alerts. */
  messageKey: string | null;
  messageParams: Record<string, string | number> | null;
  timestamp: string;
}

/** Sentinel accepted by the list filter, meaning "has no category". */
export const UNCATEGORIZED_FILTER = "none";

export interface FetchAlertsParams {
  cursor?: string;
  categoryId?: string;
  severity?: string;
  query?: string;
  sort?: "asc" | "desc";
  date?: string;
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
  if (params.date) searchParams.set("date", params.date);
  return request(`/api/alerts?${searchParams}`);
}

export const alertsApi = {
  setCategory: (id: string, alertCategoryId: string | null) =>
    request<AlertDto>(`/api/alerts/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ alertCategoryId }),
    }),
  remove: (id: string) =>
    request<void>(`/api/alerts/${id}`, { method: "DELETE" }),
  setCategoryBulk: (ids: string[], alertCategoryId: string | null) =>
    request<{ updated: number }>("/api/alerts/bulk", {
      method: "POST",
      body: JSON.stringify({ ids, alertCategoryId }),
    }),
  markAllRead: () =>
    request<{ updated: number }>("/api/alerts/read-all", { method: "POST" }),
};

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
