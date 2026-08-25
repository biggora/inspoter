import { db } from "@/lib/db";
import { env } from "@/lib/config/env";
import {
  Prisma,
  type MailAccount,
  type MailFolder,
  type MailSpecialUse,
} from "@/generated/prisma/client";
import {
  getMailDriver,
  MailTransportError,
  WebhookAccountHasNoTransportError,
  type MailDriver,
  type RemoteFolder,
  type RemoteMessage,
} from "@/lib/mail";
import { MailAccountNotFoundError } from "@/lib/services/mail-accounts";
import { logError } from "@/lib/services/logs";
import { persistIncomingMail } from "@/lib/services/mail-message-persistence";
import { nextMailSyncState } from "@/lib/services/mail-sync-status";
import * as alertsService from "./alerts";

// IMAP sync engine (plan §3 "sync engine"): lease-locked per-account
// sync — folder list reconciliation, initial/incremental message fetch,
// flag down-sync and deletion detection. Up-sync of flags happens in the
// action routes, not here.

export type SyncOutcome =
  | { status: "synced"; folders: number; newMessages: number }
  | { status: "busy" }
  | { status: "error"; error: string };

// Lease horizon: a crashed sync frees its account after 5 minutes.
const LEASE_MS = 5 * 60 * 1000;

// listUidsWithFlags is chunked so huge folders don't build giant UID sets.
const FLAG_CHUNK_SIZE = 500;

// Stored syncError is a short operator-facing string, not a stack trace.
const MAX_SYNC_ERROR_LENGTH = 500;

// A dropped IMAP session gets one immediate second chance with a fresh
// connection before it counts as a failure — most transport errors here are
// one-off network blips, not outages.
const TRANSPORT_RETRY_DELAY_MS = 2_000;

// Fixed positions for special-use folders; OTHER folders go after them,
// alphabetically from position 10 (plan §3: INBOX=0 → special-use → alphabet).
const SPECIAL_USE_POSITION: Partial<Record<MailSpecialUse, number>> = {
  INBOX: 0,
  SENT: 1,
  DRAFTS: 2,
  TRASH: 3,
  JUNK: 4,
  ARCHIVE: 5,
};

function folderPositions(remoteFolders: RemoteFolder[]): Map<string, number> {
  const positions = new Map<string, number>();
  const others = remoteFolders
    .filter((f) => SPECIAL_USE_POSITION[f.specialUse] === undefined)
    .sort((a, b) => a.name.localeCompare(b.name, "ru"));
  for (const folder of remoteFolders) {
    const special = SPECIAL_USE_POSITION[folder.specialUse];
    positions.set(
      folder.path,
      special !== undefined ? special : 10 + others.indexOf(folder),
    );
  }
  return positions;
}

function toJsonAddresses(
  addresses: RemoteMessage["to"],
): Prisma.InputJsonValue {
  return addresses.map((a) => ({ name: a.name ?? null, address: a.address }));
}

async function insertNewMessages(
  account: MailAccount,
  folder: MailFolder,
  messages: RemoteMessage[],
): Promise<number> {
  if (messages.length === 0) return 0;
  const remoteUids = messages.map((message) => message.uid);
  const remoteMessageIds = messages
    .map((message) => message.messageId)
    .filter((messageId): messageId is string => messageId !== null);

  // Pre-filter by UID plus Message-ID instead of catching P2002 per row — the
  // lease makes concurrent writers impossible, so this is race-free here.
  const existing = await db.mailItem.findMany({
    where: {
      workspaceId: account.workspaceId,
      folderId: folder.id,
      OR: [
        { uid: { in: remoteUids } },
        ...(remoteMessageIds.length > 0
          ? [{ messageId: { in: remoteMessageIds } }]
          : []),
      ],
    },
    select: { uid: true, messageId: true },
  });
  const existingUids = new Set(
    existing
      .map((item) => item.uid)
      .filter((uid): uid is bigint => uid !== null),
  );
  const existingMessageIds = new Set(
    existing
      .map((item) => item.messageId)
      .filter((messageId): messageId is string => messageId !== null),
  );

  let created = 0;
  for (const message of messages) {
    if (existingUids.has(message.uid)) continue;
    if (message.messageId && existingMessageIds.has(message.messageId))
      continue;
    await persistIncomingMail({
      workspaceId: account.workspaceId,
      accountId: account.id,
      folderId: folder.id,
      folderSpecialUse: folder.specialUse,
      uid: message.uid,
      messageId: message.messageId,
      fromAddress: message.from?.address ?? "",
      fromName: message.from?.name ?? null,
      toRecipients: toJsonAddresses(message.to),
      ccRecipients: toJsonAddresses(message.cc),
      subject: message.subject,
      bodyText: message.bodyText,
      bodyHtml: message.bodyHtml,
      bodyTruncated: message.bodyTruncated,
      sourceSizeBytes: message.sourceSizeBytes,
      snippet: message.snippet,
      isRead: message.isRead,
      isAnswered: message.isAnswered,
      isFlagged: message.isFlagged,
      receivedAt: message.date ?? new Date(),
      // Remote parsing is complete before this DB transaction. Only metadata
      // enters persistence; attachment bytes remain lazy-fetched.
      attachments: message.attachments.map((attachment) => ({
        partId: attachment.partId,
        filename: attachment.filename,
        contentType: attachment.contentType,
        sizeBytes: attachment.sizeBytes,
        contentId: attachment.contentId,
        isInline: attachment.isInline,
      })),
    });
    existingUids.add(message.uid);
    created += 1;
  }
  return created;
}

