// Thin fetch wrapper for the /api/domains/** routes (routes are
// backend-dev-owned, src/app/api/**). Mirrors the ApiError/field-error
// shape of src/components/bookmarks/api.ts — the domains route handlers
// use the same two error bodies: `{ error: string }` (provider failure,
// providerResultResponse) and `{ error: ZodIssue[] }` (validation failure,
// dnsRecordInputSchema/dnsRecordPatchSchema).

import type { DnsRecord, DnsRecordInput, DnsRecordPatch } from "@/lib/providers/dns/types";
import type { DomainsByProvider } from "@/lib/services/domains";

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
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
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

export function fetchDomains(): Promise<DomainsByProvider[]> {
  return request("/api/domains");
}

export function fetchRecords(
  providerId: string,
  domainId: string,
): Promise<DnsRecord[]> {
  return request(
    `/api/domains/${providerId}/${domainId}/records`,
  );
}

export function createRecord(
  providerId: string,
  domainId: string,
  data: DnsRecordInput,
): Promise<DnsRecord> {
  return request(`/api/domains/${providerId}/${domainId}/records`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function updateRecord(
  providerId: string,
  domainId: string,
  recordId: string,
  data: DnsRecordPatch,
): Promise<DnsRecord> {
  return request(
    `/api/domains/${providerId}/${domainId}/records/${recordId}`,
    { method: "PATCH", body: JSON.stringify(data) },
  );
}

export function deleteRecord(
  providerId: string,
  domainId: string,
  recordId: string,
): Promise<void> {
  return request(
    `/api/domains/${providerId}/${domainId}/records/${recordId}`,
    { method: "DELETE" },
  );
}
