import { describe, expect, it, vi } from "vitest";

import {
  createServicesTools,
  type ServicesToolDeps,
} from "@/components/services/web-mcp-tools";
import type {
  ServiceInput,
  ServiceWithLabelsDto,
} from "@/components/services/api";
import type { WebMcpTool } from "@/lib/web-mcp/define-tool";
import { expectToolError, expectToolJson } from "../web-mcp/test-utils";

const NOW = "2026-01-01T00:00:00.000Z";

function makeService(
  overrides: Partial<ServiceWithLabelsDto> = {},
): ServiceWithLabelsDto {
  return {
    id: "svc-1",
    workspaceId: "ws-1",
    name: "Storefront",
    description: "Public checkout",
    monitorType: "HTTP",
    url: "https://shop.example.com",
    host: null,
    port: null,
    expectedStatusCodes: "200-299",
    intervalSeconds: 60,
    timeoutMs: 5000,
    retries: 3,
    isActive: true,
    currentStatus: "UP",
    consecutiveFailures: 0,
    lastCheckedAt: NOW,
    lastResponseTimeMs: 143,
    lastMessage: null,
    nextCheckAt: NOW,
    createdAt: NOW,
    updatedAt: NOW,
    labels: [{ id: "lbl-1", name: "Production", color: "RED" }],
    ...overrides,
  };
}

function makeDeps(overrides: Partial<ServicesToolDeps> = {}): ServicesToolDeps {
  return {
    list: vi.fn().mockResolvedValue([makeService()]),
    get: vi.fn().mockResolvedValue(makeService()),
    listChecks: vi.fn().mockResolvedValue({ items: [], nextCursor: null }),
    create: vi
      .fn()
      .mockImplementation(async (input: ServiceInput) =>
        makeService({ id: "svc-new", ...input, labels: [] }),
      ),
    update: vi
      .fn()
      .mockImplementation(async (id: string, input: ServiceInput) =>
        makeService({ id, ...input, labels: [] }),
      ),
    remove: vi.fn().mockResolvedValue(undefined),
    checkNow: vi.fn().mockResolvedValue(makeService()),
    setActive: vi
      .fn()
      .mockImplementation(async (id: string, isActive: boolean) =>
        makeService({ id, isActive }),
      ),
    listLabels: vi
      .fn()
      .mockResolvedValue([
        { id: "lbl-1", name: "Production", color: "RED", serviceCount: 4 },
      ]),
    createLabel: vi
      .fn()
      .mockResolvedValue({ id: "lbl-new", name: "Staging", color: "BLUE" }),
    updateLabel: vi
      .fn()
      .mockResolvedValue({ id: "lbl-1", name: "Prod", color: "AMBER" }),
    removeLabel: vi.fn().mockResolvedValue(undefined),
    refresh: vi.fn(),
    ...overrides,
  };
}

function byName(tools: WebMcpTool[], name: string): WebMcpTool {
  const tool = tools.find((candidate) => candidate.name === name);
  if (!tool) throw new Error(`No tool named ${name}`);
  return tool;
}

const EXPECTED_TOOL_NAMES = [
  "services_list",
  "service_get",
  "service_checks",
  "service_labels_list",
  "service_create",
  "service_update",
  "service_set_active",
  "service_check_now",
  "service_delete",
  "service_labels_set",
  "service_label_create",
  "service_label_update",
  "service_label_delete",
];

describe("createServicesTools — catalog", () => {
  it("exposes exactly the expected tool names", () => {
    const names = createServicesTools(makeDeps()).map((tool) => tool.name);

    expect(names).toEqual(EXPECTED_TOOL_NAMES);
  });

  it("gives every tool a non-empty title for clients that caption it", () => {
    for (const tool of createServicesTools(makeDeps())) {
      expect(tool.title, tool.name).toBeTruthy();
      expect(tool.name.length, tool.name).toBeLessThanOrEqual(30);
    }
  });

  it("marks the read tools readOnly and the write tools not", () => {
    const tools = createServicesTools(makeDeps());
    const readOnly = tools
      .filter((tool) => tool.annotations.readOnlyHint)
      .map((tool) => tool.name);

    expect(readOnly).toEqual([
      "services_list",
      "service_get",
      "service_checks",
      "service_labels_list",
    ]);
  });

  it("flags the tools carrying third-party check text as untrusted", () => {
    const tools = createServicesTools(makeDeps());
    const untrusted = tools
      .filter((tool) => tool.annotations.untrustedContentHint)
      .map((tool) => tool.name);

    expect(untrusted).toEqual([
      "service_get",
      "service_checks",
      "service_check_now",
    ]);
  });
});

