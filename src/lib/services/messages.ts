import { db } from "@/lib/db";
import { env } from "@/lib/config/env";
import {
  Prisma,
  type MessageCategory,
  type Channel,
  type Message,
} from "@/generated/prisma/client";

export type CategoryWithChannels = MessageCategory & { channels: Channel[] };

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
  input: { channelId: string; content: string; author?: string },
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
    },
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
