// Thin fetch wrapper for the /api/dashboards routes, following the same shape
// as every other section's api.ts (src/components/bookmarks/api.ts). Mutations
// end in `router.refresh()` at the call site — the only client-held copy of
// server state is the optimistic layout during a drag.

import {
  getActiveWorkspaceId,
  WORKSPACE_HEADER_NAME,
} from "@/lib/client/active-workspace";
import type { Dashboard, DashboardWidget } from "@/generated/prisma/client";
import type { GridItem } from "@/lib/dashboards/grid";
import type { WidgetDataMap } from "@/lib/dashboards/widget-payloads";

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
      if (typeof body?.message === "string") {
        message = body.message;
      } else if (typeof body?.error === "string") {
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

export const dashboardsApi = {
  create: (name: string) =>
    request<Dashboard>("/api/dashboards", {
      method: "POST",
      body: JSON.stringify({ name }),
    }),
  rename: (id: string, name: string) =>
    request<Dashboard>(`/api/dashboards/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ name }),
    }),
  setDefault: (id: string) =>
    request<Dashboard>(`/api/dashboards/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ isDefault: true }),
    }),
  remove: (id: string) =>
    request<void>(`/api/dashboards/${id}`, { method: "DELETE" }),
  saveLayout: (id: string, items: GridItem[]) =>
    request<void>(`/api/dashboards/${id}/layout`, {
      method: "PATCH",
      body: JSON.stringify({ items }),
    }),
  fetchData: (id: string) =>
    request<{ widgetData: WidgetDataMap }>(`/api/dashboards/${id}/data`),
};

export const widgetsApi = {
  add: (dashboardId: string, kind: string, config?: unknown) =>
    request<DashboardWidget>(`/api/dashboards/${dashboardId}/widgets`, {
      method: "POST",
      body: JSON.stringify({
        kind,
        ...(config === undefined ? {} : { config }),
      }),
    }),
  updateConfig: (dashboardId: string, widgetId: string, config: unknown) =>
    request<DashboardWidget>(
      `/api/dashboards/${dashboardId}/widgets/${widgetId}`,
      { method: "PATCH", body: JSON.stringify({ config }) },
    ),
  remove: (dashboardId: string, widgetId: string) =>
    request<void>(`/api/dashboards/${dashboardId}/widgets/${widgetId}`, {
      method: "DELETE",
    }),
};
