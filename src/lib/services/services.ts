import { db } from "@/lib/db";
import { env } from "@/lib/config/env";
import {
  Prisma,
  ServiceStatus,
  type MonitorType,
  type Service,
  type ServiceCheck,
} from "@/generated/prisma/client";
import { runCheck, type CheckOutcome } from "./monitor-checks";
import { nextState } from "./service-status";
import * as alertsService from "./alerts";
import {
  setServiceLabels,
  toSummary,
  type ServiceLabelSummary,
} from "./service-labels";
import { emitWebhookEvent } from "@/lib/services/webhook-events";

// Sole Prisma caller for Service/ServiceCheck (plan.md "Слой сервиса, API,
// валидация"), by the same conventions as src/lib/services/bookmarks.ts and
// src/lib/services/alerts.ts.

export class ServiceNotFoundError extends Error {
  constructor(id: string) {
    super(`Service not found: ${id}`);
    this.name = "ServiceNotFoundError";
  }
}

export interface ServiceCreateInput {
  name: string;
  description?: string | null;
  monitorType: MonitorType;
  url?: string;
  host?: string;
  port?: number;
  expectedStatusCodes?: string;
  intervalSeconds?: number;
  timeoutMs?: number;
  retries?: number;
  isActive?: boolean;
  // undefined leaves the current assignments alone; [] clears them.
  labelIds?: string[];
}

export type ServiceUpdateInput = Partial<ServiceCreateInput>;

export interface ListServiceChecksParams {
  cursor?: string;
  pageSize?: number;
}

export interface ListServiceChecksResult {
  items: ServiceCheck[];
  nextCursor: string | null;
}

export type ServiceWithLabels = Service & {
  labels: ServiceLabelSummary[];
};

export type ServiceOverviewItem = ServiceWithLabels & {
  checks: Array<
    Pick<ServiceCheck, "id" | "status" | "responseTimeMs" | "checkedAt">
  >;
};

const OVERVIEW_CHECK_COUNT = 24;

const LABEL_INCLUDE = {
  labels: {
    select: { label: { select: { id: true, name: true, color: true } } },
  },
} satisfies Prisma.ServiceInclude;

function toLabelSummaries(
  rows: Array<{ label: { id: string; name: string; color: string } }>,
): ServiceLabelSummary[] {
  return rows
    .map((row) => toSummary(row.label))
    .sort((a, b) => a.name.localeCompare(b.name));
}

interface Cursor {
  w: string;
  t: string;
  id: string;
}

