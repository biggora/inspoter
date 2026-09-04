import { db } from "@/lib/db";
import { publishIndicatorChange } from "@/lib/services/indicator-events";
import { env } from "@/lib/config/env";
import {
  AlertCategorySource,
  Prisma,
  type Alert,
  type AlertCategory,
} from "@/generated/prisma/client";
import {
  normalizeLabelDisplayName,
  normalizeLabelName,
} from "@/lib/label-normalization";
import {
  renderSystemAlertMessage,
  SYSTEM_ALERT_CATEGORY_NAMES,
  type SystemAlertCategoryKey,
  type SystemAlertMessageKey,
  type SystemAlertMessageParams,
} from "@/lib/services/alert-catalog";
import { emitWebhookEvent } from "@/lib/services/webhook-events";
import { MAX_BULK_ALERTS } from "@/lib/validation/alerts";

/** Sentinel for `categoryId`, meaning "alertCategoryId IS NULL". */
export const UNCATEGORIZED = "none";

export class AlertNotFoundError extends Error {
  code = "ALERT_NOT_FOUND" as const;
  constructor() {
    super("Alert not found");
  }
}

export class AlertCategoryNotFoundError extends Error {
  code = "ALERT_CATEGORY_NOT_FOUND" as const;
  constructor() {
    super("Category not found");
  }
}

/**
 * Category and message are chosen independently: a system producer files into
 * a keyed category but may still carry a probe's verbatim diagnostic, which is
 * observed detail rather than prose anyone can translate.
 *
 * The `messageKey` variant is what makes an alert translatable — `message` is
 * derived from the key, so the stored English text and the locale the operator
 * reads can never disagree.
 */
export type CreateAlertInput = {
  severity: string;
  source: string;
  timestamp?: string;
  /**
   * Free-form name from a webhook sender. Optional: a third party that has no
   * notion of categories still gets its alert stored, uncategorized, rather
   * than a 400.
   */
  category?: string;
  /** One of Inspoter's own categories. Takes precedence over `category`. */
  categoryKey?: SystemAlertCategoryKey;
} & (
  | { message: string; messageKey?: never; messageParams?: never }
  | {
      messageKey: SystemAlertMessageKey;
      messageParams?: SystemAlertMessageParams;
      message?: never;
    }
);

export interface ListAlertsParams {
  cursor?: string;
  pageSize?: number;
  /** A category id, or `UNCATEGORIZED` for the alerts that have none. */
  categoryId?: string;
  severity?: string;
  query?: string;
  sort?: "asc" | "desc";
  /** YYYY-MM-DD, interpreted as one UTC day like the dashboard calendar. */
  date?: string;
}

export type AlertWithCategory = Alert & { alertCategory: AlertCategory | null };

export interface ListAlertsResult {
  items: AlertWithCategory[];
  nextCursor: string | null;
}

interface Cursor {
  w: string;
  t: string;
  id: string;
}

