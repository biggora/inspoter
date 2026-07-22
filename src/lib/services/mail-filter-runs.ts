import { randomUUID } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { env } from "@/lib/config/env";
import { db } from "@/lib/db";
import { matchesMailFilter } from "@/lib/mail-filter-matcher";
import { requireWorkspaceOwner } from "@/lib/services/workspace-auth";

export const MAIL_FILTER_RUN_BATCH_SIZE = 200;
export const MAIL_FILTER_RUN_LEASE_MS = 5 * 60 * 1000;
export const MAIL_FILTER_RUN_MAX_FAILURES = 3;

const LEASE_EXPIRED_ERROR = "Worker lease expired.";
const MAX_ERROR_LENGTH = 1_000;

export const MAIL_FILTER_RUN_DTO_SELECT = {
  id: true,
  sourceRuleId: true,
  status: true,
  processedCount: true,
  matchedCount: true,
  attempts: true,
  lastError: true,
  startedAt: true,
  completedAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.MailFilterRunSelect;

export type MailFilterRunDtoRow = Prisma.MailFilterRunGetPayload<{
  select: typeof MAIL_FILTER_RUN_DTO_SELECT;
}>;

export function toMailFilterRunDto(run: MailFilterRunDtoRow) {
  const { sourceRuleId, lastError, ...rest } = run;
  return {
    ...rest,
    ruleId: sourceRuleId,
    errorCode:
      lastError === null
        ? null
        : lastError === LEASE_EXPIRED_ERROR
          ? "FILTER_RUN_LEASE_EXPIRED"
          : "FILTER_RUN_ATTEMPT_FAILED",
  };
}

export class MailFilterRunResourceNotFoundError extends Error {
  readonly code = "RESOURCE_NOT_FOUND";

  constructor() {
    super("Resource not found.");
    this.name = "MailFilterRunResourceNotFoundError";
  }
}

export class MailFilterRunRetryConflictError extends Error {
  readonly code = "FILTER_RUN_NOT_RETRYABLE";

  constructor() {
    super("Only a failed filter run can be retried.");
    this.name = "MailFilterRunRetryConflictError";
  }
}

export class MailFilterRunLeaseLostError extends Error {
  readonly code = "FILTER_RUN_LEASE_LOST";

  constructor() {
    super("The filter-run lease is no longer owned by this worker.");
    this.name = "MailFilterRunLeaseLostError";
  }
}

export interface MailFilterRunSnapshot {
  id: string;
  accountId: string;
  labelId: string;
  fromAddress: string | null;
  subjectContains: string | null;
}

export interface ClaimedMailFilterRun {
  id: string;
  leaseToken: string;
}

export interface MailFilterRunRuntime {
  now: () => Date;
  leaseToken: () => string;
}

const DEFAULT_RUNTIME: MailFilterRunRuntime = {
  now: () => new Date(),
  leaseToken: randomUUID,
};

function sanitizeWorkerError(error: unknown): string {
  const raw = error instanceof Error ? error.message : "Filter run failed.";
  return raw.replace(/[\r\n\t]+/gu, " ").slice(0, MAX_ERROR_LENGTH);
}

function leaseExpiry(now: Date): Date {
  return new Date(now.getTime() + MAIL_FILTER_RUN_LEASE_MS);
}

export async function createMailFilterRunInTransaction(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  rule: MailFilterRunSnapshot,
  now = new Date(),
) {
  const cutoff = await tx.mailItem.findFirst({
    where: {
      workspaceId,
      accountId: rule.accountId,
      folder: { specialUse: "INBOX" },
    },
    select: { createdAt: true, id: true },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });

  const completed = cutoff === null;
  const created = await tx.mailFilterRun.create({
    data: {
      workspaceId,
      ruleId: rule.id,
      ruleWorkspaceId: workspaceId,
      sourceRuleId: rule.id,
      snapshotAccountId: rule.accountId,
      snapshotLabelId: rule.labelId,
      snapshotFromAddress: rule.fromAddress,
      snapshotSubjectContains: rule.subjectContains,
      cutoffCreatedAt: cutoff?.createdAt,
      cutoffId: cutoff?.id,
      status: completed ? "COMPLETED" : "PENDING",
      ...(completed ? { startedAt: now, completedAt: now } : {}),
    },
    select: MAIL_FILTER_RUN_DTO_SELECT,
  });
  return toMailFilterRunDto(created);
}

export async function getMailFilterRun(
  workspaceId: string,
  operatorId: string,
  id: string,
) {
  const run = await db.mailFilterRun.findFirst({
    where: { id, workspaceId },
    select: MAIL_FILTER_RUN_DTO_SELECT,
  });
  if (!run) throw new MailFilterRunResourceNotFoundError();
  await requireWorkspaceOwner(workspaceId, operatorId);
  return toMailFilterRunDto(run);
}

export async function retryMailFilterRun(
  workspaceId: string,
  operatorId: string,
  id: string,
) {
  const scoped = await db.mailFilterRun.findFirst({
    where: { id, workspaceId },
    select: { id: true, status: true },
  });
  if (!scoped) throw new MailFilterRunResourceNotFoundError();
  await requireWorkspaceOwner(workspaceId, operatorId);
  if (scoped.status !== "FAILED") throw new MailFilterRunRetryConflictError();

  const updated = await db.mailFilterRun.updateMany({
    where: { id, workspaceId, status: "FAILED" },
    data: {
      status: "PENDING",
      attempts: 0,
      lastError: null,
      leaseToken: null,
      leaseExpiresAt: null,
      completedAt: null,
    },
  });
  if (updated.count !== 1) throw new MailFilterRunRetryConflictError();
  return getMailFilterRun(workspaceId, operatorId, id);
}

export async function claimMailFilterRuns(
  limit: number,
  runtime: MailFilterRunRuntime = DEFAULT_RUNTIME,
): Promise<ClaimedMailFilterRun[]> {
  if (!env.MAIL_LABELS_ENABLED || limit <= 0) return [];
  const now = runtime.now();
  const candidates = await db.mailFilterRun.findMany({
    where: {
      OR: [
        { status: "PENDING" },
        { status: "RUNNING", leaseExpiresAt: { lte: now } },
      ],
    },
    select: {
      id: true,
      status: true,
      attempts: true,
      startedAt: true,
      leaseToken: true,
      leaseExpiresAt: true,
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: Math.max(limit * 3, limit),
  });

  const claimed: ClaimedMailFilterRun[] = [];
  for (const candidate of candidates) {
    if (claimed.length >= limit) break;
    const expired = candidate.status === "RUNNING";
    const attempts = candidate.attempts + (expired ? 1 : 0);

    if (expired && attempts >= MAIL_FILTER_RUN_MAX_FAILURES) {
      await db.mailFilterRun.updateMany({
        where: {
          id: candidate.id,
          status: "RUNNING",
          leaseToken: candidate.leaseToken,
          leaseExpiresAt: candidate.leaseExpiresAt,
        },
        data: {
          status: "FAILED",
          attempts: MAIL_FILTER_RUN_MAX_FAILURES,
          lastError: LEASE_EXPIRED_ERROR,
          leaseToken: null,
          leaseExpiresAt: null,
          completedAt: now,
        },
      });
      continue;
    }

    const token = runtime.leaseToken();
    const result = await db.mailFilterRun.updateMany({
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
    if (result.count === 1)
      claimed.push({ id: candidate.id, leaseToken: token });
  }
  return claimed;
}

export async function renewMailFilterRunLease(
  claim: ClaimedMailFilterRun,
  runtime: Pick<MailFilterRunRuntime, "now"> = DEFAULT_RUNTIME,
): Promise<boolean> {
  const now = runtime.now();
  const result = await db.mailFilterRun.updateMany({
    where: {
      id: claim.id,
      status: "RUNNING",
      leaseToken: claim.leaseToken,
      leaseExpiresAt: { gt: now },
    },
    data: { leaseExpiresAt: leaseExpiry(now) },
  });
  return result.count === 1;
}

export async function recordMailFilterRunFailure(
  claim: ClaimedMailFilterRun,
  error: unknown,
  runtime: Pick<MailFilterRunRuntime, "now"> = DEFAULT_RUNTIME,
): Promise<void> {
  const now = runtime.now();
  await db.$transaction(async (tx) => {
    const run = await tx.mailFilterRun.findFirst({
      where: {
        id: claim.id,
        status: "RUNNING",
        leaseToken: claim.leaseToken,
        leaseExpiresAt: { gt: now },
      },
      select: { attempts: true },
    });
    if (!run) return;
    const attempts = Math.min(run.attempts + 1, MAIL_FILTER_RUN_MAX_FAILURES);
    const failed = attempts >= MAIL_FILTER_RUN_MAX_FAILURES;
    await tx.mailFilterRun.updateMany({
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
        ...(failed ? { completedAt: now } : {}),
      },
    });
  });
}

export async function processMailFilterRunBatchInTransaction(
  tx: Prisma.TransactionClient,
  claim: ClaimedMailFilterRun,
  now: Date,
): Promise<"RUNNING" | "COMPLETED"> {
  const run = await tx.mailFilterRun.findFirst({
    where: {
      id: claim.id,
      status: "RUNNING",
      leaseToken: claim.leaseToken,
      leaseExpiresAt: { gt: now },
    },
    select: {
      workspaceId: true,
      snapshotAccountId: true,
      snapshotLabelId: true,
      snapshotFromAddress: true,
      snapshotSubjectContains: true,
      cutoffCreatedAt: true,
      cutoffId: true,
      cursorCreatedAt: true,
      cursorId: true,
    },
  });
  if (!run || !run.cutoffCreatedAt || !run.cutoffId) {
    throw new MailFilterRunLeaseLostError();
  }

  const lowerBound: Prisma.MailItemWhereInput | undefined =
    run.cursorCreatedAt && run.cursorId
      ? {
          OR: [
            { createdAt: { gt: run.cursorCreatedAt } },
            { createdAt: run.cursorCreatedAt, id: { gt: run.cursorId } },
          ],
        }
      : undefined;
  const upperBound: Prisma.MailItemWhereInput = {
    OR: [
      { createdAt: { lt: run.cutoffCreatedAt } },
      { createdAt: run.cutoffCreatedAt, id: { lte: run.cutoffId } },
    ],
  };
  const rows = await tx.mailItem.findMany({
    where: {
      AND: [
        {
          workspaceId: run.workspaceId,
          accountId: run.snapshotAccountId,
          folder: { specialUse: "INBOX" },
        },
        ...(lowerBound ? [lowerBound] : []),
        upperBound,
      ],
    },
    select: { id: true, createdAt: true, fromAddress: true, subject: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: MAIL_FILTER_RUN_BATCH_SIZE,
  });

  const matched = rows.filter((row) =>
    matchesMailFilter(
      {
        fromAddress: run.snapshotFromAddress,
        subjectContains: run.snapshotSubjectContains,
      },
      row,
    ),
  );
  if (matched.length > 0) {
    await tx.mailItemLabel.createMany({
      data: matched.map((row) => ({
        workspaceId: run.workspaceId,
        mailItemId: row.id,
        mailItemWorkspaceId: run.workspaceId,
        labelId: run.snapshotLabelId,
        labelWorkspaceId: run.workspaceId,
      })),
      skipDuplicates: true,
    });
  }

  const completed = rows.length < MAIL_FILTER_RUN_BATCH_SIZE;
  const last = rows.at(-1);
  const result = await tx.mailFilterRun.updateMany({
    where: {
      id: claim.id,
      status: "RUNNING",
      leaseToken: claim.leaseToken,
      leaseExpiresAt: { gt: now },
    },
    data: {
      processedCount: { increment: rows.length },
      matchedCount: { increment: matched.length },
      ...(last ? { cursorCreatedAt: last.createdAt, cursorId: last.id } : {}),
      attempts: 0,
      lastError: null,
      ...(completed
        ? {
            status: "COMPLETED",
            leaseToken: null,
            leaseExpiresAt: null,
            completedAt: now,
          }
        : { leaseExpiresAt: leaseExpiry(now) }),
    },
  });
  if (result.count !== 1) throw new MailFilterRunLeaseLostError();
  return completed ? "COMPLETED" : "RUNNING";
}

export async function processClaimedMailFilterRunBatch(
  claim: ClaimedMailFilterRun,
  runtime: Pick<MailFilterRunRuntime, "now"> = DEFAULT_RUNTIME,
): Promise<"RUNNING" | "COMPLETED"> {
  const now = runtime.now();
  return db.$transaction((tx) =>
    processMailFilterRunBatchInTransaction(tx, claim, now),
  );
}
