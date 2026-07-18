import { db } from "@/lib/db";
import { env } from "@/lib/config/env";
import {
  Prisma,
  type MailAccount,
  type MailSpecialUse,
} from "@/generated/prisma/client";
import {
  getMailDriver,
  WebhookAccountHasNoTransportError,
  type MailDriver,
  type RemoteFolder,
  type RemoteMessage,
} from "@/lib/mail";
import { MailAccountNotFoundError } from "@/lib/services/mail-accounts";

// IMAP sync engine (plan §3 «Движок синхронизации»): lease-locked per-account
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

// Fixed positions for special-use folders; OTHER folders go after them,
// alphabetically from position 10 (plan §3: INBOX=0 → special-use → алфавит).
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
  folderId: string,
  messages: RemoteMessage[],
): Promise<number> {
  if (messages.length === 0) return 0;
  // Pre-filter against stored UIDs instead of catching P2002 per row — the
  // lease makes concurrent writers impossible, so this is race-free here.
  const existing = await db.mailItem.findMany({
    where: {
      workspaceId: account.workspaceId,
      folderId,
      uid: { in: messages.map((m) => m.uid) },
    },
    select: { uid: true },
  });
  const existingUids = new Set(existing.map((item) => item.uid));

  let created = 0;
  for (const message of messages) {
    if (existingUids.has(message.uid)) continue;
    await db.mailItem.create({
      data: {
        workspaceId: account.workspaceId,
        accountId: account.id,
        accountWorkspaceId: account.workspaceId,
        folderId,
        folderWorkspaceId: account.workspaceId,
        uid: message.uid,
        messageId: message.messageId,
        fromAddress: message.from?.address ?? "",
        fromName: message.from?.name ?? null,
        toRecipients: toJsonAddresses(message.to),
        ccRecipients: toJsonAddresses(message.cc),
        subject: message.subject,
        bodyText: message.bodyText,
        bodyHtml: message.bodyHtml,
        snippet: message.snippet,
        isRead: message.isRead,
        isAnswered: message.isAnswered,
        isFlagged: message.isFlagged,
        hasAttachments: message.attachments.length > 0,
        receivedAt: message.date ?? new Date(),
        // Metadata-only attachment rows — content is fetched lazily from
        // IMAP on first download (plan §1).
        attachments: {
          createMany: {
            data: message.attachments.map((a) => ({
              partId: a.partId,
              filename: a.filename,
              contentType: a.contentType,
              sizeBytes: a.sizeBytes,
              contentId: a.contentId,
              isInline: a.isInline,
            })),
          },
        },
      },
    });
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
  const stored = await db.mailItem.findMany({
    where: { workspaceId: account.workspaceId, folderId, uid: { not: null } },
    select: {
      id: true,
      uid: true,
      isRead: true,
      isAnswered: true,
      isFlagged: true,
    },
  });

  const deletedIds: string[] = [];
  for (let i = 0; i < stored.length; i += FLAG_CHUNK_SIZE) {
    const chunk = stored.slice(i, i + FLAG_CHUNK_SIZE);
    const remoteFlags = await driver.listUidsWithFlags(
      folderPath,
      chunk.map((item) => item.uid!),
    );
    for (const item of chunk) {
      const flags = remoteFlags.get(item.uid!);
      if (!flags) {
        deletedIds.push(item.id);
        continue;
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
  }
  if (deletedIds.length > 0) {
    await db.mailItem.deleteMany({
      where: { id: { in: deletedIds }, workspaceId: account.workspaceId },
    });
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
          where: { workspaceId: account.workspaceId, folderId: folder.id },
        })) > 0
      : folder.uidValidity !== remote.uidValidity;
  if (validityChanged) {
    await db.mailItem.deleteMany({
      where: { workspaceId: account.workspaceId, folderId: folder.id },
    });
    lastSeenUid = null;
  }

  const messages =
    lastSeenUid === null
      ? await driver.fetchMessages(remote.path, {
          initialLimit: env.MAIL_INITIAL_SYNC_LIMIT,
        })
      : await driver.fetchMessages(remote.path, { afterUid: lastSeenUid });

  const created = await insertNewMessages(account, folder.id, messages);

  const maxUid = messages.reduce(
    (max, m) => (m.uid > max ? m.uid : max),
    lastSeenUid ?? 0n,
  );
  await db.mailFolder.updateMany({
    where: { id: folder.id, workspaceId: account.workspaceId },
    data: {
      uidValidity: remote.uidValidity,
      lastSeenUid: maxUid > 0n ? maxUid : null,
      lastSyncAt: new Date(),
    },
  });

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

  try {
    const driver = await getMailDriver(account);
    let newMessages = 0;
    let remoteFolders: RemoteFolder[];
    try {
      remoteFolders = await driver.listFolders();
      await reconcileFolders(account, remoteFolders);
      for (const remote of remoteFolders) {
        newMessages += await syncFolder(account, remote, driver);
      }
    } finally {
      await driver.close().catch(() => {});
    }

    const finishedAt = new Date();
    await db.mailAccount.updateMany({
      where: { id: accountId, workspaceId },
      data: {
        syncStatus: "IDLE",
        syncError: null,
        syncLeaseExpiresAt: null,
        lastSyncAt: finishedAt,
        nextSyncAt: new Date(
          finishedAt.getTime() + account.syncIntervalSeconds * 1000,
        ),
      },
    });
    return {
      status: "synced",
      folders: remoteFolders.length,
      newMessages,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // nextSyncAt advances even on failure — no hot-loop retries (plan §3).
    const failedAt = new Date();
    await db.mailAccount.updateMany({
      where: { id: accountId, workspaceId },
      data: {
        syncStatus: "ERROR",
        syncError: message.slice(0, MAX_SYNC_ERROR_LENGTH),
        syncLeaseExpiresAt: null,
        nextSyncAt: new Date(
          failedAt.getTime() + account.syncIntervalSeconds * 1000,
        ),
      },
    });
    return { status: "error", error: message };
  }
}