function encodeCursor(
  workspaceId: string,
  entry: Pick<Alert, "timestamp" | "id">,
): string {
  return Buffer.from(
    JSON.stringify({
      w: workspaceId,
      t: entry.timestamp.toISOString(),
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

export async function create(
  workspaceId: string,
  input: CreateAlertInput,
): Promise<{ id: string }> {
  const category = input.categoryKey
    ? await upsertSystemCategory(workspaceId, input.categoryKey)
    : input.category
      ? await upsertCategoryByName(workspaceId, input.category)
      : null;

  // Always the English base wording, whether it came from a sender verbatim or
  // from the system catalog — one text for search, webhooks, backups and MCP.
  const message = input.messageKey
    ? renderSystemAlertMessage(input.messageKey, input.messageParams)
    : input.message;

  const entry = await db.alert.create({
    data: {
      workspaceId,
      alertCategoryId: category?.id ?? null,
      alertCategoryWorkspaceId: category ? workspaceId : null,
      categorySource: category ? AlertCategorySource.WEBHOOK : null,
      severity: input.severity,
      source: input.source,
      message,
      messageKey: input.messageKey ?? null,
      messageParams: input.messageParams ?? Prisma.DbNull,
      ...(input.timestamp ? { timestamp: new Date(input.timestamp) } : {}),
    },
  });
  publishIndicatorChange(workspaceId, "alerts");
  await emitWebhookEvent(workspaceId, "ALERT_CREATED", {
    alertId: entry.id,
    severity: input.severity,
    source: input.source,
    message,
    // Null for a payload that carried no category — subscribers that used to
    // rely on this field always being present must tolerate it.
    category: category?.name ?? null,
  });
  return { id: entry.id };
}

// Atomic get-or-create on @@unique([workspaceId, normalizedName]). A
// find-then-create pair would lose the race whenever several services flip
// inside one scheduler tick (scheduler.ts checks a chunk via Promise.all) on a
// workspace that has no such category yet: every loser fails with P2002 and
// its alert is dropped. `update` is a no-op write rather than `{}` so the
// query compiles to INSERT ... ON CONFLICT DO UPDATE.
//
// Matching on the folded name is what keeps "availability", "Availability" and
// "AVAILABILITY " from three different senders in one category; the display
// name of the first writer wins.
export async function upsertCategoryByName(
  workspaceId: string,
  rawName: string,
): Promise<AlertCategory> {
  const name = normalizeLabelDisplayName(rawName);
  const normalizedName = normalizeLabelName(rawName);
  return db.alertCategory.upsert({
    where: { workspaceId_normalizedName: { workspaceId, normalizedName } },
    create: { name, normalizedName, workspaceId },
    update: { normalizedName },
  });
}

/**
 * The get-or-create used by Inspoter's own alert producers. Same atomic upsert
 * as above, plus the `systemKey` marker that tells the UI to render the
 * translated label instead of the stored English name.
 *
 * The `update` branch is a no-op write (same reason as above: it forces
 * INSERT ... ON CONFLICT DO UPDATE) and touches neither `name` nor
 * `systemKey`. An existing row belongs to whoever made it — an operator who
 * renamed it, or a webhook sender who happened to pick the same word — and
 * refiling into it must not relabel it behind their back.
 */
export async function upsertSystemCategory(
  workspaceId: string,
  key: SystemAlertCategoryKey,
): Promise<AlertCategory> {
  const name = SYSTEM_ALERT_CATEGORY_NAMES[key];
  const normalizedName = normalizeLabelName(name);
  return db.alertCategory.upsert({
    where: { workspaceId_normalizedName: { workspaceId, normalizedName } },
    create: { name, normalizedName, workspaceId, systemKey: key },
    update: { normalizedName },
  });
}

export async function list(
  workspaceId: string,
  params: ListAlertsParams,
): Promise<ListAlertsResult> {
  const pageSize = params.pageSize ?? env.LIST_PAGE_SIZE;
  const sort = params.sort ?? "desc";

  // Scoped by Alert.workspaceId rather than through the alertCategory
  // relation: a relation filter is an implicit `is`, which drops every
  // uncategorized alert (alertCategoryId = null) — the exact rows AC-ALR-002
  // promises to keep after a category is deleted. Filtering on the model's own
  // columns also lets the [workspaceId, ...] indexes serve the query.
  const where: Prisma.AlertWhereInput = { workspaceId };
  if (params.categoryId === UNCATEGORIZED) where.alertCategoryId = null;
  else if (params.categoryId) where.alertCategoryId = params.categoryId;
  if (params.severity) where.severity = params.severity;
  if (params.query)
    where.message = { contains: params.query, mode: "insensitive" };
  if (params.date) {
    const from = new Date(`${params.date}T00:00:00.000Z`);
    const to = new Date(from);
    to.setUTCDate(to.getUTCDate() + 1);
    where.timestamp = { gte: from, lt: to };
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

  const rows = await db.alert.findMany({
    where,
    include: { alertCategory: true },
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

export async function getById(
  id: string,
  workspaceId: string,
): Promise<AlertWithCategory | null> {
  return db.alert.findFirst({
    where: { id, workspaceId },
    include: { alertCategory: true },
  });
}

/**
 * The single place an alert's category is written after creation. `source`
 * records who decided it, so a future classifier can be told to leave MANUAL
 * rows alone; `confidence` belongs to MODEL and is dropped for every other
 * source.
 */
export async function setCategory(
  id: string,
  workspaceId: string,
  categoryId: string | null,
  source: AlertCategorySource,
  confidence?: number,
): Promise<AlertWithCategory> {
  await assertCategoryInWorkspace(workspaceId, categoryId);

  // updateMany, not update: `where` on the primary key alone would let a
  // caller reach another workspace's alert.
  const updated = await db.alert.updateMany({
    where: { id, workspaceId },
    data: categoryAssignment(categoryId, workspaceId, source, confidence),
  });
  if (updated.count === 0) throw new AlertNotFoundError();

  const alert = await getById(id, workspaceId);
  if (!alert) throw new AlertNotFoundError();
  return alert;
}

/**
 * Bulk variant for reclassifying a backlog. Bounded by MAX_BULK_ALERTS so one
 * request cannot rewrite the whole table; the caller pages through.
 */
export async function setCategoryBulk(
  workspaceId: string,
  ids: string[],
  categoryId: string | null,
  source: AlertCategorySource,
  confidence?: number,
): Promise<{ updated: number }> {
  if (ids.length === 0) return { updated: 0 };
  await assertCategoryInWorkspace(workspaceId, categoryId);

  const result = await db.alert.updateMany({
    where: { id: { in: ids.slice(0, MAX_BULK_ALERTS) }, workspaceId },
    data: categoryAssignment(categoryId, workspaceId, source, confidence),
  });
  return { updated: result.count };
}

// Keeps the three category columns consistent: no category means no source
// and no confidence, and confidence only survives for MODEL.
function categoryAssignment(
  categoryId: string | null,
  workspaceId: string,
  source: AlertCategorySource,
  confidence?: number,
): Prisma.AlertUncheckedUpdateManyInput {
  return {
    alertCategoryId: categoryId,
    alertCategoryWorkspaceId: categoryId === null ? null : workspaceId,
    categorySource: categoryId === null ? null : source,
    categoryConfidence:
      categoryId !== null && source === AlertCategorySource.MODEL
        ? (confidence ?? null)
        : null,
  };
}

async function assertCategoryInWorkspace(
  workspaceId: string,
  categoryId: string | null,
): Promise<void> {
  if (categoryId === null) return;
  const category = await db.alertCategory.findFirst({
    where: { id: categoryId, workspaceId },
    select: { id: true },
  });
  if (!category) throw new AlertCategoryNotFoundError();
}

/**
 * Clears the topbar alert indicator. Entering the Alerts section is the only
 * caller — an operator who is looking at the list has, by definition, seen it.
 * Scoped to unread rows so the write touches nothing on a repeat visit.
 */
export async function markAllRead(
  workspaceId: string,
): Promise<{ updated: number }> {
  const result = await db.alert.updateMany({
    where: { workspaceId, isRead: false },
    data: { isRead: true },
  });
  // Guarded: entering /alerts calls this on every visit, and an unguarded
  // publish would wake every connected tab for a write that changed nothing.
  if (result.count > 0) publishIndicatorChange(workspaceId, "alerts");
  return { updated: result.count };
}

/** AC-ALR-008: an operator can delete an alert. */
export async function remove(id: string, workspaceId: string): Promise<void> {
  const deleted = await db.alert.deleteMany({ where: { id, workspaceId } });
  if (deleted.count === 0) throw new AlertNotFoundError();
  publishIndicatorChange(workspaceId, "alerts");
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
  description?: string,
): Promise<AlertCategory> {
  return db.alertCategory.create({
    data: {
      workspaceId,
      name: normalizeLabelDisplayName(name),
      normalizedName: normalizeLabelName(name),
      ...(description !== undefined ? { description } : {}),
    },
  });
}

export async function renameCategory(
  id: string,
  workspaceId: string,
  name: string,
): Promise<AlertCategory> {
  const cat = await db.alertCategory.findFirst({ where: { id, workspaceId } });
  if (!cat) throw new Error("Category not found");
  return db.alertCategory.update({
    where: { id },
    data: {
      name: normalizeLabelDisplayName(name),
      normalizedName: normalizeLabelName(name),
      // Renaming makes the category the operator's own: the UI must show what
      // they typed, in every locale, instead of the built-in translation.
      systemKey: null,
    },
  });
}

export async function deleteCategory(
  id: string,
  workspaceId: string,
): Promise<void> {
  const cat = await db.alertCategory.findFirst({ where: { id, workspaceId } });
  if (!cat) throw new Error("Category not found");
  // The FK clears alertCategoryId on its own (onDelete: SetNull, AC-ALR-002),
  // but it knows nothing about categorySource — without this the surviving
  // rows would claim a provenance for a category they no longer have.
  await db.$transaction([
    db.alert.updateMany({
      where: { workspaceId, alertCategoryId: id },
      data: { categorySource: null, categoryConfidence: null },
    }),
    db.alertCategory.delete({ where: { id } }),
  ]);
}
