import { db } from "@/lib/db";
import { MailSpecialUse } from "@/generated/prisma/client";
import { countDueReminders } from "@/lib/services/calendar";

export interface UnreadCounts {
  mail: number;
  alerts: number;
  messages: number;
  calendar: number;
}

/**
 * Unread totals behind the three topbar indicators
 * (src/components/shell/notification-indicators.tsx).
 *
 * Mail counts INBOX only: Sent, Drafts and a noisy Junk folder would make the
 * badge useless. Alerts and messages have no folder dimension, so their
 * `isRead = false` rows are the whole story.
 */
export async function getUnreadCounts(
  workspaceId: string,
): Promise<UnreadCounts> {
  const [mail, alerts, messages, calendar] = await Promise.all([
    countUnreadInbox(workspaceId),
    db.alert.count({ where: { workspaceId, isRead: false } }),
    db.message.count({ where: { workspaceId, isRead: false } }),
    countDueReminders(workspaceId),
  ]);
  return { mail, alerts, messages, calendar };
}

// Two queries instead of one relation filter (`folder: { specialUse: INBOX }`)
// on purpose: filtering MailItem by its own folderId column is what lets the
// [workspaceId, accountId, folderId, isRead] index serve the count, whereas a
// relation filter compiles to a join Postgres has no covering index for.
async function countUnreadInbox(workspaceId: string): Promise<number> {
  const inboxFolders = await db.mailFolder.findMany({
    where: { workspaceId, specialUse: MailSpecialUse.INBOX },
    select: { id: true },
  });
  if (inboxFolders.length === 0) return 0;

  return db.mailItem.count({
    where: {
      workspaceId,
      isRead: false,
      folderId: { in: inboxFolders.map((folder) => folder.id) },
    },
  });
}
