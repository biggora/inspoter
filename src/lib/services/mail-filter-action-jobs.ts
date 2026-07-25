import { randomUUID } from "node:crypto";

import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { getMailDriver } from "@/lib/mail";

export const MAIL_FILTER_ACTION_JOB_LEASE_MS = 2 * 60 * 1000;
export const MAIL_FILTER_ACTION_JOB_MAX_ATTEMPTS = 3;

const LEASE_EXPIRED_ERROR = "Worker lease expired.";
const MAX_ERROR_LENGTH = 1_000;
const BACKOFF_MS = [60_000, 5 * 60_000, 15 * 60_000] as const;

export interface EnqueueMailFilterActionsInput {
  workspaceId: string;
  accountId: string;
  mailItemId: string;
  sourceRuleId: string;
  sourceRunId?: string;
  setRead?: boolean | null;
  moveToFolderId?: string | null;
  currentIsRead: boolean;
  currentFolderId: string;
}

export interface ClaimedMailFilterActionJob {
  id: string;
  leaseToken: string;
}

export interface MailFilterActionJobRuntime {
  now: () => Date;
  leaseToken: () => string;
}

const DEFAULT_RUNTIME: MailFilterActionJobRuntime = {
  now: () => new Date(),
  leaseToken: randomUUID,
};

export class MailFilterActionJobLeaseLostError extends Error {
  constructor() {
    super("The mail-filter action lease is no longer owned by this worker.");
    this.name = "MailFilterActionJobLeaseLostError";
  }
}

export class MailFilterActionJobPermanentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MailFilterActionJobPermanentError";
  }
}

function idempotencyScope(input: EnqueueMailFilterActionsInput): string {
  return input.sourceRunId
    ? `run:${input.sourceRunId}`
    : `live:${input.sourceRuleId}`;
}

export async function enqueueMailFilterActionJobs(
  tx: Prisma.TransactionClient,
  input: EnqueueMailFilterActionsInput,
): Promise<number> {
  const scope = idempotencyScope(input);
  const jobs: Prisma.MailFilterActionJobCreateManyInput[] = [];

  if (input.setRead != null && input.setRead !== input.currentIsRead) {
    jobs.push({
      workspaceId: input.workspaceId,
      accountId: input.accountId,
      accountWorkspaceId: input.workspaceId,
      mailItemId: input.mailItemId,
      mailItemWorkspaceId: input.workspaceId,
      sourceRuleId: input.sourceRuleId,
      sourceRunId: input.sourceRunId,
      type: "SET_READ",
      readValue: input.setRead,
      idempotencyKey: `${scope}:${input.mailItemId}:set-read`,
      maxAttempts: MAIL_FILTER_ACTION_JOB_MAX_ATTEMPTS,
    });
  }

  if (input.moveToFolderId && input.moveToFolderId !== input.currentFolderId) {
    jobs.push({
      workspaceId: input.workspaceId,
      accountId: input.accountId,
      accountWorkspaceId: input.workspaceId,
      mailItemId: input.mailItemId,
      mailItemWorkspaceId: input.workspaceId,
      sourceRuleId: input.sourceRuleId,
      sourceRunId: input.sourceRunId,
      type: "MOVE_TO_FOLDER",
      targetFolderId: input.moveToFolderId,
      idempotencyKey: `${scope}:${input.mailItemId}:move`,
      maxAttempts: MAIL_FILTER_ACTION_JOB_MAX_ATTEMPTS,
    });
  }

  if (jobs.length === 0) return 0;
  const created = await tx.mailFilterActionJob.createMany({
    data: jobs,
    skipDuplicates: true,
  });
  return created.count;
}

function sanitizeWorkerError(error: unknown): string {
  const raw =
    error instanceof Error ? error.message : "Mail-filter action failed.";
  return raw.replace(/[\r\n\t]+/gu, " ").slice(0, MAX_ERROR_LENGTH);
}

function leaseExpiry(now: Date): Date {
  return new Date(now.getTime() + MAIL_FILTER_ACTION_JOB_LEASE_MS);
}

