// Thin fetch wrapper for the /api/outgoing-webhooks routes. Mirrors
// src/components/settings/webhook-tokens-api.ts. JSON-serialized entries have
// date fields as ISO strings.

import {
  getActiveWorkspaceId,
  WORKSPACE_HEADER_NAME,
} from "@/lib/client/active-workspace";

export type OutgoingWebhookEventValue =
  | "ALERT_CREATED"
  | "SERVICE_STATUS"
  | "MESSAGE_CREATED"
  | "LOG_CREATED"
  | "MAIL_RECEIVED";

export type WebhookDeliveryStatusValue =
  | "PENDING"
  | "DELIVERING"
  | "DELIVERED"
  | "FAILED";

export interface OutgoingWebhookDto {
  id: string;
  name: string;
  url: string;
  events: OutgoingWebhookEventValue[];
  isActive: boolean;
  secretPrefix: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreatedOutgoingWebhookDto {
  id: string;
  secret: string;
  secretPrefix: string;
}

export interface WebhookDeliveryDto {
  id: string;
  event: OutgoingWebhookEventValue;
  status: WebhookDeliveryStatusValue;
  attempts: number;
  maxAttempts: number;
  lastStatusCode: number | null;
  lastError: string | null;
  lastAttemptAt: string | null;
  deliveredAt: string | null;
  nextAttemptAt: string;
  createdAt: string;
}

export interface DeliveriesResult {
  items: WebhookDeliveryDto[];
  nextCursor: string | null;
}

export interface OutgoingWebhookInput {
  name: string;
  url: string;
  events: OutgoingWebhookEventValue[];
  isActive: boolean;
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

export const outgoingWebhooksApi = {
  list: () => request<OutgoingWebhookDto[]>("/api/outgoing-webhooks"),
  create: (input: OutgoingWebhookInput) =>
    request<CreatedOutgoingWebhookDto>("/api/outgoing-webhooks", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  update: (id: string, input: Partial<OutgoingWebhookInput>) =>
    request<OutgoingWebhookDto>(`/api/outgoing-webhooks/${id}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
  remove: (id: string) =>
    request<void>(`/api/outgoing-webhooks/${id}`, { method: "DELETE" }),
  listDeliveries: (id: string, cursor?: string) =>
    request<DeliveriesResult>(
      `/api/outgoing-webhooks/${id}/deliveries${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`,
    ),
  retryDelivery: (id: string, deliveryId: string) =>
    request<void>(
      `/api/outgoing-webhooks/${id}/deliveries/${deliveryId}/retry`,
      { method: "POST" },
    ),
  test: (id: string) =>
    request<{ deliveryId: string }>(`/api/outgoing-webhooks/${id}/test`, {
      method: "POST",
    }),
};
