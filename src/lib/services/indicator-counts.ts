import { cache } from "react";

import { db } from "@/lib/db";
import { MailSpecialUse } from "@/generated/prisma/client";
import { countDueReminders } from "@/lib/services/calendar";

/**
 * Every number the dashboard chrome shows, in one payload.
 *
 * Three surfaces used to compute these independently — the topbar badges from
 * their own endpoint, the sidebar footer and the management page each from
 * their own server call in a different render pass. App Router does not
 * re-render a layout on client-side navigation, so the sidebar kept whatever
 * it read on the last full page load while the page beside it showed fresh
 * numbers. One DTO, one counting module, one client store is what stops those
 * two from ever disagreeing again.
 */
export interface IndicatorState {
  /** Unread MailItem rows in INBOX folders. */
  mail: number;
  /** Unread Alert rows, every severity. */
  alerts: number;
  /** Unread Message rows, every channel. */
  messages: number;
  /**
   * ReminderOccurrence rows at status DUE. Named `calendar` because the key
   * doubles as the Workspace.hiddenSections key in nav-items.ts.
   */
  calendar: number;
  /** Credentials whose last sync succeeded (or that never errored). */
  providersOk: number;
  /** Credentials with a recorded lastSyncError — the "errored" provider mode. */
  providersErrored: number;
  /** Unread alerts at critical severity. */
  openCriticalAlerts: number;
}

/**
 * The INBOX folder ids of a workspace. Extracted so the executive snapshot can
 * filter by the same set rather than by a `folder: { specialUse }` relation —
 * see countUnreadInboxMail for why that distinction matters.
 */
export async function listInboxFolderIds(
  workspaceId: string,
): Promise<string[]> {
  const folders = await db.mailFolder.findMany({
    where: { workspaceId, specialUse: MailSpecialUse.INBOX },
    select: { id: true },
  });
  return folders.map((folder) => folder.id);
}

// Two queries instead of one relation filter (`folder: { specialUse: INBOX }`)
// on purpose: filtering MailItem by its own folderId column is what lets the
// [workspaceId, accountId, folderId, isRead] index serve the count, whereas a
// relation filter compiles to a join Postgres has no covering index for.
//
// Mail counts INBOX only: Sent, Drafts and a noisy Junk folder would make the
// badge useless.
export async function countUnreadInboxMail(
  workspaceId: string,
): Promise<number> {
  const inboxFolderIds = await listInboxFolderIds(workspaceId);
  if (inboxFolderIds.length === 0) return 0;

  return db.mailItem.count({
    where: {
      workspaceId,
      isRead: false,
      folderId: { in: inboxFolderIds },
    },
  });
}

/** Alerts and messages have no folder dimension, so `isRead = false` is the
 *  whole story. Exported so the executive snapshot shares the definition
 *  instead of restating the query. */
export function countUnreadAlerts(workspaceId: string): Promise<number> {
  return db.alert.count({ where: { workspaceId, isRead: false } });
}

export function countUnreadMessages(workspaceId: string): Promise<number> {
  return db.message.count({ where: { workspaceId, isRead: false } });
}

export function countOpenCriticalAlerts(workspaceId: string): Promise<number> {
  return db.alert.count({
    where: { workspaceId, isRead: false, severity: "critical" },
  });
}

/**
 * Provider sync health, read from the same columns the refresh loop maintains
 * (provider-health.ts), so reading it never triggers provider calls of its own.
 */
export async function countProviderHealth(
  workspaceId: string,
): Promise<{ ok: number; errored: number }> {
  const [total, errored] = await Promise.all([
    db.providerCredential.count({ where: { workspaceId } }),
    db.providerCredential.count({
      where: { workspaceId, lastSyncError: { not: null } },
    }),
  ]);
  return { ok: total - errored, errored };
}

/**
 * Uncached. Anything running outside a React render pass — route handlers, the
 * SSE broadcaster — must call this one: `cache()` only memoizes within a render,
 * so using the cached variant in a long-lived loop would be a silent no-op that
 * reads as deduplication without being it.
 */
export async function computeIndicatorState(
  workspaceId: string,
): Promise<IndicatorState> {
  const [mail, alerts, messages, calendar, providers, openCriticalAlerts] =
    await Promise.all([
      countUnreadInboxMail(workspaceId),
      countUnreadAlerts(workspaceId),
      countUnreadMessages(workspaceId),
      countDueReminders(workspaceId),
      countProviderHealth(workspaceId),
      countOpenCriticalAlerts(workspaceId),
    ]);

  return {
    mail,
    alerts,
    messages,
    calendar,
    providersOk: providers.ok,
    providersErrored: providers.errored,
    openCriticalAlerts,
  };
}

/**
 * Request-scoped memo for Server Components. The dashboard layout is the only
 * caller today; the memo is what keeps a second call site from silently
 * doubling the query count if one ever reappears.
 */
export const getIndicatorState = cache(computeIndicatorState);
