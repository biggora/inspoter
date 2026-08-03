import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import * as dashboardsService from "@/lib/services/dashboards";
import { resolveWidgetData } from "@/lib/services/dashboard-widget-data";
import { GRID_COLUMNS } from "@/lib/dashboards/grid";
import { specFor } from "@/lib/dashboards/widget-kinds";
import { WEATHER_DEFAULT_LOCATION } from "@/lib/validation/dashboards";
import type { ServerMetricsPayload } from "@/lib/dashboards/widget-payloads";

let workspaceId: string;
let otherWorkspaceId: string;

async function createWorkspace(): Promise<string> {
  const workspace = await db.workspace.create({
    data: {
      name: "Dashboards Test Workspace",
      slug: `dash-${randomUUID()}`,
      updatedAt: new Date(),
    },
  });
  return workspace.id;
}

beforeAll(async () => {
  workspaceId = await createWorkspace();
  otherWorkspaceId = await createWorkspace();
});

afterAll(async () => {
  for (const id of [workspaceId, otherWorkspaceId]) {
    if (id) await db.workspace.delete({ where: { id } }).catch(() => {});
  }
});

async function freshDashboard(name = "Board") {
  return dashboardsService.create(workspaceId, { name });
}

/**
 * Agent-origin servers, created directly: they need no ProviderCredential and
 * no snapshot, which is all listLocalServerMetrics() asks of a row. Names are
 * prefixed and zero-padded so the listing's displayName order is the order the
 * ids come back in.
 */
async function createAgentServers(prefix: string, count: number) {
  const run = randomUUID();
  const created = [];
  for (let index = 0; index < count; index += 1) {
    created.push(
      await db.localServer.create({
        data: {
          workspaceId,
          origin: "AGENT",
          displayName: `${prefix}-${run}-${index}`,
        },
      }),
    );
  }
  return created;
}

describe("create / list / getWithWidgets", () => {
  it("creates a dashboard and returns it in the workspace listing", async () => {
    const dashboard = await freshDashboard(`board-${randomUUID()}`);

    const listed = await dashboardsService.list(workspaceId);
    expect(listed.some((entry) => entry.id === dashboard.id)).toBe(true);
    expect(dashboard.isDefault).toBe(false);
  });

  it("assigns increasing positions so the tab order is stable", async () => {
    const first = await freshDashboard(`pos-a-${randomUUID()}`);
    const second = await freshDashboard(`pos-b-${randomUUID()}`);

    expect(second.position).toBeGreaterThan(first.position);
  });

  it("does not leak dashboards across workspaces", async () => {
    const dashboard = await freshDashboard(`iso-${randomUUID()}`);

    expect(
      await dashboardsService.getWithWidgets(dashboard.id, otherWorkspaceId),
    ).toBeNull();
    const listed = await dashboardsService.list(otherWorkspaceId);
    expect(listed.some((entry) => entry.id === dashboard.id)).toBe(false);
  });
});

describe("getLandingDashboard", () => {
  it("returns null for a workspace with no dashboards", async () => {
    const emptyWorkspaceId = await createWorkspace();
    try {
      expect(
        await dashboardsService.getLandingDashboard(emptyWorkspaceId),
      ).toBeNull();
    } finally {
      await db.workspace.delete({ where: { id: emptyWorkspaceId } });
    }
  });

  it("falls back to the first dashboard by position when none is flagged", async () => {
    const scopedWorkspaceId = await createWorkspace();
    try {
      const first = await dashboardsService.create(scopedWorkspaceId, {
        name: "First",
      });
      await dashboardsService.create(scopedWorkspaceId, { name: "Second" });

      const landing =
        await dashboardsService.getLandingDashboard(scopedWorkspaceId);
      expect(landing?.id).toBe(first.id);
    } finally {
      await db.workspace.delete({ where: { id: scopedWorkspaceId } });
    }
  });

  it("prefers the flagged dashboard over position", async () => {
    const scopedWorkspaceId = await createWorkspace();
    try {
      await dashboardsService.create(scopedWorkspaceId, { name: "First" });
      const second = await dashboardsService.create(scopedWorkspaceId, {
        name: "Second",
      });
      await dashboardsService.setDefault(second.id, scopedWorkspaceId);

      const landing =
        await dashboardsService.getLandingDashboard(scopedWorkspaceId);
      expect(landing?.id).toBe(second.id);
    } finally {
      await db.workspace.delete({ where: { id: scopedWorkspaceId } });
    }
  });
});