// Flag down-sync + deletion detection, limited to the stored UID window:
// UIDs missing from the server response were deleted/moved remotely.
async function reconcileFlags(
  account: MailAccount,
  folderId: string,
  folderPath: string,
  driver: MailDriver,
): Promise<void> {
  let afterId: string | undefined;
  for (;;) {
    const chunk = await db.mailItem.findMany({
      where: {
        workspaceId: account.workspaceId,
        folderId,
        uid: { not: null },
        ...(afterId ? { id: { gt: afterId } } : {}),
      },
      select: {
        id: true,
        uid: true,
        isRead: true,
        isAnswered: true,
        isFlagged: true,
        hasAttachments: true,
      },
      orderBy: { id: "asc" },
      take: FLAG_CHUNK_SIZE,
    });
    if (chunk.length === 0) break;
    afterId = chunk.at(-1)?.id;
    const remoteFlags = await driver.listUidsWithFlags(
      folderPath,
      chunk.map((item) => item.uid!),
    );
    const deletedIds: string[] = [];
    for (const item of chunk) {
      const flags = remoteFlags.get(item.uid!);
      if (!flags) {
        deletedIds.push(item.id);
        continue;
      }
      if (!item.hasAttachments && flags.attachments.length > 0) {
        await db.$transaction(async (tx) => {
          await tx.mailAttachment.createMany({
            data: flags.attachments.map((attachment) => ({
              mailItemId: item.id,
              partId: attachment.partId,
              filename: attachment.filename,
              contentType: attachment.contentType,
              sizeBytes: attachment.sizeBytes,
              contentId: attachment.contentId,
              isInline: attachment.isInline,
            })),
          });
          await tx.mailItem.updateMany({
            where: {
              id: item.id,
              workspaceId: account.workspaceId,
              hasAttachments: false,
            },
            data: { hasAttachments: true },
          });
        });
      }
      if (
        flags.isRead !== item.isRead ||
        flags.isAnswered !== item.isAnswered ||
        flags.isFlagged !== item.isFlagged
      ) {
        await db.mailItem.updateMany({
          where: { id: item.id, workspaceId: account.workspaceId },
          data: {
            isRead: flags.isRead,
            isAnswered: flags.isAnswered,
            isFlagged: flags.isFlagged,
          },
        });
      }
    }
    if (deletedIds.length > 0) {
      await db.mailItem.deleteMany({
        where: {
          id: { in: deletedIds },
          workspaceId: account.workspaceId,
        },
      });
    }
  }
}

