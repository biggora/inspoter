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
import type { MailLabelColor } from "@/lib/mail-label-color";
import type {
  MailFilterConditionDto,
  MailFilterConditionInput,
  MailFilterMatchMode,
} from "@/lib/mail-filter-types";

export { ApiError };
export type {
  MailAccountDto,
  MailFilterConditionDto,
  MailFilterConditionInput,
  MailFilterMatchMode,
  MailLabelColor,
  MailSpecialUse,
};

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
  labels: MailLabelDto[];
}

export interface MailLabelDto {
  id: string;
  name: string;
  color: MailLabelColor;
  position?: number;
  messageCount?: number;
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
  bcc: MailAddressDto[];
  subject: string;
  snippet: string | null;
  bodyText: string;
  bodyHtml: string | null;
  bodyTruncated: boolean;
  sourceSizeBytes: string | null;
  draftReplyToId: string | null;
  draftForwardOfId: string | null;
  isRead: boolean;
  isAnswered: boolean;
  isFlagged: boolean;
  hasAttachments: boolean;
  receivedAt: string;
  attachments: MailAttachmentDto[];
  labels: MailLabelDto[];
}

export interface MailFilterRuleDto {
  id: string;
  accountId: string;
  labelId: string;
  name: string;
  fromAddress: string | null;
  subjectContains: string | null;
  matchMode?: MailFilterMatchMode;
  conditions?: MailFilterConditionDto[];
  setRead?: boolean | null;
  moveToFolderId?: string | null;
  isActive: boolean;
  position: number;
  createdAt: string;
  updatedAt: string;
  label: Pick<MailLabelDto, "name" | "color">;
  moveToFolder?: { name: string } | null;
  latestRun: MailFilterRunDto | null;
}

export type MailFilterRunStatus =
  "PENDING" | "RUNNING" | "COMPLETED" | "FAILED";

export interface MailFilterRunDto {
  id: string;
  ruleId: string | null;
  status: MailFilterRunStatus;
  processedCount: number;
  matchedCount: number;
  attempts: number;
  errorCode: string | null;
  startedAt: string | null;
  completedAt: string | null;
  updatedAt: string;
}

