import { db } from "@/lib/db";
import { env } from "@/lib/config/env";
import { Prisma, type Activity } from "@/generated/prisma/client";
import { logError } from "@/lib/services/logs";

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

interface EntityReference {
  entityType: string;
  entityId: string;
}

type EntityLabelMap = Map<string, string>;

function entityKey(entityType: string, entityId: string): string {
  return `${entityType}\0${entityId}`;
}

function uniqueEntityReferences(
  entries: ReadonlyArray<{
    entityType: string;
    entityId: string | null;
    entityLabel: string | null;
  }>,
): EntityReference[] {
  const references = new Map<string, EntityReference>();
  for (const entry of entries) {
    if (entry.entityLabel || !entry.entityId) continue;
    references.set(entityKey(entry.entityType, entry.entityId), {
      entityType: entry.entityType,
      entityId: entry.entityId,
    });
  }
  return [...references.values()];
}

async function resolveCurrentEntityLabels(
  workspaceId: string,
  references: readonly EntityReference[],
): Promise<EntityLabelMap> {
  const labels: EntityLabelMap = new Map();
  const idsByType = new Map<string, string[]>();

  for (const reference of references) {
    const ids = idsByType.get(reference.entityType) ?? [];
    ids.push(reference.entityId);
    idsByType.set(reference.entityType, ids);
  }

  const idsFor = (entityType: string) => idsByType.get(entityType) ?? [];
  const lookups: Promise<void>[] = [];

  function addLookup<T>(
    entityType: string,
    promise: Promise<T[]>,
    getId: (row: T) => string,
    getLabel: (row: T) => string | null,
  ) {
    lookups.push(
      promise.then((rows) => {
        for (const row of rows) {
          const label = getLabel(row);
          if (label) labels.set(entityKey(entityType, getId(row)), label);
        }
      }),
    );
  }

  const workspaceIds = idsFor("workspace");
  if (workspaceIds.length > 0) {
    addLookup(
      "workspace",
      db.workspace.findMany({
        where: { id: { in: workspaceIds } },
        select: { id: true, name: true },
      }),
      (row) => row.id,
      (row) => row.name,
    );
  }

  const workspaceMemberIds = idsFor("workspace_member");
  if (workspaceMemberIds.length > 0) {
    addLookup(
      "workspace_member",
      db.workspaceMember.findMany({
        where: { id: { in: workspaceMemberIds }, workspaceId },
        select: { id: true, operator: { select: { username: true } } },
      }),
      (row) => row.id,
      (row) => row.operator.username,
    );
  }

  const categoryIds = idsFor("category");
  if (categoryIds.length > 0) {
    addLookup(
      "category",
      db.category.findMany({
        where: { id: { in: categoryIds }, workspaceId },
        select: { id: true, name: true },
      }),
      (row) => row.id,
      (row) => row.name,
    );
  }

  const bookmarkIds = idsFor("bookmark");
  if (bookmarkIds.length > 0) {
    addLookup(
      "bookmark",
      db.bookmark.findMany({
        where: { id: { in: bookmarkIds }, workspaceId },
        select: { id: true, name: true },
      }),
      (row) => row.id,
      (row) => row.name,
    );
  }

  const messageCategoryIds = idsFor("message_category");
  if (messageCategoryIds.length > 0) {
    addLookup(
      "message_category",
      db.messageCategory.findMany({
        where: { id: { in: messageCategoryIds }, workspaceId },
        select: { id: true, name: true },
      }),
      (row) => row.id,
      (row) => row.name,
    );
  }

  const channelIds = idsFor("channel");
  if (channelIds.length > 0) {
    addLookup(
      "channel",
      db.channel.findMany({
        where: { id: { in: channelIds }, workspaceId },
        select: { id: true, name: true },
      }),
      (row) => row.id,
      (row) => row.name,
    );
  }

  const mailAccountIds = idsFor("mail_account");
  if (mailAccountIds.length > 0) {
    addLookup(
      "mail_account",
      db.mailAccount.findMany({
        where: { id: { in: mailAccountIds }, workspaceId },
        select: { id: true, name: true },
      }),
      (row) => row.id,
      (row) => row.name,
    );
  }

  const mailLabelIds = idsFor("mail_label");
  if (mailLabelIds.length > 0) {
    addLookup(
      "mail_label",
      db.mailLabel.findMany({
        where: { id: { in: mailLabelIds }, workspaceId },
        select: { id: true, name: true },
      }),
      (row) => row.id,
      (row) => row.name,
    );
  }

  const mailFilterRuleIds = idsFor("mail_filter_rule");
  if (mailFilterRuleIds.length > 0) {
    addLookup(
      "mail_filter_rule",
      db.mailFilterRule.findMany({
        where: { id: { in: mailFilterRuleIds }, workspaceId },
        select: { id: true, name: true },
      }),
      (row) => row.id,
      (row) => row.name,
    );
  }

  const alertCategoryIds = idsFor("alert_category");
  if (alertCategoryIds.length > 0) {
    addLookup(
      "alert_category",
      db.alertCategory.findMany({
        where: { id: { in: alertCategoryIds }, workspaceId },
        select: { id: true, name: true },
      }),
      (row) => row.id,
      (row) => row.name,
    );
  }

  const serviceIds = idsFor("service");
  if (serviceIds.length > 0) {
    addLookup(
      "service",
      db.service.findMany({
        where: { id: { in: serviceIds }, workspaceId },
        select: { id: true, name: true },
      }),
      (row) => row.id,
      (row) => row.name,
    );
  }

  const credentialIds = idsFor("credential");
  if (credentialIds.length > 0) {
    addLookup(
      "credential",
      db.providerCredential.findMany({
        where: { id: { in: credentialIds }, workspaceId },
        select: { id: true, label: true },
      }),
      (row) => row.id,
      (row) => row.label,
    );
  }

  const webhookTokenIds = idsFor("webhook_token");
  if (webhookTokenIds.length > 0) {
    addLookup(
      "webhook_token",
      db.webhookToken.findMany({
        where: { id: { in: webhookTokenIds }, workspaceId },
        select: { id: true, name: true },
      }),
      (row) => row.id,
      (row) => row.name,
    );
  }

  const channelWebhookIds = idsFor("channel_webhook");
  if (channelWebhookIds.length > 0) {
    addLookup(
      "channel_webhook",
      db.webhookToken.findMany({
        where: { id: { in: channelWebhookIds }, workspaceId },
        select: { id: true, name: true },
      }),
      (row) => row.id,
      (row) => row.name,
    );
  }

  const outgoingWebhookIds = idsFor("outgoing_webhook");
  if (outgoingWebhookIds.length > 0) {
    addLookup(
      "outgoing_webhook",
      db.outgoingWebhook.findMany({
        where: { id: { in: outgoingWebhookIds }, workspaceId },
        select: { id: true, name: true },
      }),
      (row) => row.id,
      (row) => row.name,
    );
  }

  const serverIds = idsFor("server");
  if (serverIds.length > 0) {
    addLookup(
      "server",
      db.providerResourceBinding.findMany({
        where: {
          workspaceId,
          resourceType: "SERVER",
          remoteId: { in: serverIds },
        },
        select: { remoteId: true, displayName: true },
      }),
      (row) => row.remoteId,
      (row) => row.displayName,
    );
  }

  await Promise.all(lookups);
  return labels;
}