async function syncFolder(
  account: MailAccount,
  remote: RemoteFolder,
  driver: MailDriver,
): Promise<number> {
  const folder = await db.mailFolder.findFirst({
    where: {
      workspaceId: account.workspaceId,
      accountId: account.id,
      path: remote.path,
    },
  });
  if (!folder) return 0; // Deleted between reconcile and here — impossible under the lease.

  // UIDVALIDITY change invalidates every stored UID → wipe and resync from
  // scratch. A null stored validity with existing items is treated the same
  // (we cannot prove the UIDs are still valid).
  let lastSeenUid = folder.lastSeenUid;
  const validityChanged =
    folder.uidValidity === null
      ? (await db.mailItem.count({
          where: {
            workspaceId: account.workspaceId,
            folderId: folder.id,
            uid: { not: null },
          },
        })) > 0
      : folder.uidValidity !== remote.uidValidity;
  if (validityChanged) {
    await db.mailItem.deleteMany({
      where: {
        workspaceId: account.workspaceId,
        folderId: folder.id,
        uid: { not: null },
      },
    });
    lastSeenUid = null;
  }

  let created = 0;
  let cursor = lastSeenUid;
  let firstPage = true;
  for (;;) {
    const messages = await driver.fetchMessages(remote.path, {
      ...(cursor === null ? {} : { afterUid: cursor }),
      ...(firstPage && cursor === null
        ? { initialLimit: env.MAIL_INITIAL_SYNC_LIMIT }
        : {}),
      limit: env.MAIL_SYNC_BATCH_SIZE,
    });
    if (messages.length === 0) break;
    created += await insertNewMessages(account, folder, messages);
    cursor = messages.reduce(
      (max, message) => (message.uid > max ? message.uid : max),
      cursor ?? 0n,
    );
    await db.mailFolder.updateMany({
      where: { id: folder.id, workspaceId: account.workspaceId },
      data: {
        uidValidity: remote.uidValidity,
        lastSeenUid: cursor,
        lastSyncAt: new Date(),
      },
    });
    firstPage = false;
    if (messages.length < env.MAIL_SYNC_BATCH_SIZE) break;
  }

  if (firstPage) {
    await db.mailFolder.updateMany({
      where: { id: folder.id, workspaceId: account.workspaceId },
      data: { uidValidity: remote.uidValidity, lastSyncAt: new Date() },
    });
  }

  await reconcileFlags(account, folder.id, remote.path, driver);
  return created;
}

// Folder list reconciliation: upsert by [accountId, path] (uidValidity and
// lastSeenUid are owned by the per-folder step), delete vanished folders
// (cascade removes their items).
async function reconcileFolders(
  account: MailAccount,
  remoteFolders: RemoteFolder[],
): Promise<void> {
  const positions = folderPositions(remoteFolders);
  for (const remote of remoteFolders) {
    await db.mailFolder.upsert({
      where: {
        accountId_path: { accountId: account.id, path: remote.path },
      },
      create: {
        workspaceId: account.workspaceId,
        accountId: account.id,
        accountWorkspaceId: account.workspaceId,
        path: remote.path,
        name: remote.name,
        delimiter: remote.delimiter,
        specialUse: remote.specialUse,
        position: positions.get(remote.path) ?? 0,
      },
      update: {
        name: remote.name,
        delimiter: remote.delimiter,
        specialUse: remote.specialUse,
        position: positions.get(remote.path) ?? 0,
      },
    });
  }
  await db.mailFolder.deleteMany({
    where: {
      workspaceId: account.workspaceId,
      accountId: account.id,
      path: { notIn: remoteFolders.map((f) => f.path) },
    },
  });
}

// One full transport pass over the account: folder reconciliation + per-folder
// message/flag sync on a freshly connected driver. Idempotent (folders upsert
// by [accountId, path], messages pre-filter by stored UID), so re-running it
// after a dropped connection is safe.
async function runSyncPass(
  account: MailAccount,
): Promise<{ folders: number; newMessages: number }> {
  const driver = await getMailDriver(account);
  try {
    const remoteFolders = await driver.listFolders();
    await reconcileFolders(account, remoteFolders);
    let newMessages = 0;
    for (const remote of remoteFolders) {
      newMessages += await syncFolder(account, remote, driver);
    }
    return { folders: remoteFolders.length, newMessages };
  } finally {
    await driver.close().catch(() => {});
  }
}

// Only errors that came off the wire carry an op — a missing configuration or
// an undecryptable secret is permanent and must not be retried.
function isRetryableTransportError(error: unknown): boolean {
  return error instanceof MailTransportError && error.op !== undefined;
}

async function runSyncPassWithRetry(
  account: MailAccount,
): Promise<{ folders: number; newMessages: number }> {
  try {
    return await runSyncPass(account);
  } catch (error) {
    if (!isRetryableTransportError(error)) throw error;
    await new Promise((resolve) =>
      setTimeout(resolve, TRANSPORT_RETRY_DELAY_MS),
    );
    return runSyncPass(account);
  }
}

