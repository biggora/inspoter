import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type { AuthContext } from "@/lib/auth/dal";
import type { Operator } from "@/generated/prisma/client";
import { db } from "@/lib/db";

const auth = vi.hoisted(() => ({
  context: null as AuthContext | null,
}));

vi.mock("@/lib/auth/dal", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/dal")>();
  return {
    ...actual,
    requireAuthWithWorkspaceHeader: vi.fn(async () => auth.context!),
  };
});

const PREFIX = `dashboards-api-${randomUUID()}`;
let operator: Operator;
let workspaceId: string;
let otherWorkspaceId: string;

function jsonRequest(path: string, method: string, body?: unknown) {
  return new NextRequest(`http://localhost${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-Inspoter-Workspace": workspaceId,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

beforeAll(async () => {
  operator = await db.operator.create({
    data: { username: `${PREFIX}-operator` },
  });
  const [main, other] = await Promise.all([
    db.workspace.create({
      data: {
        name: `${PREFIX}-main`,
        slug: `${PREFIX}-main`,
        members: { create: { operatorId: operator.id, role: "OWNER" } },
      },
    }),
    db.workspace.create({
      data: { name: `${PREFIX}-other`, slug: `${PREFIX}-other` },
    }),
  ]);
  workspaceId = main.id;
  otherWorkspaceId = other.id;
});

beforeEach(async () => {
  const workspace = await db.workspace.findUniqueOrThrow({
    where: { id: workspaceId },
  });
  auth.context = { workspace, operator };
});

afterAll(async () => {
  await db.workspace.deleteMany({
    where: { id: { in: [workspaceId, otherWorkspaceId] } },
  });
  await db.operator.deleteMany({ where: { id: operator.id } });
});

async function createDashboard(name = `board-${randomUUID()}`) {
  const { POST } = await import("@/app/api/dashboards/route");
  const response = await POST(jsonRequest("/api/dashboards", "POST", { name }));
  expect(response.status).toBe(201);
  return (await response.json()) as { id: string; name: string };
}

async function addWidget(dashboardId: string, kind: string, config?: unknown) {
  const { POST } = await import("@/app/api/dashboards/[id]/widgets/route");
  const response = await POST(
    jsonRequest(`/api/dashboards/${dashboardId}/widgets`, "POST", {
      kind,
      ...(config === undefined ? {} : { config }),
    }),
    { params: Promise.resolve({ id: dashboardId }) },
  );
  return response;
}

describe("POST /api/dashboards", () => {
  it("creates a dashboard and journals it", async () => {
    const dashboard = await createDashboard(`${PREFIX}-created`);

    expect(
      await db.dashboard.findUnique({ where: { id: dashboard.id } }),
    ).not.toBeNull();
    const activity = await db.activity.findFirst({
      where: { workspaceId, entityType: "dashboard", entityId: dashboard.id },
    });
    expect(activity?.action).toBe("create");
  });

  it("rejects an empty name with a field-level error", async () => {
    const { POST } = await import("@/app/api/dashboards/route");
    const response = await POST(
      jsonRequest("/api/dashboards", "POST", { name: "  " }),
    );

    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: { path: string[] }[] };
    expect(body.error[0].path).toEqual(["name"]);
  });
});

describe("GET /api/dashboards", () => {
  it("lists only this workspace's dashboards", async () => {
    const mine = await createDashboard(`${PREFIX}-mine`);
    const foreign = await db.dashboard.create({
      data: {
        workspaceId: otherWorkspaceId,
        name: "foreign",
        updatedAt: new Date(),
      },
    });

    const { GET } = await import("@/app/api/dashboards/route");
    const response = await GET(jsonRequest("/api/dashboards", "GET"));
    const body = (await response.json()) as { id: string }[];

    expect(body.some((entry) => entry.id === mine.id)).toBe(true);
    expect(body.some((entry) => entry.id === foreign.id)).toBe(false);
  });
});

describe("PATCH /api/dashboards/[id]", () => {
  it("renames a dashboard", async () => {
    const dashboard = await createDashboard();
    const { PATCH } = await import("@/app/api/dashboards/[id]/route");

    const response = await PATCH(
      jsonRequest(`/api/dashboards/${dashboard.id}`, "PATCH", {
        name: "Прод",
      }),
      { params: Promise.resolve({ id: dashboard.id }) },
    );

    expect(response.status).toBe(200);
    expect((await response.json()).name).toBe("Прод");
  });

  it("promotes a dashboard to the start dashboard", async () => {
    const first = await createDashboard();
    const second = await createDashboard();
    const { PATCH } = await import("@/app/api/dashboards/[id]/route");

    for (const id of [first.id, second.id]) {
      await PATCH(
        jsonRequest(`/api/dashboards/${id}`, "PATCH", { isDefault: true }),
        { params: Promise.resolve({ id }) },
      );
    }

    const flagged = await db.dashboard.findMany({
      where: { workspaceId, isDefault: true },
      select: { id: true },
    });
    expect(flagged).toEqual([{ id: second.id }]);
  });

  it("rejects a body that changes nothing", async () => {
    const dashboard = await createDashboard();
    const { PATCH } = await import("@/app/api/dashboards/[id]/route");

    const response = await PATCH(
      jsonRequest(`/api/dashboards/${dashboard.id}`, "PATCH", {}),
      { params: Promise.resolve({ id: dashboard.id }) },
    );

    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("NOTHING_TO_UPDATE");
  });

  it("returns 404 for another workspace's dashboard", async () => {
    const foreign = await db.dashboard.create({
      data: {
        workspaceId: otherWorkspaceId,
        name: "foreign",
        updatedAt: new Date(),
      },
    });
    const { PATCH } = await import("@/app/api/dashboards/[id]/route");

    const response = await PATCH(
      jsonRequest(`/api/dashboards/${foreign.id}`, "PATCH", { name: "hijack" }),
      { params: Promise.resolve({ id: foreign.id }) },
    );

    expect(response.status).toBe(404);
    expect((await response.json()).error).toBe("DASHBOARD_NOT_FOUND");
  });
});

describe("DELETE /api/dashboards/[id]", () => {
  it("deletes the dashboard and its widgets", async () => {
    const dashboard = await createDashboard();
    const widgetResponse = await addWidget(dashboard.id, "CLOCK");
    const widget = (await widgetResponse.json()) as { id: string };

    const { DELETE } = await import("@/app/api/dashboards/[id]/route");
    const response = await DELETE(
      jsonRequest(`/api/dashboards/${dashboard.id}`, "DELETE"),
      { params: Promise.resolve({ id: dashboard.id }) },
    );

    expect(response.status).toBe(204);
    expect(
      await db.dashboardWidget.findUnique({ where: { id: widget.id } }),
    ).toBeNull();
  });
});

describe("POST /api/dashboards/[id]/widgets", () => {
  it("adds a widget with a server-chosen position", async () => {
    const dashboard = await createDashboard();

    const response = await addWidget(dashboard.id, "CLOCK");

    expect(response.status).toBe(201);
    const widget = await response.json();
    expect(widget).toMatchObject({ kind: "CLOCK", x: 0, y: 0 });
    expect(widget.w).toBeGreaterThan(0);
  });

  it("rejects an unknown kind", async () => {
    const dashboard = await createDashboard();

    const response = await addWidget(dashboard.id, "TEAPOT");

    expect(response.status).toBe(400);
  });

  it("rejects a config the kind does not accept", async () => {
    const dashboard = await createDashboard();

    const response = await addWidget(dashboard.id, "WEATHER", {
      label: "Рига",
      latitude: 400,
      longitude: 0,
    });

    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe(
      "DASHBOARD_WIDGET_CONFIG_INVALID",
    );
  });
});

describe("PATCH /api/dashboards/[id]/widgets/[widgetId]", () => {
  it("updates a widget config", async () => {
    const dashboard = await createDashboard();
    const widget = (await (await addWidget(dashboard.id, "NOTE")).json()) as {
      id: string;
    };

    const { PATCH } =
      await import("@/app/api/dashboards/[id]/widgets/[widgetId]/route");
    const response = await PATCH(
      jsonRequest(
        `/api/dashboards/${dashboard.id}/widgets/${widget.id}`,
        "PATCH",
        { config: { text: "смена: Аня" } },
      ),
      {
        params: Promise.resolve({ id: dashboard.id, widgetId: widget.id }),
      },
    );

    expect(response.status).toBe(200);
    expect((await response.json()).config).toEqual({ text: "смена: Аня" });
  });

  it("returns 404 when the widget is not on that dashboard", async () => {
    const dashboardA = await createDashboard();
    const dashboardB = await createDashboard();
    const widget = (await (await addWidget(dashboardA.id, "CLOCK")).json()) as {
      id: string;
    };

    const { DELETE } =
      await import("@/app/api/dashboards/[id]/widgets/[widgetId]/route");
    const response = await DELETE(
      jsonRequest(
        `/api/dashboards/${dashboardB.id}/widgets/${widget.id}`,
        "DELETE",
      ),
      {
        params: Promise.resolve({ id: dashboardB.id, widgetId: widget.id }),
      },
    );

    expect(response.status).toBe(404);
    expect((await response.json()).error).toBe("DASHBOARD_WIDGET_NOT_FOUND");
  });
});

describe("PATCH /api/dashboards/[id]/layout", () => {
  async function boardWithTwoWidgets() {
    const dashboard = await createDashboard();
    const first = (await (await addWidget(dashboard.id, "CLOCK")).json()) as {
      id: string;
    };
    const second = (await (await addWidget(dashboard.id, "CLOCK")).json()) as {
      id: string;
    };
    return { dashboard, first, second };
  }

  it("persists a legal layout", async () => {
    const { dashboard, first, second } = await boardWithTwoWidgets();
    const { PATCH } = await import("@/app/api/dashboards/[id]/layout/route");

    const response = await PATCH(
      jsonRequest(`/api/dashboards/${dashboard.id}/layout`, "PATCH", {
        items: [
          { id: first.id, x: 0, y: 2, w: 3, h: 2 },
          { id: second.id, x: 0, y: 0, w: 3, h: 2 },
        ],
      }),
      { params: Promise.resolve({ id: dashboard.id }) },
    );

    expect(response.status).toBe(204);
    const moved = await db.dashboardWidget.findUniqueOrThrow({
      where: { id: first.id },
    });
    expect(moved).toMatchObject({ x: 0, y: 2 });
  });

  it("rejects overlapping tiles with a 400", async () => {
    const { dashboard, first, second } = await boardWithTwoWidgets();
    const { PATCH } = await import("@/app/api/dashboards/[id]/layout/route");

    const response = await PATCH(
      jsonRequest(`/api/dashboards/${dashboard.id}/layout`, "PATCH", {
        items: [
          { id: first.id, x: 0, y: 0, w: 4, h: 2 },
          { id: second.id, x: 2, y: 1, w: 4, h: 2 },
        ],
      }),
      { params: Promise.resolve({ id: dashboard.id }) },
    );

    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("DASHBOARD_LAYOUT_INVALID");
  });

  it("rejects coordinates outside the grid before reaching the service", async () => {
    const { dashboard, first, second } = await boardWithTwoWidgets();
    const { PATCH } = await import("@/app/api/dashboards/[id]/layout/route");

    const response = await PATCH(
      jsonRequest(`/api/dashboards/${dashboard.id}/layout`, "PATCH", {
        items: [
          { id: first.id, x: 15, y: 0, w: 3, h: 2 },
          { id: second.id, x: 0, y: 0, w: 3, h: 2 },
        ],
      }),
      { params: Promise.resolve({ id: dashboard.id }) },
    );

    expect(response.status).toBe(400);
    expect(Array.isArray((await response.json()).error)).toBe(true);
  });
});

describe("GET /api/dashboards/[id]/data", () => {
  it("returns a payload per widget, keyed by widget id", async () => {
    const dashboard = await createDashboard();
    const clock = (await (await addWidget(dashboard.id, "CLOCK")).json()) as {
      id: string;
    };
    const logs = (await (await addWidget(dashboard.id, "LOGS")).json()) as {
      id: string;
    };

    const { GET } = await import("@/app/api/dashboards/[id]/data/route");
    const response = await GET(
      jsonRequest(`/api/dashboards/${dashboard.id}/data`, "GET"),
      { params: Promise.resolve({ id: dashboard.id }) },
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      widgetData: Record<string, { kind?: string; data?: unknown }>;
    };
    expect(body.widgetData[clock.id]).toEqual({ kind: "CLOCK" });
    expect(body.widgetData[logs.id]).toMatchObject({ kind: "LOGS" });
  });

  it("returns 404 for another workspace's dashboard", async () => {
    const foreign = await db.dashboard.create({
      data: {
        workspaceId: otherWorkspaceId,
        name: "foreign",
        updatedAt: new Date(),
      },
    });
    const { GET } = await import("@/app/api/dashboards/[id]/data/route");

    const response = await GET(
      jsonRequest(`/api/dashboards/${foreign.id}/data`, "GET"),
      { params: Promise.resolve({ id: foreign.id }) },
    );

    expect(response.status).toBe(404);
  });
});