async function resolveEntityLabels(
  workspaceId: string,
  references: readonly EntityReference[],
): Promise<EntityLabelMap> {
  if (references.length === 0) return new Map();

  const labels: EntityLabelMap = new Map();
  const historical = await db.activity.findMany({
    where: {
      workspaceId,
      entityLabel: { not: null },
      OR: references.map(({ entityType, entityId }) => ({
        entityType,
        entityId,
      })),
    },
    select: { entityType: true, entityId: true, entityLabel: true },
    orderBy: { timestamp: "desc" },
  });

  for (const entry of historical) {
    if (!entry.entityId || !entry.entityLabel) continue;
    const key = entityKey(entry.entityType, entry.entityId);
    if (!labels.has(key)) labels.set(key, entry.entityLabel);
  }

  const unresolved = references.filter(
    ({ entityType, entityId }) => !labels.has(entityKey(entityType, entityId)),
  );
  const currentLabels = await resolveCurrentEntityLabels(
    workspaceId,
    unresolved,
  );
  for (const [key, label] of currentLabels) labels.set(key, label);
  return labels;
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
    let entityLabel = input.entityLabel ?? null;
    if (!entityLabel && input.entityId) {
      const labels = await resolveEntityLabels(workspaceId, [
        { entityType: input.entityType, entityId: input.entityId },
      ]);
      entityLabel =
        labels.get(entityKey(input.entityType, input.entityId)) ?? null;
    }

    await db.activity.create({
      data: {
        workspaceId,
        operatorId: input.operatorId,
        operatorName: input.operatorName,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        entityLabel,
        details: input.details ?? null,
      },
    });
  } catch (error) {
    console.error("[activity] recordActivity failed:", error);
    // Also persist to Logs — the audit trail entry was lost and console
    // output alone isn't discoverable from the UI.
    logError(
      workspaceId,
      "activity",
      "Failed to record activity",
      JSON.stringify({
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        error: error instanceof Error ? error.message : String(error),
      }),
    );
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
  const rawItems = hasMore ? rows.slice(0, pageSize) : rows;
  const references = uniqueEntityReferences(rawItems);
  const labels = await resolveEntityLabels(workspaceId, references);
  const items = rawItems.map((entry) => {
    if (entry.entityLabel || !entry.entityId) return entry;
    const entityLabel = labels.get(entityKey(entry.entityType, entry.entityId));
    return entityLabel ? { ...entry, entityLabel } : entry;
  });
  const nextCursor = hasMore
    ? encodeCursor(workspaceId, rawItems[rawItems.length - 1])
    : null;

  return { items, nextCursor };
}