describe("services_list", () => {
  const services = [
    makeService({ id: "svc-1", name: "Storefront" }),
    makeService({
      id: "svc-2",
      name: "Ledger",
      description: "Invoicing backend",
      url: "https://ledger.internal",
      currentStatus: "DOWN",
    }),
    makeService({
      id: "svc-3",
      name: "Mail relay",
      description: null,
      monitorType: "TCP",
      url: null,
      host: "smtp.example.net",
      port: 587,
    }),
  ];

  function listTool(
    deps = makeDeps({ list: vi.fn().mockResolvedValue(services) }),
  ) {
    return { tool: byName(createServicesTools(deps), "services_list"), deps };
  }

  it("returns a compact row per service and the unfiltered total", async () => {
    const { tool } = listTool();

    const payload = await expectToolJson<{
      total: number;
      matched: number;
      services: Record<string, unknown>[];
    }>(await tool.execute({}));

    expect(payload.total).toBe(3);
    expect(payload.matched).toBe(3);
    expect(payload.services[0]).toEqual({
      id: "svc-1",
      name: "Storefront",
      status: "UP",
      monitorType: "HTTP",
      target: "https://shop.example.com",
      isActive: true,
      labels: ["Production"],
    });
  });

  it("does not leak the full DTO in a row", async () => {
    const { tool } = listTool();

    const payload = await expectToolJson<{
      services: Record<string, unknown>[];
    }>(await tool.execute({}));

    expect(Object.keys(payload.services[0])).toEqual([
      "id",
      "name",
      "status",
      "monitorType",
      "target",
      "isActive",
      "labels",
    ]);
  });

  it("renders a TCP monitor's target as host:port", async () => {
    const { tool } = listTool();

    const payload = await expectToolJson<{
      services: { id: string; target: string }[];
    }>(await tool.execute({ query: "relay" }));

    expect(payload.services[0].target).toBe("smtp.example.net:587");
  });

  it.each([
    ["name", "ledger", "svc-2"],
    ["description", "invoicing", "svc-2"],
    ["url", "ledger.internal", "svc-2"],
    ["host", "smtp.example", "svc-3"],
  ])("filters in process on %s", async (_field, query, expectedId) => {
    const { tool } = listTool();

    const payload = await expectToolJson<{
      matched: number;
      services: { id: string }[];
    }>(await tool.execute({ query }));

    expect(payload.matched).toBe(1);
    expect(payload.services[0].id).toBe(expectedId);
  });

  it("filters by status", async () => {
    const { tool } = listTool();

    const payload = await expectToolJson<{ services: { id: string }[] }>(
      await tool.execute({ status: "DOWN" }),
    );

    expect(payload.services.map((service) => service.id)).toEqual(["svc-2"]);
  });

  it("caps the rows at the limit while still reporting the match count", async () => {
    const { tool } = listTool();

    const payload = await expectToolJson<{
      matched: number;
      services: unknown[];
    }>(await tool.execute({ limit: 2 }));

    expect(payload.matched).toBe(3);
    expect(payload.services).toHaveLength(2);
  });

  it("surfaces a rejecting list call as an error result", async () => {
    const deps = makeDeps({
      list: vi.fn().mockRejectedValue(new Error("Workspace unavailable.")),
    });
    const tool = byName(createServicesTools(deps), "services_list");

    expect(expectToolError(await tool.execute({}))).toBe(
      "Workspace unavailable.",
    );
  });
});

describe("service_get", () => {
  it("trims a long lastMessage to keep the output small", async () => {
    const deps = makeDeps({
      get: vi
        .fn()
        .mockResolvedValue(makeService({ lastMessage: "x".repeat(400) })),
    });
    const tool = byName(createServicesTools(deps), "service_get");

    const payload = await expectToolJson<{ lastMessage: string }>(
      await tool.execute({ id: "svc-1" }),
    );

    expect(payload.lastMessage).toHaveLength(121);
    expect(payload.lastMessage.endsWith("…")).toBe(true);
  });

  it("omits workspaceId and the scheduling bookkeeping from the projection", async () => {
    const deps = makeDeps();
    const tool = byName(createServicesTools(deps), "service_get");

    const payload = await expectToolJson<Record<string, unknown>>(
      await tool.execute({ id: "svc-1" }),
    );

    expect(payload).not.toHaveProperty("workspaceId");
    expect(payload).not.toHaveProperty("nextCheckAt");
    expect(payload).not.toHaveProperty("createdAt");
    expect(payload).not.toHaveProperty("updatedAt");
  });
});

