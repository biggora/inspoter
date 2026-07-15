import { db } from "@/lib/db";

// Idempotency-Key lookup/record (architecture.md §3.4, AC-WH-004/AC-WH-010).
// Scoped per token via the @@unique([tokenId, key]) constraint on
// IdempotencyKey.

export async function checkIdempotency(
  tokenId: string,
  key: string,
): Promise<{ duplicate: true; targetId: string } | { duplicate: false }> {
  const existing = await db.idempotencyKey.findUnique({
    where: { tokenId_key: { tokenId, key } },
  });
  if (existing) return { duplicate: true, targetId: existing.targetId };
  return { duplicate: false };
}

export async function recordIdempotency(
  tokenId: string,
  workspaceId: string,
  key: string,
  targetType: string,
  targetId: string,
): Promise<void> {
  await db.idempotencyKey.create({
    data: {
      tokenId,
      workspaceId,
      tokenWorkspaceId: workspaceId,
      key,
      targetType,
      targetId,
    },
  });
}