describe("setDefault", () => {
  it("moves the flag off the previous start dashboard", async () => {
    const scopedWorkspaceId = await createWorkspace();
    try {
      const first = await dashboardsService.create(scopedWorkspaceId, {
        name: "First",
      });
      const second = await dashboardsService.create(scopedWorkspaceId, {
        name: "Second",
      });

      await dashboardsService.setDefault(first.id, scopedWorkspaceId);
      await dashboardsService.setDefault(second.id, scopedWorkspaceId);

      const rows = await dashboardsService.list(scopedWorkspaceId);
      expect(rows.filter((row) => row.isDefault).map((row) => row.id)).toEqual([
        second.id,
      ]);
    } finally {
      await db.workspace.delete({ where: { id: scopedWorkspaceId } });
    }
  });

  it("refuses a dashboard from another workspace", async () => {
    const dashboard = await freshDashboard(`def-${randomUUID()}`);

    await expect(
      dashboardsService.setDefault(dashboard.id, otherWorkspaceId),
    ).rejects.toBeInstanceOf(dashboardsService.DashboardNotFoundError);
  });
});

describe("rename / remove", () => {
  it("renames a dashboard", async () => {
    const dashboard = await freshDashboard(`ren-${randomUUID()}`);
    const renamed = await dashboardsService.rename(
      dashboard.id,
      workspaceId,
      "Прод",
    );
    expect(renamed.name).toBe("Прод");
  });

  it("deletes a dashboard together with its widgets", async () => {
    const dashboard = await freshDashboard(`del-${randomUUID()}`);
    const widget = await dashboardsService.addWidget(
      dashboard.id,
      workspaceId,
      {
        kind: "CLOCK",
      },
    );

    await dashboardsService.remove(dashboard.id, workspaceId);

    expect(
      await db.dashboardWidget.findUnique({ where: { id: widget.id } }),
    ).toBeNull();
  });

  it("refuses to rename or delete across workspaces", async () => {
    const dashboard = await freshDashboard(`x-${randomUUID()}`);

    await expect(
      dashboardsService.rename(dashboard.id, otherWorkspaceId, "hijack"),
    ).rejects.toBeInstanceOf(dashboardsService.DashboardNotFoundError);
    await expect(
      dashboardsService.remove(dashboard.id, otherWorkspaceId),
    ).rejects.toBeInstanceOf(dashboardsService.DashboardNotFoundError);
  });
});

describe("addWidget", () => {
  it("places the first widget at the origin with its default size", async () => {
    const dashboard = await freshDashboard(`w1-${randomUUID()}`);
    const widget = await dashboardsService.addWidget(
      dashboard.id,
      workspaceId,
      {
        kind: "CLOCK",
      },
    );

    const spec = specFor("CLOCK");
    expect(widget).toMatchObject({
      x: 0,
      y: 0,
      w: spec.defaultSize.w,
      h: spec.defaultSize.h,
    });
  });

  it("packs the next widget into the free space beside the first", async () => {
    const dashboard = await freshDashboard(`w2-${randomUUID()}`);
    await dashboardsService.addWidget(dashboard.id, workspaceId, {
      kind: "CLOCK",
    });
    const second = await dashboardsService.addWidget(
      dashboard.id,
      workspaceId,
      { kind: "CLOCK" },
    );

    expect(second.y).toBe(0);
    expect(second.x).toBe(specFor("CLOCK").defaultSize.w);
    expect(second.x + second.w).toBeLessThanOrEqual(GRID_COLUMNS);
  });

  it("stores a validated config and fills in its defaults", async () => {
    const dashboard = await freshDashboard(`w3-${randomUUID()}`);
    const widget = await dashboardsService.addWidget(
      dashboard.id,
      workspaceId,
      { kind: "CLOCK", config: { format: "12h" } },
    );

    expect(widget.config).toMatchObject({
      format: "12h",
      showSeconds: false,
      showDate: true,
    });
  });

  // The widget picker creates every kind with no config at all, so a kind whose
  // schema cannot default itself would be impossible to add.
  it("adds a weather widget with no config at its default location", async () => {
    const dashboard = await freshDashboard(`w3b-${randomUUID()}`);
    const widget = await dashboardsService.addWidget(
      dashboard.id,
      workspaceId,
      { kind: "WEATHER" },
    );

    expect(widget.config).toMatchObject({
      ...WEATHER_DEFAULT_LOCATION,
      unit: "celsius",
    });
  });

  it("rejects a config that does not match the kind", async () => {
    const dashboard = await freshDashboard(`w4-${randomUUID()}`);

    await expect(
      dashboardsService.addWidget(dashboard.id, workspaceId, {
        kind: "WEATHER",
        config: { label: "Рига", latitude: 999, longitude: 0 },
      }),
    ).rejects.toBeInstanceOf(dashboardsService.DashboardWidgetConfigError);
  });

  it("refuses to add a widget to another workspace's dashboard", async () => {
    const dashboard = await freshDashboard(`w5-${randomUUID()}`);

    await expect(
      dashboardsService.addWidget(dashboard.id, otherWorkspaceId, {
        kind: "CLOCK",
      }),
    ).rejects.toBeInstanceOf(dashboardsService.DashboardNotFoundError);
  });
});

