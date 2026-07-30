import { db } from "@/lib/db";
import type {
  Dashboard,
  DashboardWidget,
  DashboardWidgetKind,
  Prisma,
} from "@/generated/prisma/client";
import {
  findFreeSlot,
  hasOverlaps,
  type GridItem,
} from "@/lib/dashboards/grid";
import { specFor } from "@/lib/dashboards/widget-kinds";
import { parseWidgetConfig } from "@/lib/validation/dashboards";

// Dashboards service — the only Prisma caller for the Dashboards section
// (architecture.md §4.4 convention). Widget placement and layout validation
// delegate to the pure grid engine (src/lib/dashboards/grid.ts), so the browser
// and the database agree on what a legal layout is.

export type DashboardWithWidgets = Dashboard & { widgets: DashboardWidget[] };

export class DashboardNotFoundError extends Error {
  readonly code = "DASHBOARD_NOT_FOUND" as const;
  constructor() {
    super("Dashboard does not exist in this workspace.");
    this.name = "DashboardNotFoundError";
  }
}

export class DashboardWidgetNotFoundError extends Error {
  readonly code = "DASHBOARD_WIDGET_NOT_FOUND" as const;
  constructor() {
    super("Widget does not exist on this dashboard.");
    this.name = "DashboardWidgetNotFoundError";
  }
}

export class DashboardLayoutValidationError extends Error {
  readonly code = "DASHBOARD_LAYOUT_INVALID" as const;
  constructor(message: string) {
    super(message);
    this.name = "DashboardLayoutValidationError";
  }
}

export class DashboardWidgetConfigError extends Error {
  readonly code = "DASHBOARD_WIDGET_CONFIG_INVALID" as const;
  constructor(message: string) {
    super(message);
    this.name = "DashboardWidgetConfigError";
  }
}

const WIDGET_ORDER: Prisma.DashboardWidgetOrderByWithRelationInput[] = [
  { y: "asc" },
  { x: "asc" },
  { id: "asc" },
];

export async function list(workspaceId: string): Promise<Dashboard[]> {
  return db.dashboard.findMany({
    where: { workspaceId },
    orderBy: [{ position: "asc" }, { id: "asc" }],
  });
}

export async function getWithWidgets(
  id: string,
  workspaceId: string,
): Promise<DashboardWithWidgets | null> {
  return db.dashboard.findFirst({
    where: { id, workspaceId },
    include: { widgets: { orderBy: WIDGET_ORDER } },
  });
}

/**
 * The dashboard the section lands on: the one flagged as default, else the
 * first by position. Null only when the workspace has no dashboards at all.
 */
export async function getLandingDashboard(
  workspaceId: string,
): Promise<Dashboard | null> {
  const preferred = await db.dashboard.findFirst({
    where: { workspaceId, isDefault: true },
  });
  if (preferred) return preferred;
  return db.dashboard.findFirst({
    where: { workspaceId },
    orderBy: [{ position: "asc" }, { id: "asc" }],
  });
}

export async function create(
  workspaceId: string,
  input: { name: string },
): Promise<Dashboard> {
  const { _max } = await db.dashboard.aggregate({
    where: { workspaceId },
    _max: { position: true },
  });
  // `isDefault` stays false: getLandingDashboard() already falls back to the
  // first dashboard by position, so nothing has to be flagged for the section
  // to have a landing target — and leaving it false keeps two concurrent
  // creations from racing for the partial unique index.
  return db.dashboard.create({
    data: {
      workspaceId,
      name: input.name,
      position: (_max.position ?? -1) + 1,
    },
  });
}

export async function rename(
  id: string,
  workspaceId: string,
  name: string,
): Promise<Dashboard> {
  await requireDashboard(id, workspaceId);
  return db.dashboard.update({ where: { id, workspaceId }, data: { name } });
}

/**
 * Promotes one dashboard to the workspace's start dashboard. Clearing the old
 * flag and setting the new one has to be one transaction: the partial unique
 * index (one isDefault row per workspace) would reject the intermediate state.
 */
export async function setDefault(
  id: string,
  workspaceId: string,
): Promise<Dashboard> {
  await requireDashboard(id, workspaceId);
  const [, updated] = await db.$transaction([
    db.dashboard.updateMany({
      where: { workspaceId, isDefault: true, NOT: { id } },
      data: { isDefault: false },
    }),
    db.dashboard.update({
      where: { id, workspaceId },
      data: { isDefault: true },
    }),
  ]);
  return updated;
}

/**
 * Deletes a dashboard; its widgets cascade. No default needs re-pointing —
 * getLandingDashboard() falls back to the first remaining dashboard.
 */
