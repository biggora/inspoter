import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { Prisma } from "@/generated/prisma/client";
import { env } from "@/lib/config/env";
import { db } from "@/lib/db";

const DIRECT_CLIENT = "direct-client";
const CLEANUP_BATCH_SIZE = 500;

function bucketKey(scope: "ip" | "username", value: string): string {
  return createHash("sha256").update(`${scope}:${value}`).digest("hex");
}

export function normalizeLoginUsername(username: string): string {
  return username.normalize("NFKC").trim().toLocaleLowerCase("en-US");
}

async function clientKey(): Promise<string> {
  if (!env.LOGIN_TRUST_PROXY) return DIRECT_CLIENT;
  try {
    const requestHeaders = await headers();
    return (
      requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      requestHeaders.get("x-real-ip")?.trim() ||
      DIRECT_CLIENT
    );
  } catch {
    return DIRECT_CLIENT;
  }
}

async function consumeBucket(
  tx: Prisma.TransactionClient,
  key: string,
  limit: number,
  now: Date,
): Promise<boolean> {
  const cutoff = new Date(now.getTime() - env.LOGIN_RATE_WINDOW_MS);
  const rows = await tx.$queryRaw<Array<{ count: number }>>`
    INSERT INTO "LoginRateLimitBucket" (
      "key", "count", "windowStartedAt", "updatedAt"
    ) VALUES (${key}, 1, ${now}, ${now})
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE
        WHEN "LoginRateLimitBucket"."windowStartedAt" <= ${cutoff} THEN 1
        ELSE "LoginRateLimitBucket"."count" + 1
      END,
      "windowStartedAt" = CASE
        WHEN "LoginRateLimitBucket"."windowStartedAt" <= ${cutoff} THEN ${now}
        ELSE "LoginRateLimitBucket"."windowStartedAt"
      END,
      "updatedAt" = ${now}
    RETURNING "count"
  `;
  return (rows[0]?.count ?? limit + 1) <= limit;
}

export async function consumeLoginAttempt(
  username: string,
): Promise<{ allowed: boolean; usernameKey: string }> {
  const now = new Date();
  const usernameKey = bucketKey("username", normalizeLoginUsername(username));
  const ipKey = bucketKey("ip", await clientKey());
  const allowed = await db.$transaction(async (tx) => {
    const ipAllowed = await consumeBucket(
      tx,
      ipKey,
      env.LOGIN_RATE_LIMIT_IP,
      now,
    );
    const usernameAllowed = await consumeBucket(
      tx,
      usernameKey,
      env.LOGIN_RATE_LIMIT_USERNAME,
      now,
    );
    await tx.$executeRaw`
      DELETE FROM "LoginRateLimitBucket"
      WHERE "key" IN (
        SELECT "key" FROM "LoginRateLimitBucket"
        WHERE "windowStartedAt" < ${new Date(now.getTime() - env.LOGIN_RATE_WINDOW_MS * 2)}
        LIMIT ${CLEANUP_BATCH_SIZE}
      )
    `;
    return ipAllowed && usernameAllowed;
  });
  return { allowed, usernameKey };
}

export async function clearLoginUsernameBucket(key: string): Promise<void> {
  await db.loginRateLimitBucket.deleteMany({ where: { key } });
}