export async function claimMailFilterActionJobs(
  limit: number,
  runtime: MailFilterActionJobRuntime = DEFAULT_RUNTIME,
): Promise<ClaimedMailFilterActionJob[]> {
  if (limit <= 0) return [];
  const now = runtime.now();
  const candidates = await db.mailFilterActionJob.findMany({
    where: {
      OR: [
        { status: "PENDING", nextAttemptAt: { lte: now } },
        { status: "RUNNING", leaseExpiresAt: { lte: now } },
      ],
    },
    select: {
      id: true,
      accountId: true,
      status: true,
      attempts: true,
      maxAttempts: true,
      leaseToken: true,
      leaseExpiresAt: true,
      startedAt: true,
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: Math.max(limit * 5, limit),
  });

  const claimed: ClaimedMailFilterActionJob[] = [];
  for (const candidate of candidates) {
    if (claimed.length >= limit) break;

    const head = await db.mailFilterActionJob.findFirst({
      where: {
        accountId: candidate.accountId,
        status: { in: ["PENDING", "RUNNING"] },
      },
      select: { id: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    if (head?.id !== candidate.id) continue;

    const expired = candidate.status === "RUNNING";
    const attempts = candidate.attempts + (expired ? 1 : 0);
    if (expired && attempts >= candidate.maxAttempts) {
      await db.mailFilterActionJob.updateMany({
        where: {
          id: candidate.id,
          status: "RUNNING",
          leaseToken: candidate.leaseToken,
          leaseExpiresAt: candidate.leaseExpiresAt,
        },
        data: {
          status: "FAILED",
          attempts: candidate.maxAttempts,
          lastError: LEASE_EXPIRED_ERROR,
          leaseToken: null,
          leaseExpiresAt: null,
          completedAt: now,
        },
      });
      continue;
    }

    const token = runtime.leaseToken();
    const updated = await db.mailFilterActionJob.updateMany({
      where:
        candidate.status === "PENDING"
          ? { id: candidate.id, status: "PENDING" }
          : {
              id: candidate.id,
              status: "RUNNING",
              leaseToken: candidate.leaseToken,
              leaseExpiresAt: candidate.leaseExpiresAt,
            },
      data: {
        status: "RUNNING",
        attempts,
        ...(expired ? { lastError: LEASE_EXPIRED_ERROR } : {}),
        leaseToken: token,
        leaseExpiresAt: leaseExpiry(now),
        ...(candidate.startedAt === null ? { startedAt: now } : {}),
      },
    });
    if (updated.count === 1) {
      claimed.push({ id: candidate.id, leaseToken: token });
    }
  }
  return claimed;
}

export async function recordMailFilterActionJobFailure(
  claim: ClaimedMailFilterActionJob,
  error: unknown,
  runtime: Pick<MailFilterActionJobRuntime, "now"> = DEFAULT_RUNTIME,
): Promise<void> {
  const now = runtime.now();
  await db.$transaction(async (tx) => {
    const job = await tx.mailFilterActionJob.findFirst({
      where: {
        id: claim.id,
        status: "RUNNING",
        leaseToken: claim.leaseToken,
        leaseExpiresAt: { gt: now },
      },
      select: { attempts: true, maxAttempts: true },
    });
    if (!job) return;

    const attempts = Math.min(job.attempts + 1, job.maxAttempts);
    const failed =
      error instanceof MailFilterActionJobPermanentError ||
      attempts >= job.maxAttempts;
    await tx.mailFilterActionJob.updateMany({
      where: {
        id: claim.id,
        status: "RUNNING",
        leaseToken: claim.leaseToken,
        leaseExpiresAt: { gt: now },
      },
      data: {
        status: failed ? "FAILED" : "PENDING",
        attempts,
        lastError: sanitizeWorkerError(error),
        leaseToken: null,
        leaseExpiresAt: null,
        nextAttemptAt: failed
          ? now
          : new Date(
              now.getTime() +
                BACKOFF_MS[Math.min(attempts - 1, BACKOFF_MS.length - 1)],
            ),
        ...(failed ? { completedAt: now } : {}),
      },
    });
  });
}

export async function processClaimedMailFilterActionJob(
  claim: ClaimedMailFilterActionJob,
  runtime: Pick<MailFilterActionJobRuntime, "now"> = DEFAULT_RUNTIME,
): Promise<void> {
  const startedAt = runtime.now();
  const job = await db.mailFilterActionJob.findFirst({
    where: {
      id: claim.id,
      status: "RUNNING",
      leaseToken: claim.leaseToken,
      leaseExpiresAt: { gt: startedAt },
    },
    select: {
      id: true,
      workspaceId: true,
      accountId: true,
      type: true,
      readValue: true,
      targetFolderId: true,
      attempts: true,
      mailItem: {
        select: {
          id: true,
          workspaceId: true,
          accountId: true,
          folderId: true,
          uid: true,
          account: true,
          folder: { select: { path: true } },
        },
      },
    },
  });
  if (!job) throw new MailFilterActionJobLeaseLostError();

  const item = job.mailItem;
  if (
    item.workspaceId !== job.workspaceId ||
    item.accountId !== job.accountId
  ) {
    throw new MailFilterActionJobPermanentError(
      "Mail action item scope is invalid.",
    );
  }

  const target =
    job.type === "MOVE_TO_FOLDER" && job.targetFolderId
      ? await db.mailFolder.findFirst({
          where: {
            id: job.targetFolderId,
            workspaceId: job.workspaceId,
            accountId: job.accountId,
          },
          select: { id: true, path: true },
        })
      : null;
  if (job.type === "MOVE_TO_FOLDER" && !target) {
    throw new MailFilterActionJobPermanentError(
      "Mail action target folder is unavailable.",
    );
  }

  let destinationUid: bigint | null = null;
  if (item.account.kind === "IMAP" && item.uid !== null) {
    const driver = await getMailDriver(item.account);
    try {
      if (job.type === "SET_READ") {
        if (job.readValue === null) {
          throw new MailFilterActionJobPermanentError(
            "Mail action read value is missing.",
          );
        }
        await driver.setSeen(item.folder.path, item.uid, job.readValue);
      } else {
        const moved = await driver.move(
          item.folder.path,
          item.uid,
          target!.path,
        );
        if (!moved.moved && job.attempts === 0) {
          throw new Error("Source message was not available for move.");
        }
        destinationUid = moved.destinationUid;
      }
    } finally {
      await driver.close().catch(() => {});
    }
  }

  const completedAt = runtime.now();
  await db.$transaction(async (tx) => {
    const owned = await tx.mailFilterActionJob.findFirst({
      where: {
        id: claim.id,
        status: "RUNNING",
        leaseToken: claim.leaseToken,
        leaseExpiresAt: { gt: completedAt },
      },
      select: { id: true },
    });
    if (!owned) throw new MailFilterActionJobLeaseLostError();

    if (job.type === "SET_READ") {
      if (job.readValue === null) {
        throw new MailFilterActionJobPermanentError(
          "Mail action read value is missing.",
        );
      }
      await tx.mailItem.updateMany({
        where: { id: item.id, workspaceId: job.workspaceId },
        data: { isRead: job.readValue },
      });
    } else {
      await tx.mailItem.updateMany({
        where: { id: item.id, workspaceId: job.workspaceId },
        data: {
          folderId: target!.id,
          folderWorkspaceId: job.workspaceId,
          uid: destinationUid,
        },
      });
    }

    const completed = await tx.mailFilterActionJob.updateMany({
      where: {
        id: claim.id,
        status: "RUNNING",
        leaseToken: claim.leaseToken,
        leaseExpiresAt: { gt: completedAt },
      },
      data: {
        status: "COMPLETED",
        attempts: 0,
        lastError: null,
        leaseToken: null,
        leaseExpiresAt: null,
        completedAt,
      },
    });
    if (completed.count !== 1) throw new MailFilterActionJobLeaseLostError();
  });
}
