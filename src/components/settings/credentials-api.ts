// Thin fetch wrapper for the /api/credentials routes (backend-dev-owned,
// src/app/api/credentials/**). Mirrors src/components/settings/webhook-tokens-api.ts.
// JSON-serialized entries have date fields as ISO strings.

import {
  getActiveWorkspaceId,
  WORKSPACE_HEADER_NAME,
} from "@/lib/client/active-workspace";
import type { ProviderType } from "@/generated/prisma/client";

export type { ProviderType };

export interface CredentialDto {
  id: string;
  provider: ProviderType;
  label: string;
  maskedHint: string;
  allowInsecure: boolean;
  isValid: boolean | null;
  lastCheckedAt: string | null;
  autoRefreshEnabled: boolean;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface EmbeddingStatusDto {
  credentialId: string | null;
  model: string;
  dimensions: number;
  revision: number;
  backfillStatus: "PENDING" | "RUNNING" | "READY" | "ERROR";
  indexedNotes: number;
  totalNotes: number;
  lastError: string | null;
  lastErrorAt: string | null;
  updatedAt: string;
}

export type UpsertCredentialInput =
  | {
      provider:
        "CLOUDFLARE_DNS" | "HETZNER_DNS" | "HETZNER_CLOUD" | "HOSTINGER";
      label: string;
      apiToken: string;
    }
  | {
      provider: "GODADDY_DNS";
      label: string;
      apiKey: string;
      apiSecret: string;
    }
  | {
      provider: "CPANEL_WHM" | "CPANEL_UAPI";
      label: string;
      hostname: string;
      username: string;
      apiToken: string;
      allowInsecure?: boolean;
    }
  // `mode` is omitted by the dialog on purpose — the route defaults it to
  // REAL, and only tests/e2e post MOCK.
  | {
      provider: "OPENAI_COMPATIBLE" | "ANTHROPIC_COMPATIBLE";
      label: string;
      baseUrl: string;
      model: string;
      apiKey: string;
    };

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
        message = body.message ?? body.error;
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

export const credentialsApi = {
  list: () => request<CredentialDto[]>("/api/credentials"),
  create: (input: UpsertCredentialInput) =>
    request<CredentialDto>("/api/credentials", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  update: (id: string, input: UpsertCredentialInput) =>
    request<CredentialDto>(`/api/credentials/${id}`, {
      method: "PUT",
      body: JSON.stringify(input),
    }),
  setAutoRefresh: (id: string, enabled: boolean) =>
    request<CredentialDto>(`/api/credentials/${id}/auto-refresh`, {
      method: "PATCH",
      body: JSON.stringify({ enabled }),
    }),
  setDefault: (id: string, isDefault: boolean) =>
    request<CredentialDto>(`/api/credentials/${id}/default`, {
      method: "PATCH",
      body: JSON.stringify({ isDefault }),
    }),
  embeddingStatus: () =>
    request<EmbeddingStatusDto | null>("/api/embeddings/status"),
  setEmbeddingDefault: (id: string, enabled: boolean, model?: string) =>
    request<EmbeddingStatusDto | null>(
      `/api/credentials/${id}/embedding-default`,
      {
        method: "PATCH",
        body: JSON.stringify({ enabled, ...(model ? { model } : {}) }),
      },
    ),
  remove: (id: string) =>
    request<void>(`/api/credentials/${id}`, { method: "DELETE" }),
};