export async function syncAccount(
  accountId: string,
  workspaceId: string,
): Promise<SyncOutcome> {
  const account = await db.mailAccount.findFirst({
    where: { id: accountId, workspaceId },
  });
  if (!account) throw new MailAccountNotFoundError(accountId);
  if (account.kind === "WEBHOOK") throw new WebhookAccountHasNoTransportError();
  if (!account.isActive) throw new MailAccountNotFoundError(accountId);

  // Atomic lease: exactly one syncer per account. A stale SYNCING row (lease
  // expired, e.g. crashed process) can be taken over.
  const now = new Date();
  const leased = await db.mailAccount.updateMany({
    where: {
      id: accountId,
      workspaceId,
      kind: "IMAP",
      isActive: true,
      OR: [
        { syncStatus: { not: "SYNCING" } },
        { syncLeaseExpiresAt: { lt: now } },
      ],
    },
    data: {
      syncStatus: "SYNCING",
      syncLeaseExpiresAt: new Date(now.getTime() + LEASE_MS),
    },
  });
  if (leased.count === 0) {
    return { status: "busy" };
  }

  // `account` was read before the lease was taken, so account.syncStatus is
  // the pre-SYNCING status the flip logic needs.
  const previous = {
    syncStatus: account.syncStatus,
    consecutiveSyncFailures: account.consecutiveSyncFailures,
  };

  try {
    const pass = await runSyncPassWithRetry(account);

    const finishedAt = new Date();
    const next = nextMailSyncState(
      previous,
      true,
      env.MAIL_SYNC_FAILURE_THRESHOLD,
    );
    await db.mailAccount.updateMany({
      where: { id: accountId, workspaceId },
      data: {
        syncStatus: next.syncStatus,
        consecutiveSyncFailures: next.consecutiveSyncFailures,
        syncError: null,
        syncLeaseExpiresAt: null,
        lastSyncAt: finishedAt,
        nextSyncAt: new Date(
          finishedAt.getTime() + account.syncIntervalSeconds * 1000,
        ),
      },
    });
    if (next.flipped) {
      alertsService
        .create(account.workspaceId, {
          categoryKey: "mail",
          severity: "info",
          source: account.email,
          messageKey: "system.mailSyncRecovered",
        })
        .catch((err) => {
          // Alert write failed — record it so the lost "sync recovered"
          // notification isn't silently invisible.
          logError(
            account.workspaceId,
            "alerts",
            "Failed to create mail-sync-recovered alert",
            JSON.stringify({
              accountId: account.id,
              transition: "sync_recovered",
              error: err instanceof Error ? err.message : String(err),
            }),
          );
        });
    }
    return {
      status: "synced",
      folders: pass.folders,
      newMessages: pass.newMessages,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // nextSyncAt advances even on failure — no hot-loop retries (plan §3).
    const failedAt = new Date();
    // syncError always records the latest failure, but the ERROR status (and
    // its alert) waits for the failure streak to reach the threshold.
    const next = nextMailSyncState(
      previous,
      false,
      env.MAIL_SYNC_FAILURE_THRESHOLD,
    );
    await db.mailAccount.updateMany({
      where: { id: accountId, workspaceId },
      data: {
        syncStatus: next.syncStatus,
        consecutiveSyncFailures: next.consecutiveSyncFailures,
        syncError: message.slice(0, MAX_SYNC_ERROR_LENGTH),
        syncLeaseExpiresAt: null,
        nextSyncAt: new Date(
          failedAt.getTime() + account.syncIntervalSeconds * 1000,
        ),
      },
    });
    if (next.flipped) {
      alertsService
        .create(account.workspaceId, {
          categoryKey: "mail",
          severity: "critical",
          source: account.email,
          messageKey: "system.mailSyncError",
          messageParams: { error: message.slice(0, 200) },
        })
        .catch((err) => {
          // Alert write failed — record it so the lost "sync failed"
          // notification isn't silently invisible.
          logError(
            account.workspaceId,
            "alerts",
            "Failed to create mail-sync-failed alert",
            JSON.stringify({
              accountId: account.id,
              transition: "sync_failed",
              syncError: message.slice(0, 200),
              error: err instanceof Error ? err.message : String(err),
            }),
          );
        });
    }
    return { status: "error", error: message };
  }
}
