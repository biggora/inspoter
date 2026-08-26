import { createHash } from "node:crypto";
import { db } from "@/lib/db";
import { listRange } from "@/lib/services/calendar";
import type { ExecutiveBriefPeriod } from "@/generated/prisma/client";

const SECTION_LIMIT = 20;
const ACTIVITY_LIMIT = 30;
export const EXECUTIVE_SNAPSHOT_MAX_BYTES = 128 * 1024;

export interface ExecutiveSnapshotItem {
  ref: string;
  type: string;
  id: string;
  label: string;
  href: string;
  state?: string;
  detail?: string;
  observedAt: string;
}

export interface ExecutiveSnapshotV1 {
  schemaVersion: 1;
  workspace: { id: string; name: string; timeZone: string };
  period: ExecutiveBriefPeriod;
  asOf: string;
  window: {
    lookbackStart: string;
    horizonEnd: string;
  };
  totals: Record<string, number>;
  sections: {
    alerts: ExecutiveSnapshotItem[];
    services: ExecutiveSnapshotItem[];
    kanban: ExecutiveSnapshotItem[];
    reminders: ExecutiveSnapshotItem[];
    calendar: ExecutiveSnapshotItem[];
    mail: ExecutiveSnapshotItem[];
    messages: ExecutiveSnapshotItem[];
    errors: ExecutiveSnapshotItem[];
    decisions: ExecutiveSnapshotItem[];
    activity: ExecutiveSnapshotItem[];
  };
  truncation: string[];
}

export interface CanonicalExecutiveSnapshot {
  snapshot: ExecutiveSnapshotV1;
  canonical: string;
  hash: string;
  byteLength: number;
}

function boundedText(value: string | null | undefined, max = 500): string {
  if (!value) return "";
  const normalized = value
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const points = Array.from(normalized);
  return points.length <= max
    ? normalized
    : `${points.slice(0, max).join("")}…`;
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, canonicalValue(entry)]),
  );
}

export function canonicalizeExecutiveSnapshot(
  snapshot: ExecutiveSnapshotV1,
): CanonicalExecutiveSnapshot {
  const canonical = JSON.stringify(canonicalValue(snapshot));
  const byteLength = Buffer.byteLength(canonical, "utf8");
  return {
    snapshot,
    canonical,
    byteLength,
    hash: createHash("sha256").update(canonical, "utf8").digest("hex"),
  };
}

function item(
  type: string,
  id: string,
  label: string,
  href: string,
  observedAt: Date,
  options: { state?: string; detail?: string } = {},
): ExecutiveSnapshotItem {
  return {
    ref: `${type}:${id}`,
    type,
    id,
    label: boundedText(label, 200),
    href,
    observedAt: observedAt.toISOString(),
    ...(options.state ? { state: options.state } : {}),
    ...(options.detail ? { detail: boundedText(options.detail) } : {}),
  };
}

function capSection<T>(rows: readonly T[], limit: number): T[] {
  return rows.slice(0, limit);
}

