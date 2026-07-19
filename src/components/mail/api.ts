// Thin fetch wrapper for the /api/mail routes (plan §4/§5). Mirrors
// src/components/settings/mail-accounts-api.ts: JSON-serialized entries have
// date fields as ISO strings, hence dedicated DTOs rather than reusing the
// server-side service types.

import {
  getActiveWorkspaceId,
  WORKSPACE_HEADER_NAME,
} from "@/lib/client/active-workspace";
import {
  ApiError,
  mailAccountsApi,
  type MailAccountDto,
} from "@/components/settings/mail-accounts-api";
import type { MailSpecialUse } from "@/generated/prisma/client";

export { ApiError };
export type { MailAccountDto, MailSpecialUse };

export interface MailFolderDto {
  id: string;
  path: string;
  name: string;
  specialUse: MailSpecialUse;
  position: number;
  unreadCount: number;
}

export interface MailListItemDto {
  id: string;
  from: string;
  fromName: string | null;
  subject: string;
  snippet: string | null;
  isRead: boolean;
  isAnswered: boolean;
  isFlagged: boolean;
  hasAttachments: boolean;
  receivedAt: string;
  accountId: string;
  folderId: string;
}

export interface MailAddressDto {
  name: string | null;
  address: string;
}

export interface MailAttachmentDto {
  id: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  isInline: boolean;
}

export interface MailDetailDto {
  id: string;
  accountId: string;
  folderId: string;
  accountKind: MailAccountDto["kind"];
  from: string;
  fromName: string | null;
  to: MailAddressDto[];
  cc: MailAddressDto[];
  subject: string;
  snippet: string | null;
  bodyText: string;
  bodyHtml: string | null;
  isRead: boolean;
  isAnswered: boolean;
  isFlagged: boolean;
  hasAttachments: boolean;
  receivedAt: string;
  attachments: MailAttachmentDto[];
}

export interface FetchMailParams {
  accountId: string;
  folderId: string;
  unread?: boolean;
  query?: string;
  sort?: "asc" | "desc";
  cursor?: string;
  from?: string;
}

export interface FetchMailResult {
  items: MailListItemDto[];
  nextCursor: string | null;
}

export interface SyncResultDto {
  status: "synced";
  folders: number;
  newMessages: number;
}

// Error message the sync route returns with 409 when a sync is already
// running (POST /api/mail/accounts/[id]/sync).
export const SYNC_IN_PROGRESS = "SYNC_IN_PROGRESS";

interface ZodIssueLike {
  path?: Array<string | number>;
  message: string;
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      [WORKSPACE_HEADER_NAME]: getActiveWorkspaceId() ?? "",
      ...(init?.headers ?? {}),
    },
  });

  if (!res.ok) {
    let message = "Something went wrong. Try again.";
    let fieldErrors: Record<string, string> | undefined;
    try {
      const body = (await res.json()) as { error?: unknown };
      if (typeof body?.error === "string") {
        message = body.error;
      } else if (Array.isArray(body?.error)) {
        // Zod issue array (mirrors mail-accounts-api) — keyed inline errors
        // for the compose dialog.
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
  return (await res.json()) as T;
}

export function fetchMailAccounts(): Promise<MailAccountDto[]> {
  return mailAccountsApi.list();
}

export function fetchFolders(accountId: string): Promise<MailFolderDto[]> {
  return request<MailFolderDto[]>(
    `/api/mail/accounts/${encodeURIComponent(accountId)}/folders`,
  );
}

export function syncAccount(accountId: string): Promise<SyncResultDto> {
  return request<SyncResultDto>(
    `/api/mail/accounts/${encodeURIComponent(accountId)}/sync`,
    { method: "POST" },
  );
}

export function fetchMail(params: FetchMailParams): Promise<FetchMailResult> {
  const searchParams = new URLSearchParams();
  searchParams.set("accountId", params.accountId);
  searchParams.set("folderId", params.folderId);
  if (params.unread) searchParams.set("unread", "1");
  if (params.query) searchParams.set("query", params.query);
  if (params.sort) searchParams.set("sort", params.sort);
  if (params.cursor) searchParams.set("cursor", params.cursor);
  if (params.from) searchParams.set("from", params.from);
  return request<FetchMailResult>(`/api/mail?${searchParams}`);
}

export function fetchMailById(id: string): Promise<MailDetailDto> {
  return request<MailDetailDto>(`/api/mail/${encodeURIComponent(id)}`);
}

export function patchMailItem(
  id: string,
  input: { isRead: boolean },
): Promise<{ id: string; isRead: boolean }> {
  return request<{ id: string; isRead: boolean }>(
    `/api/mail/${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
  );
}

export function deleteMailItem(
  id: string,
): Promise<{ status: "trashed" | "deleted" }> {
  return request<{ status: "trashed" | "deleted" }>(
    `/api/mail/${encodeURIComponent(id)}`,
    { method: "DELETE" },
  );
}

export function moveMailItem(
  id: string,
  targetFolderId: string,
): Promise<{ id: string; folderId: string }> {
  return request<{ id: string; folderId: string }>(
    `/api/mail/${encodeURIComponent(id)}/move`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetFolderId }),
    },
  );
}

// Attachment download (Phase 7). A plain <a href> cannot carry the workspace
// header, so fetch the bytes, then hand them to the browser via a transient
// object URL + programmatic <a download> click.
//
// This is a plain (non-component) module, so the caller passes its own
// "mail" namespace `t` for the fallback error message, same pattern as
// src/lib/format/relative-time.ts.
export async function downloadAttachment(
  mailId: string,
  attachmentId: string,
  filename: string,
  t: (key: string) => string,
): Promise<void> {
  const res = await fetch(
    `/api/mail/${encodeURIComponent(mailId)}/attachments/${encodeURIComponent(attachmentId)}`,
    {
      headers: { [WORKSPACE_HEADER_NAME]: getActiveWorkspaceId() ?? "" },
    },
  );
  if (!res.ok) {
    let message = t("errorDownloadAttachment");
    try {
      const body = (await res.json()) as { error?: unknown };
      if (typeof body?.error === "string") message = body.error;
    } catch {
      // Non-JSON error body — keep the generic message.
    }
    throw new ApiError(message);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}

export interface SendMailInput {
  accountId: string;
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  body: string;
  inReplyToId?: string;
}

export function sendMail(
  input: SendMailInput,
): Promise<{ id: string | null }> {
  return request<{ id: string | null }>("/api/mail/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}