export interface FetchMailParams {
  accountId: string;
  folderId: string;
  labelId?: string;
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
  if (res.status === 204) return undefined as T;
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
  if (params.labelId) searchParams.set("labelId", params.labelId);
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

export function fetchMailLabels(scope?: {
  accountId: string;
  folderId: string;
}): Promise<MailLabelDto[]> {
  const params = new URLSearchParams();
  if (scope) {
    params.set("accountId", scope.accountId);
    params.set("folderId", scope.folderId);
  }
  const query = params.size > 0 ? `?${params}` : "";
  return request<MailLabelDto[]>(`/api/mail/labels${query}`);
}

export function createMailLabel(input: {
  name: string;
  color: MailLabelColor;
}): Promise<MailLabelDto> {
  return request<MailLabelDto>("/api/mail/labels", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export function patchMailLabel(
  id: string,
  input: {
    name?: string;
    color?: MailLabelColor;
    position?: number;
  },
): Promise<MailLabelDto> {
  return request<MailLabelDto>(`/api/mail/labels/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export function deleteMailLabel(id: string): Promise<void> {
  return request<void>(`/api/mail/labels/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export function assignMailLabel(
  mailId: string,
  labelId: string,
): Promise<MailLabelDto> {
  return request<MailLabelDto>(
    `/api/mail/${encodeURIComponent(mailId)}/labels/${encodeURIComponent(labelId)}`,
    { method: "PUT" },
  );
}

export function removeMailLabel(
  mailId: string,
  labelId: string,
): Promise<void> {
  return request<void>(
    `/api/mail/${encodeURIComponent(mailId)}/labels/${encodeURIComponent(labelId)}`,
    { method: "DELETE" },
  );
}

export function fetchMailFilterRules(
  accountId: string,
): Promise<MailFilterRuleDto[]> {
  const params = new URLSearchParams({ accountId });
  return request<MailFilterRuleDto[]>(`/api/mail/filter-rules?${params}`);
}

export interface CreateMailFilterRuleInput {
  accountId: string;
  labelId: string;
  name: string;
  matchMode?: MailFilterMatchMode;
  conditions?: MailFilterConditionInput[];
  fromAddress?: string | null;
  subjectContains?: string | null;
  setRead?: boolean | null;
  moveToFolderId?: string | null;
  applyToExistingMail?: boolean;
}

export interface UpdateMailFilterRuleInput {
  labelId?: string;
  name?: string;
  matchMode?: MailFilterMatchMode;
  conditions?: MailFilterConditionInput[];
  fromAddress?: string | null;
  subjectContains?: string | null;
  setRead?: boolean | null;
  moveToFolderId?: string | null;
  isActive?: boolean;
  position?: number;
}

export function createMailFilterRule(
  input: CreateMailFilterRuleInput,
): Promise<MailFilterRuleDto> {
  return request<MailFilterRuleDto>("/api/mail/filter-rules", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export const createExactSenderRule = createMailFilterRule;

export function patchMailFilterRule(
  id: string,
  input: UpdateMailFilterRuleInput,
): Promise<MailFilterRuleDto> {
  return request<MailFilterRuleDto>(
    `/api/mail/filter-rules/${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
  );
}

export function deleteMailFilterRule(id: string): Promise<void> {
  return request<void>(`/api/mail/filter-rules/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export function fetchMailFilterRun(id: string): Promise<MailFilterRunDto> {
  return request<MailFilterRunDto>(
    `/api/mail/filter-runs/${encodeURIComponent(id)}`,
  );
}

export function retryMailFilterRun(id: string): Promise<MailFilterRunDto> {
  return request<MailFilterRunDto>(
    `/api/mail/filter-runs/${encodeURIComponent(id)}/retry`,
    { method: "POST" },
  );
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
  bodyText: string;
  bodyHtml: string;
  inReplyToId?: string;
  forwardOfId?: string;
  draftId?: string;
}

export function sendMail(input: SendMailInput): Promise<{ id: string | null }> {
  return request<{ id: string | null }>("/api/mail/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export interface MailDraftAttachmentDto {
  id: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
}

export interface MailDraftDto {
  id: string;
  accountId: string;
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  bodyText: string;
  bodyHtml: string;
  inReplyToId: string | null;
  forwardOfId: string | null;
  updatedAt: string;
  attachments: MailDraftAttachmentDto[];
}

export interface SaveMailDraftInput {
  draftId?: string;
  accountId: string;
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  bodyText: string;
  bodyHtml: string;
  inReplyToId?: string;
  forwardOfId?: string;
}

export function saveMailDraft(
  input: SaveMailDraftInput,
): Promise<MailDraftDto> {
  return request<MailDraftDto>("/api/mail/drafts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export function uploadMailDraftAttachment(
  draftId: string,
  file: File,
): Promise<MailDraftAttachmentDto> {
  const body = new FormData();
  body.set("file", file);
  return request<MailDraftAttachmentDto>(
    `/api/mail/drafts/${encodeURIComponent(draftId)}/attachments`,
    { method: "POST", body },
  );
}

export function deleteMailDraftAttachment(
  draftId: string,
  attachmentId: string,
): Promise<void> {
  return request<void>(
    `/api/mail/drafts/${encodeURIComponent(draftId)}/attachments/${encodeURIComponent(attachmentId)}`,
    { method: "DELETE" },
  );
}

// --- AI features (specs/ai-integration.md scenarios 1-3) ---
//
// All three are POST even though nothing is mutated: the call is not
// idempotent and costs tokens, and a GET is something the browser is entitled
// to prefetch. Every one takes an AbortSignal — the model deadline is 60 s,
// so an operator who moves on must be able to drop the request.
//
// Failures arrive as a stable code in ApiError.message (AI_UNAVAILABLE,
// AI_RATE_LIMIT, …), which the component maps to a message key.

export interface MailAiSummaryDto {
  summary: string;
  bullets: string[];
  actionItems: string[];
  model: string;
  truncated: boolean;
}

export interface MailAiReplyDraftDto {
  bodyText: string;
  model: string;
  truncated: boolean;
}

export interface MailAiFilterProposalDto {
  name: string;
  matchMode: MailFilterMatchMode;
  conditions: MailFilterConditionInput[];
  droppedConditions: number;
  reason: string | null;
  model: string;
  truncated: boolean;
}

function postAi<T>(
  id: string,
  action: string,
  body: unknown,
  signal?: AbortSignal,
): Promise<T> {
  return request<T>(`/api/mail/${encodeURIComponent(id)}/ai/${action}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
}

export function summarizeMailMessage(
  id: string,
  language: string,
  signal?: AbortSignal,
): Promise<MailAiSummaryDto> {
  return postAi<MailAiSummaryDto>(id, "summary", { language }, signal);
}

export function draftMailReply(
  id: string,
  language: string,
  instruction: string | undefined,
  signal?: AbortSignal,
): Promise<MailAiReplyDraftDto> {
  return postAi<MailAiReplyDraftDto>(
    id,
    "reply-draft",
    instruction ? { language, instruction } : { language },
    signal,
  );
}

export function proposeMailFilterRule(
  id: string,
  language: string,
  signal?: AbortSignal,
): Promise<MailAiFilterProposalDto> {
  return postAi<MailAiFilterProposalDto>(
    id,
    "filter-rule",
    { language },
    signal,
  );
}
