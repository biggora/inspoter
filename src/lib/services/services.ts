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

export async function list(workspaceId: string): Promise<Service[]> {
  return db.service.findMany({
    where: { workspaceId },
    orderBy: { name: "asc" },
  });
}

export async function get(
  id: string,
  workspaceId: string,
): Promise<Service | null> {
  return db.service.findFirst({ where: { id, workspaceId } });
}

export async function create(
  workspaceId: string,
  input: ServiceCreateInput,
): Promise<Service> {
  return db.service.create({
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
      ...(input.timeoutMs !== undefined ? { timeoutMs: input.timeoutMs } : {}),
      ...(input.retries !== undefined ? { retries: input.retries } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      // Picked up on the very next scheduler tick.
      nextCheckAt: new Date(),
    },
  });
}

export async function update(
  id: string,
  workspaceId: string,
  input: ServiceUpdateInput,
): Promise<Service> {
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
    resolvedMonitorType === "HTTP"
      ? (input.url ?? current.url)
      : null;
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

  return db.service.update({
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
      ...(input.timeoutMs !== undefined ? { timeoutMs: input.timeoutMs } : {}),
      ...(input.retries !== undefined ? { retries: input.retries } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      ...(targetChanged
        ? { consecutiveFailures: 0, nextCheckAt: new Date() }
        : {}),
    },
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

  if (result.flipped) {
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
  }

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
