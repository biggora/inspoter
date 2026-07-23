import { db } from "@/lib/db";
import { env } from "@/lib/config/env";
import { Prisma, type Activity } from "@/generated/prisma/client";

// Activity service (user action journal). Keyset (cursor) pagination on
// (timestamp, id), mirroring src/lib/services/logs.ts.

export interface RecordActivityInput {
  operatorId: string;
  operatorName: string;
  action: string;
  entityType: string;
  entityId?: string | null;
  entityLabel?: string | null;
  details?: string | null;
}

export interface ListActivitiesParams {
  cursor?: string;
  pageSize?: number;
  action?: string;
  entityType?: string;
  operatorId?: string;
  query?: string;
  sort?: "asc" | "desc";
}

export interface ListActivitiesResult {
  items: Activity[];
  nextCursor: string | null;
}

interface Cursor {
  w: string;
  t: string;
  id: string;
}

function encodeCursor(
  workspaceId: string,
  entry: Pick<Activity, "timestamp" | "id">,
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

// Fire-and-forget write, mirroring emitWebhookEvent (webhook-events.ts):
// a journaling failure must never block or roll back the domain action
// that triggered it.
export async function recordActivity(
  workspaceId: string,
  input: RecordActivityInput,
): Promise<void> {
  try {
    await db.activity.create({
      data: {
        workspaceId,
        operatorId: input.operatorId,
        operatorName: input.operatorName,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        entityLabel: input.entityLabel ?? null,
        details: input.details ?? null,
      },
    });
  } catch (error) {
    console.error("[activity] recordActivity failed:", error);
  }
}

export async function list(
  workspaceId: string,
  params: ListActivitiesParams,
): Promise<ListActivitiesResult> {
  const pageSize = params.pageSize ?? env.LIST_PAGE_SIZE;
  const sort = params.sort ?? "desc";

  const where: Prisma.ActivityWhereInput = { workspaceId };
  if (params.action) where.action = params.action;
  if (params.entityType) where.entityType = params.entityType;
  if (params.operatorId) where.operatorId = params.operatorId;

  const textCondition: Prisma.ActivityWhereInput[] | null = params.query
    ? [
        { entityLabel: { contains: params.query, mode: "insensitive" } },
        { details: { contains: params.query, mode: "insensitive" } },
        { operatorName: { contains: params.query, mode: "insensitive" } },
      ]
    : null;

  const decoded = params.cursor ? decodeCursor(params.cursor) : null;
  const cursor = decoded && decoded.w === workspaceId ? decoded : null;
  let cursorCondition: Prisma.ActivityWhereInput[] | null = null;
  if (cursor) {
    const cursorDate = new Date(cursor.t);
    cursorCondition =
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

  if (textCondition && cursorCondition) {
    where.AND = [{ OR: textCondition }, { OR: cursorCondition }];
  } else if (textCondition) {
    where.OR = textCondition;
  } else if (cursorCondition) {
    where.OR = cursorCondition;
  }

  const rows = await db.activity.findMany({
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