describe("updateWidgetConfig / removeWidget", () => {
  it("replaces the stored config", async () => {
    const dashboard = await freshDashboard(`c1-${randomUUID()}`);
    const widget = await dashboardsService.addWidget(
      dashboard.id,
      workspaceId,
      {
        kind: "NOTE",
      },
    );

    const updated = await dashboardsService.updateWidgetConfig(
      widget.id,
      dashboard.id,
      workspaceId,
      { text: "дежурство: Аня" },
    );

    expect(updated.config).toEqual({ text: "дежурство: Аня" });
  });

  it("rejects a widget id that belongs to another dashboard", async () => {
    const dashboardA = await freshDashboard(`c2-${randomUUID()}`);
    const dashboardB = await freshDashboard(`c3-${randomUUID()}`);
    const widget = await dashboardsService.addWidget(
      dashboardA.id,
      workspaceId,
      { kind: "CLOCK" },
    );

    await expect(
      dashboardsService.updateWidgetConfig(
        widget.id,
        dashboardB.id,
        workspaceId,
        {},
      ),
    ).rejects.toBeInstanceOf(dashboardsService.DashboardWidgetNotFoundError);
    await expect(
      dashboardsService.removeWidget(widget.id, dashboardB.id, workspaceId),
    ).rejects.toBeInstanceOf(dashboardsService.DashboardWidgetNotFoundError);
  });

  it("deletes a widget", async () => {
    const dashboard = await freshDashboard(`c4-${randomUUID()}`);
    const widget = await dashboardsService.addWidget(
      dashboard.id,
      workspaceId,
      {
        kind: "CLOCK",
      },
    );

    await dashboardsService.removeWidget(widget.id, dashboard.id, workspaceId);

    const reloaded = await dashboardsService.getWithWidgets(
      dashboard.id,
      workspaceId,
    );
    expect(reloaded?.widgets).toEqual([]);
  });
});

