import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";

export type MailAccountTransactionRunner = <T>(
  accountId: string,
  operation: (tx: Prisma.TransactionClient) => Promise<T>,
) => Promise<T>;

export async function acquireMailAdvisoryLock(
  tx: Prisma.TransactionClient,
  scope: "account" | "workspace-labels",
  id: string,
): Promise<void> {
  const key = `inspoter:mail:${scope}:${id}`;
  await tx.$queryRaw`
    SELECT 1::integer AS "acquired"
    FROM (SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))) AS "lock"
  `;
}

/** Shared transaction boundary for rule mutations and eligible persistence. */
export const runMailAccountTransaction: MailAccountTransactionRunner = async (
  accountId,
  operation,
) =>
  db.$transaction(async (tx) => {
    await acquireMailAdvisoryLock(tx, "account", accountId);
    return operation(tx);
  });