function encodeCursor(
  workspaceId: string,
  entry: Pick<ServiceCheck, "checkedAt" | "id">,
): string {
  return Buffer.from(
    JSON.stringify({
      w: workspaceId,
      t: entry.checkedAt.toISOString(),
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

export async function list(workspaceId: string): Promise<ServiceWithLabels[]> {
  const rows = await db.service.findMany({
    where: { workspaceId },
    orderBy: { name: "asc" },
    include: LABEL_INCLUDE,
  });
  return rows.map(({ labels, ...service }) => ({
    ...service,
    labels: toLabelSummaries(labels),
  }));
}

export async function listOverview(
  workspaceId: string,
): Promise<ServiceOverviewItem[]> {
  const rows = await db.service.findMany({
    where: { workspaceId },
    orderBy: { name: "asc" },
    include: {
      ...LABEL_INCLUDE,
      checks: {
        orderBy: [{ checkedAt: "desc" }, { id: "desc" }],
        take: OVERVIEW_CHECK_COUNT,
        select: {
          id: true,
          status: true,
          responseTimeMs: true,
          checkedAt: true,
        },
      },
    },
  });
  return rows.map(({ labels, ...service }) => ({
    ...service,
    labels: toLabelSummaries(labels),
  }));
}

export async function get(
  id: string,
  workspaceId: string,
): Promise<ServiceWithLabels | null> {
  const row = await db.service.findFirst({
    where: { id, workspaceId },
    include: LABEL_INCLUDE,
  });
  if (!row) return null;
  const { labels, ...service } = row;
  return { ...service, labels: toLabelSummaries(labels) };
}

export async function create(
  workspaceId: string,
  input: ServiceCreateInput,
): Promise<ServiceWithLabels> {
  return db.$transaction(async (tx) => {
    const created = await tx.service.create({
      data: {
        workspaceId,
        name: input.name,
        description: input.description ?? null,
        monitorType: input.monitorType,
        url: input.url ?? null,
        host: input.host ?? null,
        port: input.port ?? null,
        expectedStatusCodes: input.expectedStatusCodes ?? null,
        ...(input.intervalSeconds !== undefined
          ? { intervalSeconds: input.intervalSeconds }
          : {}),
        ...(input.timeoutMs !== undefined
          ? { timeoutMs: input.timeoutMs }
          : {}),
        ...(input.retries !== undefined ? { retries: input.retries } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        // Picked up on the very next scheduler tick.
        nextCheckAt: new Date(),
      },
    });

    if (!input.labelIds?.length) return { ...created, labels: [] };

    await setServiceLabels(tx, workspaceId, created.id, input.labelIds);
    return readWithLabels(tx, created.id, workspaceId);
  });
}

// Re-read after a label mutation so callers always get the committed set,
// rather than reconstructing it from the requested ids.
async function readWithLabels(
  tx: Prisma.TransactionClient,
  id: string,
  workspaceId: string,
): Promise<ServiceWithLabels> {
  const { labels, ...service } = await tx.service.findUniqueOrThrow({
    where: { id_workspaceId: { id, workspaceId } },
    include: LABEL_INCLUDE,
  });
  return { ...service, labels: toLabelSummaries(labels) };
}

export async function update(
  id: string,
  workspaceId: string,
  input: ServiceUpdateInput,
): Promise<ServiceWithLabels> {
  const current = await db.service.findFirst({ where: { id, workspaceId } });
  if (!current) throw new ServiceNotFoundError(id);

  // Edits to the check target/cadence are re-checked immediately rather
  // than waiting out the old nextCheckAt / accumulated failure count.
  const targetChanged =
    (input.url !== undefined && input.url !== current.url) ||
    (input.host !== undefined && input.host !== current.host) ||
    (input.port !== undefined && input.port !== current.port) ||
    (input.monitorType !== undefined &&
      input.monitorType !== current.monitorType) ||
    (input.intervalSeconds !== undefined &&
      input.intervalSeconds !== current.intervalSeconds);

  // Resolve url/host/port/expectedStatusCodes against the *effective*
  // monitorType (new if provided, else current) rather than spreading each
  // field independently — otherwise switching monitorType (e.g. TCP → HTTP)
  // would leave the previous type's now-irrelevant host/port stale in the
  // DB instead of clearing them.
  const resolvedMonitorType = input.monitorType ?? current.monitorType;
  const url =
    resolvedMonitorType === "HTTP" ? (input.url ?? current.url) : null;
  const host =
    resolvedMonitorType === "TCP" || resolvedMonitorType === "PING"
      ? (input.host ?? current.host)
      : null;
  const port =
    resolvedMonitorType === "TCP" || resolvedMonitorType === "PING"
      ? (input.port ?? current.port)
      : null;
  const expectedStatusCodes =
    resolvedMonitorType === "HTTP"
      ? (input.expectedStatusCodes ?? current.expectedStatusCodes)
      : null;

  return db.$transaction(async (tx) => {
    await tx.service.update({
      where: { id, workspaceId },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined
          ? { description: input.description }
          : {}),
        ...(input.monitorType !== undefined
          ? { monitorType: input.monitorType }
          : {}),
        url,
        host,
        port,
        expectedStatusCodes,
        ...(input.intervalSeconds !== undefined
          ? { intervalSeconds: input.intervalSeconds }
          : {}),
        ...(input.timeoutMs !== undefined
          ? { timeoutMs: input.timeoutMs }
          : {}),
        ...(input.retries !== undefined ? { retries: input.retries } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        ...(targetChanged
          ? { consecutiveFailures: 0, nextCheckAt: new Date() }
          : {}),
      },
    });

    if (input.labelIds !== undefined) {
      await setServiceLabels(tx, workspaceId, id, input.labelIds);
    }

    return readWithLabels(tx, id, workspaceId);
  });
}

export async function remove(id: string, workspaceId: string): Promise<void> {
  await db.service.delete({ where: { id, workspaceId } });
}

export async function listChecks(
  id: string,
  workspaceId: string,
  params: ListServiceChecksParams,
): Promise<ListServiceChecksResult> {
  const service = await get(id, workspaceId);
  if (!service) throw new ServiceNotFoundError(id);

  const pageSize = params.pageSize ?? env.LIST_PAGE_SIZE;

  const where: Prisma.ServiceCheckWhereInput = { workspaceId, serviceId: id };

  const decoded = params.cursor ? decodeCursor(params.cursor) : null;
  const cursor = decoded && decoded.w === workspaceId ? decoded : null;
  if (cursor) {
    const cursorDate = new Date(cursor.t);
    where.OR = [
      { checkedAt: { lt: cursorDate } },
      { checkedAt: cursorDate, id: { lt: cursor.id } },
    ];
  }

  const rows = await db.serviceCheck.findMany({
    where,
    orderBy: [{ checkedAt: "desc" }, { id: "desc" }],
    take: pageSize + 1,
  });

  const hasMore = rows.length > pageSize;
  const items = hasMore ? rows.slice(0, pageSize) : rows;
  const nextCursor = hasMore
    ? encodeCursor(workspaceId, items[items.length - 1])
    : null;

  return { items, nextCursor };
}

// Shared by both checkNow() (manual trigger) and scheduler.ts (tick) so the
// flip-detection logic is never duplicated (plan.md "Планировщик проверок").
export async function applyCheckResult(
  service: Service,
  outcome: CheckOutcome,
): Promise<Service> {
  const result = nextState(
    {
      status: service.currentStatus,
      consecutiveFailures: service.consecutiveFailures,
    },
    { ok: outcome.ok },
    service.retries,
  );

  const now = new Date();

  await db.serviceCheck.create({
    data: {
      workspaceId: service.workspaceId,
      serviceId: service.id,
      serviceWorkspaceId: service.workspaceId,
      status: outcome.ok ? ServiceStatus.UP : ServiceStatus.DOWN,
      responseTimeMs: outcome.responseTimeMs,
      message: outcome.message ?? null,
      checkedAt: now,
    },
  });

  // The Alert is written before the new status is persisted: the scheduler
  // only logs a failed check, so a flip committed ahead of its Alert would
  // never be re-detected and the Alert would be lost for good. This way a
  // failed Alert write leaves the service on its old status and the next
  // check retries the same flip.
  if (result.flipped) {
    // TODO(i18n): category/message are persisted to the DB as literal Russian text — migrating to translation keys needs a data migration for existing rows, out of scope for Phase C.
    await alertsService.create(service.workspaceId, {
      category: "Сервисы",
      severity: result.status === ServiceStatus.DOWN ? "critical" : "info",
      source: service.name,
      message:
        outcome.message ??
        (result.status === ServiceStatus.DOWN
          ? "Сервис недоступен"
          : "Сервис снова доступен"),
    });
    await emitWebhookEvent(service.workspaceId, "SERVICE_STATUS", {
      serviceId: service.id,
      name: service.name,
      status: result.status,
      previousStatus: service.currentStatus,
      message: outcome.message ?? null,
    });
  }

  const updated = await db.service.update({
    where: { id: service.id, workspaceId: service.workspaceId },
    data: {
      currentStatus: result.status,
      consecutiveFailures: result.consecutiveFailures,
      lastCheckedAt: now,
      lastResponseTimeMs: outcome.responseTimeMs,
      lastMessage: outcome.message ?? null,
      nextCheckAt: new Date(now.getTime() + service.intervalSeconds * 1000),
    },
  });

  return updated;
}

export async function checkNow(
  id: string,
  workspaceId: string,
): Promise<Service> {
  // Allowed even when isActive is false — this is an explicit manual
  // trigger, unlike the scheduler sweep below which only picks up active
  // services.
  const service = await get(id, workspaceId);
  if (!service) throw new ServiceNotFoundError(id);
  const outcome = await runCheck(service);
  return applyCheckResult(service, outcome);
}

// NOT workspace-scoped — the only such query in this file, and
// deliberately so: this is a process-level scheduler sweep across every
// tenant (the app runs as a single long-lived Node process shared by all
// workspaces), keyed off the [isActive, nextCheckAt] index. Must only ever
// be called from scheduler.ts — never from a request handler, which would
// leak cross-workspace data.
export async function listDueForCheck(now: Date): Promise<Service[]> {
  return db.service.findMany({
    where: { isActive: true, nextCheckAt: { lte: now } },
  });
}
