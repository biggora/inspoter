import { db } from "@/lib/db";
import { env } from "@/lib/config/env";
import {
  Prisma,
  type MessageCategory,
  type Channel,
  type Message,
  type MessageOrigin,
} from "@/generated/prisma/client";
import { emitWebhookEvent } from "@/lib/services/webhook-events";

export type CategoryWithChannels = MessageCategory & { channels: Channel[] };

export type ChannelWithUnread = Channel & { unreadCount: number };
export type CategoryWithUnread = MessageCategory & {
  channels: ChannelWithUnread[];
};

export interface ListMessagesParams {
  cursor?: string;
  pageSize?: number;
  sort?: "asc" | "desc";
}

export interface ListMessagesResult {
  items: Message[];
  nextCursor: string | null;
}

interface Cursor {
  w: string;
  t: string;
  id: string;
}

function encodeCursor(
  workspaceId: string,
  entry: Pick<Message, "createdAt" | "id">,
): string {
  return Buffer.from(
    JSON.stringify({
      w: workspaceId,
      t: entry.createdAt.toISOString(),
      id: entry.id,
    }),
  ).toString("base64url");
}

function decodeCursor(cursor: string): Cursor | null {
  try {
    const p = JSON.parse(
      Buffer.from(cursor, "base64url").toString("utf-8"),
    ) as Partial<Cursor>;
    return typeof p.w === "string" &&
      typeof p.t === "string" &&
      typeof p.id === "string"
      ? { w: p.w, t: p.t, id: p.id }
      : null;
  } catch {
    return null;
  }
}

export async function listCategories(
  workspaceId: string,
): Promise<CategoryWithChannels[]> {
  return db.messageCategory.findMany({
    where: { workspaceId },
    include: { channels: { orderBy: { name: "asc" } } },
    orderBy: { name: "asc" },
  });
}

// Same list, plus the per-channel unread count the sidebar badges. Kept
// separate from listCategories() because the other four callers only need the
// tree to authorize a channel id and should not pay for the aggregate.
// The groupBy + Map join mirrors listFoldersForAccount() in mail-accounts.ts.
export async function listCategoriesWithUnread(
  workspaceId: string,
): Promise<CategoryWithUnread[]> {
  const [categories, unreadCounts] = await Promise.all([
    listCategories(workspaceId),
    db.message.groupBy({
      by: ["channelId"],
      where: { workspaceId, isRead: false },
      _count: true,
    }),
  ]);
  const unreadByChannel = new Map(
    unreadCounts.map((row) => [row.channelId, row._count]),
  );

  return categories.map((category) => ({
    ...category,
    channels: category.channels.map((channel) => ({
      ...channel,
      unreadCount: unreadByChannel.get(channel.id) ?? 0,
    })),
  }));
}

/**
 * Clears one channel's unread messages. Called when the channel is opened —
 * per channel rather than per section, so opening channel A does not silently
 * mark channels B..E as seen.
 */
export async function markChannelRead(
  workspaceId: string,
  channelId: string,
): Promise<{ updated: number }> {
  const result = await db.message.updateMany({
    where: { workspaceId, channelId, isRead: false },
    data: { isRead: true },
  });
  return { updated: result.count };
}

export async function createCategory(
  workspaceId: string,
  name: string,
): Promise<MessageCategory> {
  return db.messageCategory.create({ data: { name, workspaceId } });
}

export async function renameCategory(
  id: string,
  workspaceId: string,
  name: string,
): Promise<MessageCategory> {
  return db.messageCategory.update({
    where: { id, workspaceId },
    data: { name },
  });
}

export async function deleteCategory(
  id: string,
  workspaceId: string,
): Promise<void> {
  await db.messageCategory.delete({ where: { id, workspaceId } });
}

export async function createChannel(
  workspaceId: string,
  categoryId: string,
  name: string,
): Promise<Channel> {
  return db.channel.create({
    data: {
      name,
      workspaceId,
      messageCategoryId: categoryId,
      messageCategoryWorkspaceId: workspaceId,
    },
  });
}

export async function renameChannel(
  id: string,
  workspaceId: string,
  name: string,
): Promise<Channel> {
  return db.channel.update({ where: { id, workspaceId }, data: { name } });
}

export async function deleteChannel(
  id: string,
  workspaceId: string,
): Promise<void> {
  await db.channel.delete({ where: { id, workspaceId } });
}

export async function createMessage(
  workspaceId: string,
  input: {
    channelId: string;
    content: string;
    author?: string;
    origin?: MessageOrigin;
  },
): Promise<{ id: string }> {
  const channel = await db.channel.findUnique({
    where: { id: input.channelId },
    include: { messageCategory: true },
  });
  if (!channel || channel.messageCategory.workspaceId !== workspaceId) {
    throw new ChannelNotFoundError(input.channelId);
  }
  const message = await db.message.create({
    data: {
      workspaceId,
      channelId: input.channelId,
      channelWorkspaceId: workspaceId,
      content: input.content,
      author: input.author ?? null,
      origin: input.origin ?? "LEGACY",
    },
  });
  await emitWebhookEvent(workspaceId, "MESSAGE_CREATED", {
    messageId: message.id,
    channelId: input.channelId,
    content: input.content,
    author: input.author ?? null,
    origin: input.origin ?? "LEGACY",
  });
  return { id: message.id };
}

export class ChannelNotFoundError extends Error {
  code = "CHANNEL_NOT_FOUND" as const;
  constructor(channelId: string) {
    super(`Channel not found: ${channelId}`);
  }
}

export async function listMessages(
  workspaceId: string,
  channelId: string,
  params: ListMessagesParams,
): Promise<ListMessagesResult> {
  const pageSize = params.pageSize ?? env.LIST_PAGE_SIZE;
  const sort = params.sort ?? "desc";

  const where: Prisma.MessageWhereInput = { workspaceId, channelId };

  const decoded = params.cursor ? decodeCursor(params.cursor) : null;
  const cursor = decoded && decoded.w === workspaceId ? decoded : null;
  if (cursor) {
    const cursorDate = new Date(cursor.t);
    where.OR =
      sort === "desc"
        ? [
            { createdAt: { lt: cursorDate } },
            { createdAt: cursorDate, id: { lt: cursor.id } },
          ]
        : [
            { createdAt: { gt: cursorDate } },
            { createdAt: cursorDate, id: { gt: cursor.id } },
          ];
  }

  const rows = await db.message.findMany({
    where,
    orderBy: [{ createdAt: sort }, { id: sort }],
    take: pageSize + 1,
  });

  const hasMore = rows.length > pageSize;
  const items = hasMore ? rows.slice(0, pageSize) : rows;
  const nextCursor = hasMore
    ? encodeCursor(workspaceId, items[items.length - 1])
    : null;

  return { items, nextCursor };
}