describe("service_checks", () => {
  it("projects each check down to status, timing and message", async () => {
    const deps = makeDeps({
      listChecks: vi.fn().mockResolvedValue({
        nextCursor: "cursor-2",
        items: [
          {
            id: "chk-1",
            workspaceId: "ws-1",
            serviceId: "svc-1",
            serviceWorkspaceId: "ws-1",
            status: "DOWN",
            responseTimeMs: null,
            message: "connect ETIMEDOUT",
            checkedAt: NOW,
            createdAt: NOW,
          },
        ],
      }),
    });
    const tool = byName(createServicesTools(deps), "service_checks");

    const payload = await expectToolJson<{
      nextCursor: string;
      checks: Record<string, unknown>[];
    }>(await tool.execute({ id: "svc-1", pageSize: 5 }));

    expect(deps.listChecks).toHaveBeenCalledWith("svc-1", {
      pageSize: 5,
      cursor: undefined,
    });
    expect(payload.nextCursor).toBe("cursor-2");
    expect(payload.checks[0]).toEqual({
      status: "DOWN",
      responseTimeMs: null,
      message: "connect ETIMEDOUT",
      checkedAt: NOW,
    });
  });
});

describe("service_create", () => {
  it.each([
    ["name", { monitorType: "HTTP", url: "https://a.example" }],
    ["monitorType", { name: "Storefront", url: "https://a.example" }],
  ])(
    "rejects input missing %s without calling create",
    async (_field, input) => {
      const deps = makeDeps();
      const tool = byName(createServicesTools(deps), "service_create");

      expect(expectToolError(await tool.execute(input))).toContain(
        "Invalid input",
      );
      expect(deps.create).not.toHaveBeenCalled();
      expect(deps.refresh).not.toHaveBeenCalled();
    },
  );

  it("creates the monitor and refreshes the visible list", async () => {
    const deps = makeDeps();
    const tool = byName(createServicesTools(deps), "service_create");

    const payload = await expectToolJson<{ id: string; name: string }>(
      await tool.execute({
        name: "Ledger",
        monitorType: "TCP",
        host: "ledger.internal",
        port: 5432,
      }),
    );

    expect(deps.create).toHaveBeenCalledWith({
      name: "Ledger",
      monitorType: "TCP",
      host: "ledger.internal",
      port: 5432,
    });
    expect(deps.refresh).toHaveBeenCalledTimes(1);
    expect(payload.id).toBe("svc-new");
  });
});

// PATCH /api/services/[id] does accept a partial body, but servicesApi.update
// is typed for a whole ServiceInput and serviceUpdateSchema's superRefine
// demands the target fields whenever monitorType is present — so the tool
// reads the service first and layers the caller's changes on top.
describe("service_update — merge over the existing service", () => {
  it("preserves fields the caller omitted", async () => {
    const deps = makeDeps({
      get: vi.fn().mockResolvedValue(
        makeService({
          intervalSeconds: 300,
          timeoutMs: 9000,
          retries: 5,
          expectedStatusCodes: "200,301-399",
        }),
      ),
    });
    const tool = byName(createServicesTools(deps), "service_update");

    await tool.execute({ id: "svc-1", name: "Storefront (EU)" });

    expect(deps.get).toHaveBeenCalledWith("svc-1");
    expect(deps.update).toHaveBeenCalledWith("svc-1", {
      name: "Storefront (EU)",
      description: "Public checkout",
      monitorType: "HTTP",
      url: "https://shop.example.com",
      host: undefined,
      port: undefined,
      expectedStatusCodes: "200,301-399",
      intervalSeconds: 300,
      timeoutMs: 9000,
      retries: 5,
      isActive: true,
      labelIds: ["lbl-1"],
    });
  });

  it("overwrites only the fields the caller sent", async () => {
    const deps = makeDeps();
    const tool = byName(createServicesTools(deps), "service_update");

    await tool.execute({ id: "svc-1", intervalSeconds: 120 });

    expect(deps.update).toHaveBeenCalledWith(
      "svc-1",
      expect.objectContaining({
        name: "Storefront",
        url: "https://shop.example.com",
        intervalSeconds: 120,
      }),
    );
  });

  it("does not update or refresh when reading the service fails", async () => {
    const deps = makeDeps({
      get: vi.fn().mockRejectedValue(new Error("Resource not found.")),
    });
    const tool = byName(createServicesTools(deps), "service_update");

    expect(expectToolError(await tool.execute({ id: "gone", name: "x" }))).toBe(
      "Resource not found.",
    );
    expect(deps.update).not.toHaveBeenCalled();
    expect(deps.refresh).not.toHaveBeenCalled();
  });
});

