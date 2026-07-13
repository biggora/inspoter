import { db } from "@/lib/db";
import { env } from "@/lib/config/env";
import {
  Prisma,
  type Alert,
  type AlertCategory,
} from "@/generated/prisma/client";

export interface CreateAlertInput {
  category: string;
  severity: string;
  source: string;
  message: string;
  timestamp?: string;
}

export interface ListAlertsParams {
  cursor?: string;
  pageSize?: number;
  categoryId?: string;
  severity?: string;
  query?: string;
  sort?: "asc" | "desc";
}

export type AlertWithCategory = Alert & { alertCategory: AlertCategory | null };

export interface ListAlertsResult {
  items: AlertWithCategory[];
  nextCursor: string | null;
}

interface Cursor {
  t: string;
  id: string;
}

function encodeCursor(entry: Pick<Alert, "timestamp" | "id">): string {
  return Buffer.from(
    JSON.stringify({ t: entry.timestamp.toISOString(), id: entry.id }),
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
  input: CreateAlertInput,
): Promise<{ id: string }> {
  let alertCategoryId: string | null = null;
  const existing = await db.alertCategory.findFirst({
    where: { workspaceId, name: input.category },
  });
  if (existing) {
    alertCategoryId = existing.id;
  } else {
    const created = await db.alertCategory.create({
      data: { name: input.category, workspaceId },
    });
    alertCategoryId = created.id;
  }

  const entry = await db.alert.create({
    data: {
      alertCategoryId,
      severity: input.severity,
      source: input.source,
      message: input.message,
      ...(input.timestamp ? { timestamp: new Date(input.timestamp) } : {}),
    },
  });
  return { id: entry.id };
}

export async function list(
  workspaceId: string,
  params: ListAlertsParams,
): Promise<ListAlertsResult> {
  const pageSize = params.pageSize ?? env.LIST_PAGE_SIZE;
  const sort = params.sort ?? "desc";

  const where: Prisma.AlertWhereInput = {
    alertCategory: params.categoryId
      ? { id: params.categoryId, workspaceId }
      : { workspaceId },
  };
  if (params.severity) where.severity = params.severity;
  if (params.query)
    where.message = { contains: params.query, mode: "insensitive" };

  const cursor = params.cursor ? decodeCursor(params.cursor) : null;
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

  const rows = await db.alert.findMany({
    where,
    include: { alertCategory: true },
    orderBy: [{ timestamp: sort }, { id: sort }],
    take: pageSize + 1,
  });

  const hasMore = rows.length > pageSize;
  const items = hasMore ? rows.slice(0, pageSize) : rows;
  const nextCursor = hasMore ? encodeCursor(items[items.length - 1]) : null;

  return { items, nextCursor };
}

export async function listCategories(
  workspaceId: string,
): Promise<AlertCategory[]> {
  return db.alertCategory.findMany({
    where: { workspaceId },
    orderBy: { name: "asc" },
  });
}

export async function createCategory(
  workspaceId: string,
  name: string,
): Promise<AlertCategory> {
  return db.alertCategory.create({ data: { name, workspaceId } });
}

export async function renameCategory(
  id: string,
  workspaceId: string,
  name: string,
): Promise<AlertCategory> {
  const cat = await db.alertCategory.findFirst({ where: { id, workspaceId } });
  if (!cat) throw new Error("Category not found");
  return db.alertCategory.update({ where: { id }, data: { name } });
}

export async function deleteCategory(
  id: string,
  workspaceId: string,
): Promise<void> {
  const cat = await db.alertCategory.findFirst({ where: { id, workspaceId } });
  if (!cat) throw new Error("Category not found");
  await db.alertCategory.delete({ where: { id } });
}