export async function remove(id: string, workspaceId: string): Promise<void> {
  await requireDashboard(id, workspaceId);
  await db.dashboard.delete({ where: { id, workspaceId } });
}

export async function addWidget(
  dashboardId: string,
  workspaceId: string,
  input: { kind: DashboardWidgetKind; config?: unknown },
): Promise<DashboardWidget> {
  await requireDashboard(dashboardId, workspaceId);

  const parsed = parseWidgetConfig(input.kind, input.config);
  if (!parsed.success) {
    throw new DashboardWidgetConfigError(parsed.error.issues[0].message);
  }

  const spec = specFor(input.kind);
  const existing = await db.dashboardWidget.findMany({
    where: { workspaceId, dashboardId },
    select: { id: true, x: true, y: true, w: true, h: true },
  });
  const slot = findFreeSlot(existing, spec.defaultSize);

  return db.dashboardWidget.create({
    data: {
      workspaceId,
      dashboardId,
      dashboardWorkspaceId: workspaceId,
      kind: input.kind,
      x: slot.x,
      y: slot.y,
      w: spec.defaultSize.w,
      h: spec.defaultSize.h,
      config: parsed.data as Prisma.InputJsonValue,
    },
  });
}

export async function updateWidgetConfig(
  widgetId: string,
  dashboardId: string,
  workspaceId: string,
  config: unknown,
): Promise<DashboardWidget> {
  const widget = await requireWidget(widgetId, dashboardId, workspaceId);

  const parsed = parseWidgetConfig(widget.kind, config);
  if (!parsed.success) {
    throw new DashboardWidgetConfigError(parsed.error.issues[0].message);
  }

  return db.dashboardWidget.update({
    where: { id: widgetId, workspaceId },
    data: { config: parsed.data as Prisma.InputJsonValue },
  });
}

export async function removeWidget(
  widgetId: string,
  dashboardId: string,
  workspaceId: string,
): Promise<void> {
  await requireWidget(widgetId, dashboardId, workspaceId);
  await db.dashboardWidget.delete({ where: { id: widgetId, workspaceId } });
}

/**
 * Persists a whole post-drag layout. Rejects a payload that isn't exactly the
 * dashboard's widget set, that exceeds a kind's size envelope, or that overlaps
 * — the same three rules the client applied before sending it, re-checked here
 * because the client is not trusted.
 */
export async function saveLayout(
  dashboardId: string,
  workspaceId: string,
  items: GridItem[],
): Promise<void> {
  await requireDashboard(dashboardId, workspaceId);

  const widgets = await db.dashboardWidget.findMany({
    where: { workspaceId, dashboardId },
    select: { id: true, kind: true },
  });

  const kindById = new Map(widgets.map((widget) => [widget.id, widget.kind]));
  const uniqueIds = new Set(items.map((item) => item.id));
  if (uniqueIds.size !== items.length) {
    throw new DashboardLayoutValidationError(
      "Layout contains the same widget twice.",
    );
  }
  if (uniqueIds.size !== widgets.length) {
    throw new DashboardLayoutValidationError(
      "Layout must list every widget of this dashboard exactly once.",
    );
  }
  for (const item of items) {
    const kind = kindById.get(item.id);
    if (!kind) {
      throw new DashboardLayoutValidationError(
        "Layout references a widget that does not belong to this dashboard.",
      );
    }
    const { minSize, maxSize } = specFor(kind);
    if (
      item.w < minSize.w ||
      item.w > maxSize.w ||
      item.h < minSize.h ||
      item.h > maxSize.h
    ) {
      throw new DashboardLayoutValidationError(
        "Widget size is outside the allowed range for its type.",
      );
    }
  }
  if (hasOverlaps(items)) {
    throw new DashboardLayoutValidationError("Widgets must not overlap.");
  }

  await db.$transaction(
    items.map((item) =>
      db.dashboardWidget.update({
        where: { id: item.id, workspaceId },
        data: { x: item.x, y: item.y, w: item.w, h: item.h },
      }),
    ),
  );
}

// --- internals ---

async function requireDashboard(
  id: string,
  workspaceId: string,
): Promise<Dashboard> {
  const dashboard = await db.dashboard.findFirst({
    where: { id, workspaceId },
  });
  if (!dashboard) throw new DashboardNotFoundError();
  return dashboard;
}

async function requireWidget(
  widgetId: string,
  dashboardId: string,
  workspaceId: string,
): Promise<DashboardWidget> {
  const widget = await db.dashboardWidget.findFirst({
    where: { id: widgetId, workspaceId, dashboardId },
  });
  if (!widget) throw new DashboardWidgetNotFoundError();
  return widget;
}
