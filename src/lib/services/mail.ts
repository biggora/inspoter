import { db } from "@/lib/db";
import { env } from "@/lib/config/env";
import { Prisma, type MailItem } from "@/generated/prisma/client";

export interface CreateMailInput {
  sender: string;
  subject: string;
  body: string;
  receivedAt?: string;
}

export interface ListMailParams {
  cursor?: string;
  pageSize?: number;
  sender?: string;
  query?: string;
  sort?: "asc" | "desc";
}

export interface ListMailResult {
  items: MailItem[];
  nextCursor: string | null;
}

interface Cursor {
  t: string;
  id: string;
}

function encodeCursor(entry: Pick<MailItem, "receivedAt" | "id">): string {
  return Buffer.from(
    JSON.stringify({ t: entry.receivedAt.toISOString(), id: entry.id }),
  ).toString("base64url");
}

function decodeCursor(cursor: string): Cursor | null {
  try {
    const p = JSON.parse(
      Buffer.from(cursor, "base64url").toString("utf-8"),
    ) as Partial<Cursor>;
    return typeof p.t === "string" && typeof p.id === "string"
      ? { t: p.t, id: p.id }
      : null;
  } catch {
    return null;
  }
}

export async function create(
  workspaceId: string,
  input: CreateMailInput,
): Promise<{ id: string }> {
  const entry = await db.mailItem.create({
    data: {
      workspaceId,
      sender: input.sender,
      subject: input.subject,
      body: input.body,
      ...(input.receivedAt ? { receivedAt: new Date(input.receivedAt) } : {}),
    },
  });
  return { id: entry.id };
}

export async function list(
  workspaceId: string,
  params: ListMailParams,
): Promise<ListMailResult> {
  const pageSize = params.pageSize ?? env.LIST_PAGE_SIZE;
  const sort = params.sort ?? "desc";

  const where: Prisma.MailItemWhereInput = { workspaceId };
  if (params.sender) where.sender = params.sender;
  if (params.query) {
    where.OR = [
      { subject: { contains: params.query, mode: "insensitive" } },
      { sender: { contains: params.query, mode: "insensitive" } },
    ];
  }

  const cursor = params.cursor ? decodeCursor(params.cursor) : null;
  if (cursor) {
    const cursorDate = new Date(cursor.t);
    const cursorWhere =
      sort === "desc"
        ? [
            { receivedAt: { lt: cursorDate } },
            { receivedAt: cursorDate, id: { lt: cursor.id } },
          ]
        : [
            { receivedAt: { gt: cursorDate } },
            { receivedAt: cursorDate, id: { gt: cursor.id } },
          ];
    if (where.OR) {
      where.AND = [{ OR: where.OR }, { OR: cursorWhere }];
      delete where.OR;
    } else {
      where.OR = cursorWhere;
    }
  }

  const rows = await db.mailItem.findMany({
    where,
    orderBy: [{ receivedAt: sort }, { id: sort }],
    take: pageSize + 1,
  });

  const hasMore = rows.length > pageSize;
  const items = hasMore ? rows.slice(0, pageSize) : rows;
  const nextCursor = hasMore ? encodeCursor(items[items.length - 1]) : null;

  return { items, nextCursor };
}

export async function getById(
  id: string,
  workspaceId: string,
): Promise<MailItem | null> {
  return db.mailItem.findFirst({ where: { id, workspaceId } });
}