export async function buildExecutiveSnapshot(
  workspaceId: string,
  period: ExecutiveBriefPeriod,
  now = new Date(),
): Promise<CanonicalExecutiveSnapshot> {
  const lookbackMs =
    period === "DAILY" ? 24 * 60 * 60_000 : 7 * 24 * 60 * 60_000;
  const horizonMs =
    period === "DAILY" ? 7 * 24 * 60 * 60_000 : 14 * 24 * 60 * 60_000;
  const lookbackStart = new Date(now.getTime() - lookbackMs);
  const horizonEnd = new Date(now.getTime() + horizonMs);

  const [
    workspace,
    alerts,
    services,
    cards,
    reminders,
    calendarRange,
    mail,
    messages,
    logs,
    decisions,
    activity,
    totals,
  ] = await Promise.all([
    db.workspace.findUniqueOrThrow({
      where: { id: workspaceId },
      select: { id: true, name: true, timeZone: true },
    }),
    db.alert.findMany({
      where: { workspaceId, timestamp: { gte: lookbackStart } },
      orderBy: [{ timestamp: "desc" }, { id: "desc" }],
      take: SECTION_LIMIT + 1,
      select: {
        id: true,
        message: true,
        severity: true,
        source: true,
        timestamp: true,
      },
    }),
    db.service.findMany({
      where: { workspaceId, isActive: true, currentStatus: { not: "UP" } },
      orderBy: [{ currentStatus: "asc" }, { name: "asc" }, { id: "asc" }],
      take: SECTION_LIMIT + 1,
      select: {
        id: true,
        name: true,
        currentStatus: true,
        lastMessage: true,
        updatedAt: true,
      },
    }),
    db.kanbanCard.findMany({
      where: {
        workspaceId,
        completedAt: null,
        dueDate: { not: null, lte: horizonEnd },
      },
      orderBy: [{ dueDate: "asc" }, { id: "asc" }],
      take: SECTION_LIMIT + 1,
      select: {
        id: true,
        title: true,
        priority: true,
        dueDate: true,
        updatedAt: true,
      },
    }),
    db.reminder.findMany({
      where: {
        workspaceId,
        isActive: true,
        nextTriggerAt: { not: null, lte: horizonEnd },
      },
      orderBy: [{ nextTriggerAt: "asc" }, { id: "asc" }],
      take: SECTION_LIMIT + 1,
      select: {
        id: true,
        title: true,
        kind: true,
        nextTriggerAt: true,
        updatedAt: true,
      },
    }),
    listRange(workspaceId, now, horizonEnd),
    db.mailItem.findMany({
      where: { workspaceId, isRead: false, folder: { specialUse: "INBOX" } },
      orderBy: [{ receivedAt: "desc" }, { id: "desc" }],
      take: SECTION_LIMIT + 1,
      select: {
        id: true,
        subject: true,
        fromAddress: true,
        fromName: true,
        snippet: true,
        receivedAt: true,
        account: { select: { name: true } },
        folder: { select: { name: true } },
      },
    }),
    db.message.findMany({
      where: { workspaceId, isRead: false },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: SECTION_LIMIT + 1,
      select: {
        id: true,
        content: true,
        author: true,
        createdAt: true,
        channel: { select: { name: true } },
      },
    }),
    db.logEntry.findMany({
      where: {
        workspaceId,
        timestamp: { gte: lookbackStart },
        level: { in: ["warn", "warning", "error", "fatal"] },
      },
      orderBy: [{ timestamp: "desc" }, { id: "desc" }],
      take: SECTION_LIMIT + 1,
      select: {
        id: true,
        level: true,
        source: true,
        message: true,
        timestamp: true,
      },
    }),
    db.decision.findMany({
      where: {
        workspaceId,
        OR: [
          { status: "OPEN" },
          { status: "DEFERRED", deferredUntil: { lte: now } },
          {
            status: "APPROVED",
            executionStatus: {
              in: ["READY", "RUNNING", "FAILED", "NEEDS_REBIND"],
            },
          },
        ],
      },
      orderBy: [{ priority: "desc" }, { dueAt: "asc" }, { id: "asc" }],
      take: SECTION_LIMIT + 1,
      select: {
        id: true,
        title: true,
        status: true,
        priority: true,
        executionStatus: true,
        dueAt: true,
        updatedAt: true,
      },
    }),
    db.activity.findMany({
      where: { workspaceId, timestamp: { gte: lookbackStart } },
      orderBy: [{ timestamp: "desc" }, { id: "desc" }],
      take: ACTIVITY_LIMIT + 1,
      select: {
        id: true,
        action: true,
        entityType: true,
        entityLabel: true,
        operatorName: true,
        timestamp: true,
      },
    }),
    Promise.all([
      db.alert.count({
        where: { workspaceId, timestamp: { gte: lookbackStart } },
      }),
      db.service.count({
        where: { workspaceId, isActive: true, currentStatus: { not: "UP" } },
      }),
      db.kanbanCard.count({
        where: {
          workspaceId,
          completedAt: null,
          dueDate: { not: null, lte: horizonEnd },
        },
      }),
      db.reminder.count({
        where: {
          workspaceId,
          isActive: true,
          nextTriggerAt: { not: null, lte: horizonEnd },
        },
      }),
      db.mailItem.count({
        where: { workspaceId, isRead: false, folder: { specialUse: "INBOX" } },
      }),
      db.message.count({ where: { workspaceId, isRead: false } }),
      db.decision.count({
        where: { workspaceId, status: { in: ["OPEN", "DEFERRED"] } },
      }),
      db.logEntry.count({
        where: {
          workspaceId,
          timestamp: { gte: lookbackStart },
          level: { in: ["warn", "warning", "error", "fatal"] },
        },
      }),
      db.activity.count({
        where: { workspaceId, timestamp: { gte: lookbackStart } },
      }),
    ]),
  ]);

  if (calendarRange.truncated) {
    throw new Error(
      "Executive snapshot cannot report an exact Calendar occurrence total.",
    );
  }

  const calendarItems = calendarRange.events
    .slice(0, SECTION_LIMIT + 1)
    .map((event) =>
      item(
        "calendar",
        event.id,
        event.title,
        "/calendar",
        new Date(event.startAt),
        {
          state: event.allDay ? "ALL_DAY" : "SCHEDULED",
          detail: event.location ?? undefined,
        },
      ),
    );

  const sections: ExecutiveSnapshotV1["sections"] = {
    alerts: capSection(
      alerts.map((row) =>
        item(
          "alert",
          row.id,
          row.message,
          `/alerts?alert=${row.id}`,
          row.timestamp,
          {
            state: row.severity,
            detail: row.source,
          },
        ),
      ),
      SECTION_LIMIT,
    ),
    services: capSection(
      services.map((row) =>
        item(
          "service",
          row.id,
          row.name,
          `/services/${row.id}`,
          row.updatedAt,
          {
            state: row.currentStatus,
            detail: row.lastMessage ?? undefined,
          },
        ),
      ),
      SECTION_LIMIT,
    ),
    kanban: capSection(
      cards.map((row) =>
        item(
          "kanban",
          row.id,
          row.title,
          `/kanban?card=${row.id}`,
          row.updatedAt,
          {
            state: row.priority,
            detail: row.dueDate
              ? `Due ${row.dueDate.toISOString()}`
              : undefined,
          },
        ),
      ),
      SECTION_LIMIT,
    ),
    reminders: capSection(
      reminders.map((row) =>
        item("reminder", row.id, row.title, "/calendar", row.updatedAt, {
          state: row.kind,
          detail: row.nextTriggerAt?.toISOString(),
        }),
      ),
      SECTION_LIMIT,
    ),
    calendar: capSection(calendarItems, SECTION_LIMIT),
    mail: capSection(
      mail.map((row) =>
        item(
          "mail",
          row.id,
          row.subject || "(no subject)",
          `/mail?item=${row.id}`,
          row.receivedAt,
          {
            state: `${row.account.name}/${row.folder.name}`,
            detail: `${row.fromName ?? row.fromAddress}: ${row.snippet ?? ""}`,
          },
        ),
      ),
      SECTION_LIMIT,
    ),
    messages: capSection(
      messages.map((row) =>
        item(
          "message",
          row.id,
          row.channel.name,
          `/messages?channel=${row.channel.name}`,
          row.createdAt,
          {
            state: row.author ?? undefined,
            detail: row.content,
          },
        ),
      ),
      SECTION_LIMIT,
    ),
    errors: capSection(
      logs.map((row) =>
        item(
          "log",
          row.id,
          row.message,
          `/logs?source=${encodeURIComponent(row.source)}`,
          row.timestamp,
          {
            state: row.level,
            detail: row.source,
          },
        ),
      ),
      SECTION_LIMIT,
    ),
    decisions: capSection(
      decisions.map((row) =>
        item(
          "decision",
          row.id,
          row.title,
          `/management?decision=${row.id}`,
          row.updatedAt,
          {
            state: `${row.status}/${row.executionStatus}`,
            detail: row.dueAt ? `Due ${row.dueAt.toISOString()}` : row.priority,
          },
        ),
      ),
      SECTION_LIMIT,
    ),
    activity: capSection(
      activity.map((row) =>
        item(
          "activity",
          row.id,
          row.entityLabel ?? row.entityType,
          "/activity",
          row.timestamp,
          {
            state: row.action,
            detail: row.operatorName,
          },
        ),
      ),
      ACTIVITY_LIMIT,
    ),
  };

  const truncation = [
    ...(alerts.length > SECTION_LIMIT ? ["alerts"] : []),
    ...(services.length > SECTION_LIMIT ? ["services"] : []),
    ...(cards.length > SECTION_LIMIT ? ["kanban"] : []),
    ...(reminders.length > SECTION_LIMIT ? ["reminders"] : []),
    ...(calendarItems.length > SECTION_LIMIT ? ["calendar"] : []),
    ...(mail.length > SECTION_LIMIT ? ["mail"] : []),
    ...(messages.length > SECTION_LIMIT ? ["messages"] : []),
    ...(logs.length > SECTION_LIMIT ? ["errors"] : []),
    ...(decisions.length > SECTION_LIMIT ? ["decisions"] : []),
    ...(activity.length > ACTIVITY_LIMIT ? ["activity"] : []),
    ...(calendarRange.truncated ? ["calendar-expansion"] : []),
  ];

  const snapshot: ExecutiveSnapshotV1 = {
    schemaVersion: 1,
    workspace,
    period,
    asOf: now.toISOString(),
    window: {
      lookbackStart: lookbackStart.toISOString(),
      horizonEnd: horizonEnd.toISOString(),
    },
    totals: {
      alerts: totals[0],
      services: totals[1],
      kanban: totals[2],
      reminders: totals[3],
      mail: totals[4],
      messages: totals[5],
      decisions: totals[6],
      errors: totals[7],
      activity: totals[8],
      calendar: calendarRange.events.length,
    },
    sections,
    truncation,
  };

  const truncationOrder: Array<keyof ExecutiveSnapshotV1["sections"]> = [
    "activity",
    "messages",
    "mail",
    "errors",
    "calendar",
    "reminders",
    "kanban",
    "services",
    "alerts",
    "decisions",
  ];
  let canonical = canonicalizeExecutiveSnapshot(snapshot);
  for (const section of truncationOrder) {
    while (
      canonical.byteLength > EXECUTIVE_SNAPSHOT_MAX_BYTES &&
      snapshot.sections[section].length > 0
    ) {
      snapshot.sections[section].pop();
      if (!snapshot.truncation.includes(section))
        snapshot.truncation.push(section);
      canonical = canonicalizeExecutiveSnapshot(snapshot);
    }
  }
  if (canonical.byteLength > EXECUTIVE_SNAPSHOT_MAX_BYTES) {
    throw new Error("Executive snapshot exceeds its 128 KiB safety limit.");
  }
  return canonical;
}

export function snapshotEvidenceRefs(
  snapshot: ExecutiveSnapshotV1,
): Set<string> {
  return new Set(
    Object.values(snapshot.sections).flatMap((rows) =>
      rows.map((row) => row.ref),
    ),
  );
}