describe("saveLayout", () => {
  async function boardWithTwoWidgets() {
    const dashboard = await freshDashboard(`l-${randomUUID()}`);
    const first = await dashboardsService.addWidget(dashboard.id, workspaceId, {
      kind: "CLOCK",
    });
    const second = await dashboardsService.addWidget(
      dashboard.id,
      workspaceId,
      {
        kind: "CLOCK",
      },
    );
    return { dashboard, first, second };
  }

  it("persists a legal layout", async () => {
    const { dashboard, first, second } = await boardWithTwoWidgets();

    await dashboardsService.saveLayout(dashboard.id, workspaceId, [
      { id: first.id, x: 0, y: 2, w: 3, h: 2 },
      { id: second.id, x: 0, y: 0, w: 3, h: 2 },
    ]);

    const reloaded = await dashboardsService.getWithWidgets(
      dashboard.id,
      workspaceId,
    );
    // getWithWidgets orders by (y, x), so the swapped tile now comes first.
    expect(reloaded?.widgets.map((widget) => widget.id)).toEqual([
      second.id,
      first.id,
    ]);
    expect(reloaded?.widgets[1]).toMatchObject({ y: 2 });
  });

  it("rejects overlapping rectangles", async () => {
    const { dashboard, first, second } = await boardWithTwoWidgets();

    await expect(
      dashboardsService.saveLayout(dashboard.id, workspaceId, [
        { id: first.id, x: 0, y: 0, w: 4, h: 2 },
        { id: second.id, x: 2, y: 1, w: 4, h: 2 },
      ]),
    ).rejects.toBeInstanceOf(dashboardsService.DashboardLayoutValidationError);
  });

  it("rejects a partial layout", async () => {
    const { dashboard, first } = await boardWithTwoWidgets();

    await expect(
      dashboardsService.saveLayout(dashboard.id, workspaceId, [
        { id: first.id, x: 0, y: 0, w: 3, h: 2 },
      ]),
    ).rejects.toBeInstanceOf(dashboardsService.DashboardLayoutValidationError);
  });

  it("rejects a duplicated widget id", async () => {
    const { dashboard, first } = await boardWithTwoWidgets();

    await expect(
      dashboardsService.saveLayout(dashboard.id, workspaceId, [
        { id: first.id, x: 0, y: 0, w: 3, h: 2 },
        { id: first.id, x: 3, y: 0, w: 3, h: 2 },
      ]),
    ).rejects.toBeInstanceOf(dashboardsService.DashboardLayoutValidationError);
  });

  it("rejects a widget from another dashboard", async () => {
    const { dashboard, first, second } = await boardWithTwoWidgets();
    const foreign = await boardWithTwoWidgets();

    await expect(
      dashboardsService.saveLayout(dashboard.id, workspaceId, [
        { id: first.id, x: 0, y: 0, w: 3, h: 2 },
        { id: foreign.first.id, x: 3, y: 0, w: 3, h: 2 },
      ]),
    ).rejects.toBeInstanceOf(dashboardsService.DashboardLayoutValidationError);
    expect(second.id).toBeTruthy();
  });

  it("rejects a size outside the kind's envelope", async () => {
    const { dashboard, first, second } = await boardWithTwoWidgets();
    const max = specFor("CLOCK").maxSize;

    await expect(
      dashboardsService.saveLayout(dashboard.id, workspaceId, [
        { id: first.id, x: 0, y: 0, w: 3, h: max.h + 1 },
        { id: second.id, x: 3, y: 0, w: 3, h: 2 },
      ]),
    ).rejects.toBeInstanceOf(dashboardsService.DashboardLayoutValidationError);
  });

  it("refuses a layout addressed to another workspace", async () => {
    const { dashboard, first, second } = await boardWithTwoWidgets();

    await expect(
      dashboardsService.saveLayout(dashboard.id, otherWorkspaceId, [
        { id: first.id, x: 0, y: 0, w: 3, h: 2 },
        { id: second.id, x: 3, y: 0, w: 3, h: 2 },
      ]),
    ).rejects.toBeInstanceOf(dashboardsService.DashboardNotFoundError);
  });
});

describe("resolveWidgetData", () => {
  it("resolves a weather widget without coordinates to no reading", async () => {
    const data = await resolveWidgetData(workspaceId, [
      {
        id: "weather-unconfigured",
        kind: "WEATHER",
        config: {
          label: "",
          latitude: null,
          longitude: null,
          unit: "celsius",
        },
      },
    ]);

    // No reading and no error: a tile with no location must not reach the
    // weather provider at all.
    expect(data["weather-unconfigured"]).toEqual({
      kind: "WEATHER",
      data: null,
    });
  });

  it("shows only the selected servers, and counts them", async () => {
    const servers = await createAgentServers("multi", 3);

    const data = await resolveWidgetData(workspaceId, [
      {
        id: "servers-two",
        kind: "SERVER_METRICS",
        config: {
          localServerIds: [servers[0].id, servers[2].id],
          limit: 5,
        },
      },
    ]);

    const payload = data["servers-two"];
    expect(payload).toMatchObject({ kind: "SERVER_METRICS" });
    const serverMetrics = (payload as { data: ServerMetricsPayload }).data;
    expect(serverMetrics.servers.map((s) => s.localServerId)).toEqual([
      servers[0].id,
      servers[2].id,
    ]);
    // "and N more" is about the selection, not the whole workspace.
    expect(serverMetrics.totalCount).toBe(2);
  });

  it("reads a widget still holding the pre-multi-select localServerId", async () => {
    const servers = await createAgentServers("legacy", 2);

    const data = await resolveWidgetData(workspaceId, [
      {
        id: "servers-legacy",
        kind: "SERVER_METRICS",
        config: { localServerId: servers[1].id, limit: 5 },
      },
    ]);

    const serverMetrics = (
      data["servers-legacy"] as { data: ServerMetricsPayload }
    ).data;
    expect(serverMetrics.servers.map((s) => s.localServerId)).toEqual([
      servers[1].id,
    ]);
  });
});
