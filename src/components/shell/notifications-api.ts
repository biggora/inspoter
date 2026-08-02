// Thin fetch wrapper for GET /api/notifications/counts, mirroring the per-
// feature api.ts modules (src/components/alerts/api.ts). Deliberately minimal:
// the topbar has exactly one read-only endpoint and no error surface — a failed
// poll keeps the previous numbers.

import {
  getActiveWorkspaceId,
  WORKSPACE_HEADER_NAME,
} from "@/lib/client/active-workspace";

/**
 * Fired on `window` by a section that has just marked rows as read, so the
 * topbar indicator refetches instead of waiting up to a minute. A window event
 * rather than a React context: the emitters (alerts and messages views) sit in
 * a different subtree from the topbar, and a provider wrapping the whole
 * dashboard layout would be a lot of plumbing for one number.
 */
export const UNREAD_COUNTS_STALE_EVENT = "inspoter:unread-counts-stale";

export function notifyUnreadCountsStale(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(UNREAD_COUNTS_STALE_EVENT));
}

export interface UnreadCountsDto {
  mail: number;
  alerts: number;
  messages: number;
}

export async function fetchUnreadCounts(): Promise<UnreadCountsDto> {
  const res = await fetch("/api/notifications/counts", {
    headers: { [WORKSPACE_HEADER_NAME]: getActiveWorkspaceId() ?? "" },
  });
  if (!res.ok) throw new Error(`Unread counts request failed: ${res.status}`);
  return (await res.json()) as UnreadCountsDto;
}