describe("service_labels_set", () => {
  it("replaces only labelIds and leaves the monitor configuration alone", async () => {
    const deps = makeDeps();
    const tool = byName(createServicesTools(deps), "service_labels_set");

    await tool.execute({ id: "svc-1", labelIds: ["lbl-2", "lbl-3"] });

    expect(deps.update).toHaveBeenCalledWith(
      "svc-1",
      expect.objectContaining({
        name: "Storefront",
        url: "https://shop.example.com",
        labelIds: ["lbl-2", "lbl-3"],
      }),
    );
  });
});

describe("the remaining write tools", () => {
  it("service_set_active pauses via the dedicated endpoint", async () => {
    const deps = makeDeps();
    const tool = byName(createServicesTools(deps), "service_set_active");

    const payload = await expectToolJson<{ isActive: boolean }>(
      await tool.execute({ id: "svc-1", isActive: false }),
    );

    expect(deps.setActive).toHaveBeenCalledWith("svc-1", false);
    expect(deps.get).not.toHaveBeenCalled();
    expect(payload.isActive).toBe(false);
  });

  it("service_check_now returns the fresh status, not the whole DTO", async () => {
    const deps = makeDeps();
    const tool = byName(createServicesTools(deps), "service_check_now");

    const payload = await expectToolJson<Record<string, unknown>>(
      await tool.execute({ id: "svc-1" }),
    );

    expect(deps.checkNow).toHaveBeenCalledWith("svc-1");
    expect(Object.keys(payload)).toEqual([
      "id",
      "name",
      "status",
      "lastResponseTimeMs",
      "lastMessage",
      "lastCheckedAt",
    ]);
  });

  it("service_delete confirms the deletion and refreshes", async () => {
    const deps = makeDeps();
    const tool = byName(createServicesTools(deps), "service_delete");

    const payload = await expectToolJson(await tool.execute({ id: "svc-1" }));

    expect(deps.remove).toHaveBeenCalledWith("svc-1");
    expect(deps.refresh).toHaveBeenCalledTimes(1);
    expect(payload).toEqual({ id: "svc-1", deleted: true });
  });

  it("service_label_create rejects a color outside the preset set", async () => {
    const deps = makeDeps();
    const tool = byName(createServicesTools(deps), "service_label_create");

    expect(
      expectToolError(await tool.execute({ name: "Staging", color: "PINK" })),
    ).toContain("Invalid input");
    expect(deps.createLabel).not.toHaveBeenCalled();
  });

  it("service_label_create accepts a preset color", async () => {
    const deps = makeDeps();
    const tool = byName(createServicesTools(deps), "service_label_create");

    const payload = await expectToolJson(
      await tool.execute({ name: "Staging", color: "BLUE" }),
    );

    expect(deps.createLabel).toHaveBeenCalledWith({
      name: "Staging",
      color: "BLUE",
    });
    expect(payload).toEqual({
      id: "lbl-new",
      name: "Staging",
      color: "BLUE",
    });
  });

  it("service_label_update requires at least one changed field", async () => {
    const deps = makeDeps();
    const tool = byName(createServicesTools(deps), "service_label_update");

    expect(expectToolError(await tool.execute({ id: "lbl-1" }))).toContain(
      "at least one of name or color",
    );
    expect(deps.updateLabel).not.toHaveBeenCalled();
  });

  it("service_label_delete confirms the deletion", async () => {
    const deps = makeDeps();
    const tool = byName(createServicesTools(deps), "service_label_delete");

    const payload = await expectToolJson(await tool.execute({ id: "lbl-1" }));

    expect(deps.removeLabel).toHaveBeenCalledWith("lbl-1");
    expect(payload).toEqual({ id: "lbl-1", deleted: true });
  });
});

describe("service_labels_list", () => {
  it("returns id, name, color and serviceCount per label", async () => {
    const deps = makeDeps();
    const tool = byName(createServicesTools(deps), "service_labels_list");

    const payload = await expectToolJson(await tool.execute({}));

    expect(payload).toEqual({
      labels: [
        { id: "lbl-1", name: "Production", color: "RED", serviceCount: 4 },
      ],
    });
  });
});
