import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";

// Shared write path of the two channel-scoped ingest routes (the original
// {content, author} one and the Discord-compatible one). Both create a
// `Message(origin=WEBHOOK)` and both honour the optional Idempotency-Key, so the
// transaction + P2002 loser-reads-winner dance lives here once.

export interface ChannelWebhookToken {
  id: string;
  workspaceId: string;
  channelId: string;
  name: string;
}

export interface ChannelMessageInput {
  content: string;
  author?: string;
  // Discord extras (specs/discord-webhook-compatibility.md §2.3). Absent for
  // the legacy route, which never writes anything but content/author.
  embeds?: unknown[];
  avatarUrl?: string;
  tts?: boolean;
  flags?: number;
}

export interface CreatedChannelMessage {
  id: string;
  createdAt: Date;
  replay: boolean;
}

function toCreateData(
  token: ChannelWebhookToken,
  input: ChannelMessageInput,
): Prisma.MessageUncheckedCreateInput {
  return {
    workspaceId: token.workspaceId,
    channelId: token.channelId,
    channelWorkspaceId: token.workspaceId,
    content: input.content,
    author: input.author ?? token.name,
    origin: "WEBHOOK",
    ...(input.embeds !== undefined
      ? { embeds: input.embeds as Prisma.InputJsonValue }
      : {}),
    ...(input.avatarUrl !== undefined ? { avatarUrl: input.avatarUrl } : {}),
    ...(input.tts !== undefined ? { tts: input.tts } : {}),
    ...(input.flags !== undefined ? { flags: input.flags } : {}),
  };
}

export async function createChannelMessage(
  token: ChannelWebhookToken,
  input: ChannelMessageInput,
  idempotencyKey: string | null,
): Promise<CreatedChannelMessage> {
  const data = toCreateData(token, input);

  if (!idempotencyKey) {
    const message = await db.message.create({
      data,
      select: { id: true, createdAt: true },
    });
    return { ...message, replay: false };
  }

  try {
    return await db.$transaction(async (tx) => {
      const existing = await tx.idempotencyKey.findUnique({
        where: { tokenId_key: { tokenId: token.id, key: idempotencyKey } },
        select: { targetId: true },
      });
      if (existing) {
        const replayed = await tx.message.findUnique({
          where: { id: existing.targetId },
          select: { id: true, createdAt: true },
        });
        return {
          id: existing.targetId,
          createdAt: replayed?.createdAt ?? new Date(),
          replay: true,
        };
      }

      const message = await tx.message.create({
        data,
        select: { id: true, createdAt: true },
      });
      await tx.idempotencyKey.create({
        data: {
          workspaceId: token.workspaceId,
          tokenId: token.id,
          tokenWorkspaceId: token.workspaceId,
          key: idempotencyKey,
          targetType: "channel-message",
          targetId: message.id,
        },
      });
      return { ...message, replay: false };
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const winner = await db.idempotencyKey.findUnique({
        where: { tokenId_key: { tokenId: token.id, key: idempotencyKey } },
        select: { targetId: true },
      });
      if (winner) {
        const replayed = await db.message.findUnique({
          where: { id: winner.targetId },
          select: { id: true, createdAt: true },
        });
        return {
          id: winner.targetId,
          createdAt: replayed?.createdAt ?? new Date(),
          replay: true,
        };
      }
    }
    throw error;
  }
}

// Bump lastUsedAt without letting a bookkeeping failure fail the delivery.
export async function touchToken(tokenId: string): Promise<void> {
  await db.webhookToken
    .update({ where: { id: tokenId }, data: { lastUsedAt: new Date() } })
    .catch(() => {});
}
