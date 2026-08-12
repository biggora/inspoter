// Thin fetch wrapper for /api/contacts and /api/contact-labels, in the same
// shape as src/components/bookmarks/api.ts: mutations return, the caller then
// calls router.refresh() so the server component stays the single source of
// truth. No client-held copy of the contact list.

import {
  getActiveWorkspaceId,
  WORKSPACE_HEADER_NAME,
} from "@/lib/client/active-workspace";
import type {
  ContactBulkAction,
  ContactDetail,
  ContactListResult,
  DuplicateGroup,
  ImportContactsSummary,
  RecipientSuggestion,
} from "@/lib/services/contacts";
import type { ContactLabelSummary } from "@/lib/services/contact-labels";
import type { ContactExportFormat } from "@/lib/contacts/formats";

export type {
  ContactDetail,
  ContactListItem,
  ContactListResult,
  DuplicateGroup,
  ImportContactsSummary,
} from "@/lib/services/contacts";
export type { ContactLabelSummary } from "@/lib/services/contact-labels";

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

function workspaceHeaders(): Record<string, string> {
  return { [WORKSPACE_HEADER_NAME]: getActiveWorkspaceId() ?? "" };
}

async function toApiError(res: Response): Promise<ApiError> {
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
        const key = issue.path?.join(".");
        if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
      }
      message = (body.error as ZodIssueLike[])[0]?.message ?? message;
    }
  } catch {
    // Non-JSON error body — the generic message above stands.
  }
  return new ApiError(message, fieldErrors);
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...workspaceHeaders(),
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) throw await toApiError(res);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export interface ContactFieldPayload {
  kind: string;
  label: string | null;
  value: string;
  isPrimary: boolean;
}

export interface ContactAddressPayload {
  label: string | null;
  poBox: string | null;
  extended: string | null;
  street: string | null;
  city: string | null;
  region: string | null;
  postalCode: string | null;
  country: string | null;
  formatted: string | null;
}

export interface ContactPayload {
  prefix: string | null;
  firstName: string | null;
  middleName: string | null;
  lastName: string | null;
  suffix: string | null;
  phoneticFirst: string | null;
  phoneticMiddle: string | null;
  phoneticLast: string | null;
  nickname: string | null;
  fileAs: string | null;
  organization: string | null;
  jobTitle: string | null;
  department: string | null;
  birthday: string | null;
  notes: string | null;
  starred: boolean;
  fields: ContactFieldPayload[];
  addresses: ContactAddressPayload[];
  labelIds: string[];
}

export interface ContactListQuery {
  query?: string;
  labelId?: string;
  starred?: boolean;
  page?: number;
  pageSize?: number;
}

function toSearchParams(query: ContactListQuery): string {
  const params = new URLSearchParams();
  if (query.query) params.set("query", query.query);
  if (query.labelId) params.set("labelId", query.labelId);
  if (query.starred) params.set("starred", "true");
  if (query.page) params.set("page", String(query.page));
  if (query.pageSize) params.set("pageSize", String(query.pageSize));
  return params.toString();
}

export const contactsApi = {
  list: (query: ContactListQuery = {}) =>
    request<ContactListResult>(`/api/contacts?${toSearchParams(query)}`),
  get: (id: string) => request<ContactDetail>(`/api/contacts/${id}`),
  create: (payload: ContactPayload) =>
    request<ContactDetail>("/api/contacts", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  update: (id: string, payload: ContactPayload) =>
    request<ContactDetail>(`/api/contacts/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  remove: (id: string) =>
    request<void>(`/api/contacts/${id}`, { method: "DELETE" }),
  bulk: (contactIds: string[], action: ContactBulkAction) =>
    request<{ affected: number }>("/api/contacts/bulk", {
      method: "PATCH",
      body: JSON.stringify({ contactIds, action }),
    }),
  duplicates: () =>
    request<{ groups: DuplicateGroup[] }>("/api/contacts/duplicates"),
  merge: (primaryId: string, otherIds: string[]) =>
    request<ContactDetail>("/api/contacts/merge", {
      method: "POST",
      body: JSON.stringify({ primaryId, otherIds }),
    }),
  suggest: (query: string) =>
    request<{ suggestions: RecipientSuggestion[] }>(
      `/api/contacts/suggest?q=${encodeURIComponent(query)}`,
    ),

  // Multipart: the browser sets its own Content-Type boundary, so the JSON
  // header the shared request() adds must not be sent here.
  import: async (
    file: File,
    duplicateStrategy: "skip" | "update" | "create",
  ): Promise<ImportContactsSummary> => {
    const form = new FormData();
    form.set("file", file);
    form.set("duplicateStrategy", duplicateStrategy);
    const res = await fetch("/api/contacts/import", {
      method: "POST",
      headers: workspaceHeaders(),
      body: form,
    });
    if (!res.ok) throw await toApiError(res);
    return (await res.json()) as ImportContactsSummary;
  },

  uploadPhoto: async (id: string, file: File): Promise<void> => {
    const form = new FormData();
    form.set("photo", file);
    const res = await fetch(`/api/contacts/${id}/photo`, {
      method: "POST",
      headers: workspaceHeaders(),
      body: form,
    });
    if (!res.ok) throw await toApiError(res);
  },

  removePhoto: (id: string) =>
    request<void>(`/api/contacts/${id}/photo`, { method: "DELETE" }),

  /**
   * Downloads through fetch rather than a plain link: the export route needs
   * the workspace header, which a browser navigation cannot carry.
   */
  export: async (
    format: ContactExportFormat,
    selection: {
      contactIds?: string[];
      labelId?: string;
      query?: string;
      starred?: boolean;
    },
  ): Promise<{ blob: Blob; filename: string }> => {
    const params = new URLSearchParams({ format });
    for (const id of selection.contactIds ?? []) params.append("contactId", id);
    if (selection.labelId) params.set("labelId", selection.labelId);
    if (selection.query) params.set("query", selection.query);
    if (selection.starred) params.set("starred", "true");

    const res = await fetch(`/api/contacts/export?${params.toString()}`, {
      headers: workspaceHeaders(),
    });
    if (!res.ok) throw await toApiError(res);
    const disposition = res.headers.get("content-disposition") ?? "";
    const filename =
      /filename="([^"]+)"/u.exec(disposition)?.[1] ?? "contacts.vcf";
    return { blob: await res.blob(), filename };
  },
};

export const contactLabelsApi = {
  list: () => request<ContactLabelSummary[]>("/api/contact-labels"),
  create: (name: string, color: string) =>
    request<ContactLabelSummary>("/api/contact-labels", {
      method: "POST",
      body: JSON.stringify({ name, color }),
    }),
  update: (id: string, input: { name?: string; color?: string }) =>
    request<ContactLabelSummary>(`/api/contact-labels/${id}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
  remove: (id: string) =>
    request<void>(`/api/contact-labels/${id}`, { method: "DELETE" }),
};
