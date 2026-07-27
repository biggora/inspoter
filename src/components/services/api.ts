// Thin fetch wrapper for the /api/services routes (backend-dev-owned,
// src/app/api/services/**), matching src/components/bookmarks/api.ts's
// shape exactly: X-Inspoter-Workspace header via getActiveWorkspaceId(),
// non-2xx JSON error bodies (including zod ZodIssue[] arrays) normalized
// into ApiError with field-level errors.

import {
  getActiveWorkspaceId,
  WORKSPACE_HEADER_NAME,
} from "@/lib/client/active-workspace";
import type { LabelColor } from "@/lib/label-color";

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
        // src/app/api/services/**/route.ts 400 shape: { error: ZodIssue[] }.
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

export type MonitorTypeValue = "HTTP" | "TCP" | "PING";
export type ServiceStatusValue = "PENDING" | "UP" | "DOWN";

// Mirrors src/lib/services/services.ts's Service shape, but with Date
// fields as ISO strings — these DTOs come back through fetch().json(),
// unlike the Service/ServiceCheck props a server component passes straight
// from Prisma (which keep real Date instances across the RSC boundary).
export interface ServiceDto {
  id: string;
  workspaceId: string;
  name: string;
  description: string | null;
  monitorType: MonitorTypeValue;
  url: string | null;
  host: string | null;
  port: number | null;
  expectedStatusCodes: string | null;
  intervalSeconds: number;
  timeoutMs: number;
  retries: number;
  isActive: boolean;
  currentStatus: ServiceStatusValue;
  consecutiveFailures: number;
  lastCheckedAt: string | null;
  lastResponseTimeMs: number | null;
  lastMessage: string | null;
  nextCheckAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface ServiceLabelDto {
  id: string;
  name: string;
  color: LabelColor;
}

export interface ServiceLabelListItemDto extends ServiceLabelDto {
  serviceCount: number;
}

export type ServiceWithLabelsDto = ServiceDto & {
  labels: ServiceLabelDto[];
};

export interface ServiceLabelInput {
  name: string;
  color: LabelColor;
}

export interface ServiceCheckDto {
  id: string;
  workspaceId: string;
  serviceId: string;
  serviceWorkspaceId: string;
  status: "UP" | "DOWN";
  responseTimeMs: number | null;
  message: string | null;
  checkedAt: string;
  createdAt: string;
}

export interface ServiceInput {
  name: string;
  description?: string | null;
  monitorType: MonitorTypeValue;
  url?: string;
  host?: string;
  port?: number;
  expectedStatusCodes?: string;
  intervalSeconds?: number;
  timeoutMs?: number;
  retries?: number;
  isActive?: boolean;
  labelIds?: string[];
}

export interface ListServiceChecksResult {
  items: ServiceCheckDto[];
  nextCursor: string | null;
}

export const servicesApi = {
  list: (): Promise<ServiceWithLabelsDto[]> => request("/api/services"),
  get: (id: string): Promise<ServiceWithLabelsDto> =>
    request(`/api/services/${id}`),
  create: (input: ServiceInput): Promise<ServiceWithLabelsDto> =>
    request("/api/services", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  update: (id: string, input: ServiceInput): Promise<ServiceWithLabelsDto> =>
    request(`/api/services/${id}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
  remove: (id: string): Promise<void> =>
    request(`/api/services/${id}`, { method: "DELETE" }),
  checkNow: (id: string): Promise<ServiceDto> =>
    request(`/api/services/${id}/check-now`, { method: "POST" }),
  // Pause/resume the scheduled checks. Its own method rather than update():
  // ServiceInput requires name and monitorType, and the whole point here is
  // to send isActive on its own — serviceUpdateSchema accepts the partial
  // payload and services.ts's update() leaves every other column alone.
  setActive: (id: string, isActive: boolean): Promise<ServiceWithLabelsDto> =>
    request(`/api/services/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ isActive }),
    }),
  listChecks: (
    id: string,
    params?: { cursor?: string; pageSize?: number },
  ): Promise<ListServiceChecksResult> => {
    const search = new URLSearchParams();
    if (params?.cursor) search.set("cursor", params.cursor);
    if (params?.pageSize) search.set("pageSize", String(params.pageSize));
    const qs = search.toString();
    return request(`/api/services/${id}/checks${qs ? `?${qs}` : ""}`);
  },
};

export const serviceLabelsApi = {
  list: (): Promise<ServiceLabelListItemDto[]> =>
    request("/api/services/labels"),
  create: (input: ServiceLabelInput): Promise<ServiceLabelDto> =>
    request("/api/services/labels", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  update: (
    id: string,
    input: Partial<ServiceLabelInput>,
  ): Promise<ServiceLabelDto> =>
    request(`/api/services/labels/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
  remove: (id: string): Promise<void> =>
    request(`/api/services/labels/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),
};
