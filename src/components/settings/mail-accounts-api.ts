// Thin fetch wrapper for the /api/mail/accounts routes (plan §4). Mirrors
// src/components/settings/credentials-api.ts. JSON-serialized entries have
// date fields as ISO strings; the password never round-trips back.

import {
  getActiveWorkspaceId,
  WORKSPACE_HEADER_NAME,
} from "@/lib/client/active-workspace";
import type {
  MailAccountKind,
  MailSecurity,
  MailSyncStatus,
  ProviderMode,
} from "@/generated/prisma/client";

export type { MailAccountKind, MailSecurity, MailSyncStatus, ProviderMode };

export interface MailAccountDto {
  id: string;
  kind: MailAccountKind;
  mode: ProviderMode;
  name: string;
  email: string;
  imapHost: string | null;
  imapPort: number | null;
  imapSecurity: MailSecurity | null;
  smtpHost: string | null;
  smtpPort: number | null;
  smtpSecurity: MailSecurity | null;
  username: string | null;
  maskedHint: string | null;
  isValid: boolean | null;
  lastCheckedAt: string | null;
  isActive: boolean;
  syncStatus: MailSyncStatus;
  syncError: string | null;
  lastSyncAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateMailAccountInput {
  name: string;
  email: string;
  imapHost: string;
  imapPort: number;
  imapSecurity: MailSecurity;
  smtpHost: string;
  smtpPort: number;
  smtpSecurity: MailSecurity;
  username: string;
  password: string;
}

export type UpdateMailAccountInput = Partial<CreateMailAccountInput>;

export interface TestConnectionResult {
  imapOk: boolean;
  smtpOk: boolean;
  error: string | null;
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

export const mailAccountsApi = {
  list: () => request<MailAccountDto[]>("/api/mail/accounts"),
  create: (input: CreateMailAccountInput) =>
    request<MailAccountDto>("/api/mail/accounts", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  update: (id: string, input: UpdateMailAccountInput) =>
    request<MailAccountDto>(`/api/mail/accounts/${id}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
  remove: (id: string) =>
    request<void>(`/api/mail/accounts/${id}`, { method: "DELETE" }),
  test: (input: CreateMailAccountInput) =>
    request<TestConnectionResult>("/api/mail/accounts/test", {
      method: "POST",
      body: JSON.stringify(input),
    }),
};
