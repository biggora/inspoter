// Thin fetch wrappers for the /api/message-categories and /api/channels
// routes (backend-dev-owned, src/app/api/{message-categories,channels}/**).
// JSON-serialized entries have date fields as ISO strings, hence dedicated
// DTOs rather than reusing generated Prisma types.

import {
  getActiveWorkspaceId,
  WORKSPACE_HEADER_NAME,
} from "@/lib/client/active-workspace";

export interface ChannelDto {
  id: string;
  messageCategoryId: string;
  name: string;
}

export interface MessageCategoryDto {
  id: string;
  name: string;
  channels: ChannelDto[];
}

export interface MessageDto {
  id: string;
  channelId: string;
  content: string;
  author: string | null;
  origin: "LEGACY" | "OPERATOR" | "WEBHOOK";
  createdAt: string;
}

export interface ChannelWebhookDto {
  id: string;
  channelId: string;
  name: string;
  tokenPrefix: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

export interface CreatedChannelWebhookDto {
  webhook: ChannelWebhookDto;
  url: string;
}

export interface FetchMessagesParams {
  cursor?: string;
  sort?: "asc" | "desc";
}

export interface FetchMessagesResult {
  items: MessageDto[];
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

export const messageCategoriesApi = {
  list: () => request<MessageCategoryDto[]>("/api/message-categories"),
  create: (name: string) =>
    request<MessageCategoryDto>("/api/message-categories", {
      method: "POST",
      body: JSON.stringify({ name }),
    }),
  rename: (id: string, name: string) =>
    request<MessageCategoryDto>(`/api/message-categories/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ name }),
    }),
  remove: (id: string) =>
    request<void>(`/api/message-categories/${id}`, { method: "DELETE" }),
};

export const channelsApi = {
  create: (categoryId: string, name: string) =>
    request<ChannelDto>("/api/channels", {
      method: "POST",
      body: JSON.stringify({ categoryId, name }),
    }),
  rename: (id: string, name: string) =>
    request<ChannelDto>(`/api/channels/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ name }),
    }),
  remove: (id: string) =>
    request<void>(`/api/channels/${id}`, { method: "DELETE" }),
};

export const channelWebhooksApi = {
  list: (channelId: string) =>
    request<ChannelWebhookDto[]>(`/api/channels/${channelId}/webhooks`),
  create: (channelId: string, name: string) =>
    request<CreatedChannelWebhookDto>(`/api/channels/${channelId}/webhooks`, {
      method: "POST",
      body: JSON.stringify({ name }),
    }),
  revoke: (channelId: string, webhookId: string) =>
    request<void>(`/api/channels/${channelId}/webhooks/${webhookId}`, {
      method: "DELETE",
    }),
};

export function sendMessage(
  channelId: string,
  content: string,
): Promise<{ id: string }> {
  return request(`/api/channels/${channelId}/messages`, {
    method: "POST",
    body: JSON.stringify({ content }),
  });
}

export function fetchMessages(
  channelId: string,
  params: FetchMessagesParams,
): Promise<FetchMessagesResult> {
  const searchParams = new URLSearchParams();
  if (params.cursor) searchParams.set("cursor", params.cursor);
  if (params.sort) searchParams.set("sort", params.sort);
  return request(`/api/channels/${channelId}/messages?${searchParams}`);
}
