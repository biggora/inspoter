import { db } from "@/lib/db";
import { env } from "@/lib/config/env";
import { Prisma, type LogEntry } from "@/generated/prisma/client";

// Logs service (FR-LOG-001/002). Keyset (cursor) pagination on
// (timestamp, id) — architecture.md §2.4, AC-LOG-003/004. First and
// simplest webhook-ingest consumer (architecture.md §5, Slice 4).

export interface CreateLogInput {
  level: string;
  source: string;
  message: string;
  timestamp?: string;
}

export interface ListLogsParams {
  cursor?: string;
  pageSize?: number;
  level?: string;
  source?: string;
  query?: string;
  sort?: "asc" | "desc";
}

export interface ListLogsResult {
  items: LogEntry[];
  nextCursor: string | null;
}

interface Cursor {
  w: string;
  t: string;
  id: string;
}

function encodeCursor(
  workspaceId: string,
  entry: Pick<LogEntry, "timestamp" | "id">,
): string {
  const cursor: Cursor = {
    w: workspaceId,
    t: entry.timestamp.toISOString(),
    id: entry.id,
  };
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}

function decodeCursor(cursor: string): Cursor | null {
  try {
    const parsed = JSON.parse(
      Buffer.from(cursor, "base64url").toString("utf-8"),
    ) as Partial<Cursor>;
    if (
      typeof parsed.w === "string" &&
      typeof parsed.t === "string" &&
      typeof parsed.id === "string"
    ) {
      return { w: parsed.w, t: parsed.t, id: parsed.id };
    }
    return null;
  } catch {
    return null;
  }
}

export async function create(
  workspaceId: string,
  input: CreateLogInput,
): Promise<{ id: string }> {
  const entry = await db.logEntry.create({
    data: {
      workspaceId,
      level: input.level,
      source: input.source,
      message: input.message,
      ...(input.timestamp ? { timestamp: new Date(input.timestamp) } : {}),
    },
  });
  return { id: entry.id };
}

export async function list(
  workspaceId: string,
  params: ListLogsParams,
): Promise<ListLogsResult> {
  const pageSize = params.pageSize ?? env.LIST_PAGE_SIZE;
  const sort = params.sort ?? "desc";

  const where: Prisma.LogEntryWhereInput = { workspaceId };
  if (params.level) where.level = params.level;
  if (params.source) where.source = params.source;
  if (params.query) {
    where.message = { contains: params.query, mode: "insensitive" };
  }

  const decoded = params.cursor ? decodeCursor(params.cursor) : null;
  const cursor = decoded && decoded.w === workspaceId ? decoded : null;
  if (cursor) {
    const cursorDate = new Date(cursor.t);
    where.OR =
      sort === "desc"
        ? [
            { timestamp: { lt: cursorDate } },
            { timestamp: cursorDate, id: { lt: cursor.id } },
          ]
        : [
            { timestamp: { gt: cursorDate } },
            { timestamp: cursorDate, id: { gt: cursor.id } },
          ];
  }

  const rows = await db.logEntry.findMany({
    where,
    orderBy: [{ timestamp: sort }, { id: sort }],
    take: pageSize + 1,
  });

  const hasMore = rows.length > pageSize;
  const items = hasMore ? rows.slice(0, pageSize) : rows;
  const nextCursor = hasMore
    ? encodeCursor(workspaceId, items[items.length - 1])
    : null;

  return { items, nextCursor };
}
