import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AlertDto } from "@/components/alerts/api";
import { UNCATEGORIZED_FILTER } from "@/components/alerts/api";
import {
  createAlertsTools,
  type AlertsToolDeps,
} from "@/components/alerts/web-mcp-tools";
import type { WebMcpTool } from "@/lib/web-mcp/define-tool";
import { expectToolError, expectToolJson } from "../web-mcp/test-utils";

function makeAlert(overrides: Partial<AlertDto> = {}): AlertDto {
  return {
    id: "alert-1",
    alertCategoryId: "cat-1",
    alertCategory: { id: "cat-1", name: "Disk", systemKey: null },
    categorySource: "MANUAL",
    severity: "critical",
    source: "monitor",
    message: "Disk usage above 90% on web-01",
    messageKey: null,
    messageParams: null,
    timestamp: "2026-01-02T00:00:00.000Z",
    ...overrides,
  };
}

describe("createAlertsTools", () => {
  let deps: AlertsToolDeps;

  /** Looks a tool up by its advertised name, failing loudly when it is absent. */
  function toolNamed(tools: WebMcpTool[], name: string): WebMcpTool {
    const tool = tools.find((candidate) => candidate.name === name);
    if (!tool) throw new Error(`No tool named "${name}" was registered.`);
    return tool;
  }

  beforeEach(() => {
    deps = {
      fetchAlerts: vi.fn().mockResolvedValue({
        items: [makeAlert(), makeAlert({ id: "alert-2" })],
        nextCursor: null,
      }),
      listCategories: vi.fn().mockResolvedValue([
        { id: "cat-1", name: "Disk", systemKey: null },
        { id: "cat-2", name: "Certificate expiry", systemKey: "cert" },
      ]),
      setCategoryBulk: vi.fn().mockResolvedValue({ updated: 2 }),
      createCategory: vi
        .fn()
        .mockResolvedValue({ id: "cat-3", name: "Network", systemKey: null }),
      refresh: vi.fn(),
    };
  });

  it("registers the tool names the server-side catalog uses", () => {
    expect(createAlertsTools(deps).map((tool) => tool.name)).toEqual([
      "alerts_search",
      "alert_categories_list",
      "alerts_set_category",
      "alert_category_create",
    ]);
  });

  it("gives every tool a non-empty title for agent clients that caption them", () => {
    for (const tool of createAlertsTools(deps)) {
      expect(tool.title.length).toBeGreaterThan(0);
    }
  });

  describe("alerts_search", () => {
    it("passes the 'none' uncategorized sentinel straight through", async () => {
      const tool = toolNamed(createAlertsTools(deps), "alerts_search");

      await tool.execute({ categoryId: UNCATEGORIZED_FILTER });

      expect(UNCATEGORIZED_FILTER).toBe("none");
      expect(deps.fetchAlerts).toHaveBeenCalledWith({
        query: undefined,
        categoryId: "none",
        severity: undefined,
        sort: "desc",
      });
    });

    it("names the 'none' sentinel in its description, so an agent can find it", () => {
      const tool = toolNamed(createAlertsTools(deps), "alerts_search");

      expect(tool.description).toContain(`"${UNCATEGORIZED_FILTER}"`);
    });

    it("forwards the query, severity and sort", async () => {
      const tool = toolNamed(createAlertsTools(deps), "alerts_search");

      await tool.execute({ query: "disk", severity: "critical", sort: "asc" });

      expect(deps.fetchAlerts).toHaveBeenCalledWith({
        query: "disk",
        categoryId: undefined,
        severity: "critical",
        sort: "asc",
      });
    });

    it("returns a compact row carrying both the category id and its name", async () => {
      const tool = toolNamed(createAlertsTools(deps), "alerts_search");

      const result = await tool.execute({});
      const payload = expectToolJson<{
        total: number;
        hasMore: boolean;
        alerts: Record<string, unknown>[];
      }>(result);

      expect(payload.total).toBe(2);
      expect(payload.hasMore).toBe(false);
      expect(payload.alerts[0]).toEqual({
        id: "alert-1",
        message: "Disk usage above 90% on web-01",
        severity: "critical",
        source: "monitor",
        categoryId: "cat-1",
        categoryName: "Disk",
        categorySource: "MANUAL",
        timestamp: "2026-01-02T00:00:00.000Z",
      });
    });

    it("trims a long message to keep the output small", async () => {
      deps.fetchAlerts = vi.fn().mockResolvedValue({
        items: [makeAlert({ message: "x".repeat(500) })],
        nextCursor: "cursor-1",
      });
      const tool = toolNamed(createAlertsTools(deps), "alerts_search");

      const result = await tool.execute({});
      const payload = expectToolJson<{
        hasMore: boolean;
        alerts: { message: string }[];
      }>(result);

      expect(payload.alerts[0].message).toHaveLength(161);
      expect(payload.alerts[0].message.endsWith("…")).toBe(true);
      expect(payload.hasMore).toBe(true);
    });

    it("caps the returned rows at the requested limit", async () => {
      const tool = toolNamed(createAlertsTools(deps), "alerts_search");

      const result = await tool.execute({ limit: 1 });

      expect(expectToolJson<{ alerts: unknown[] }>(result).alerts).toHaveLength(
        1,
      );
    });

    it("reads without writing and flags third-party alert text as untrusted", () => {
      const tool = toolNamed(createAlertsTools(deps), "alerts_search");

      expect(tool.annotations).toEqual({
        readOnlyHint: true,
        untrustedContentHint: true,
      });
    });
  });

  it("alert_categories_list marks the Inspoter-owned categories as system ones", async () => {
    const tool = toolNamed(createAlertsTools(deps), "alert_categories_list");

    const result = await tool.execute({});

    expect(expectToolJson(result)).toEqual({
      total: 2,
      categories: [
        { id: "cat-1", name: "Disk", isSystem: false },
        { id: "cat-2", name: "Certificate expiry", isSystem: true },
      ],
    });
  });

  describe("alerts_set_category", () => {
    it("files the given alert ids under the given category and refreshes", async () => {
      const tool = toolNamed(createAlertsTools(deps), "alerts_set_category");

      const result = await tool.execute({
        alertIds: ["alert-1", "alert-2"],
        categoryId: "cat-1",
      });

      expect(deps.setCategoryBulk).toHaveBeenCalledWith(
        ["alert-1", "alert-2"],
        "cat-1",
      );
      expect(deps.refresh).toHaveBeenCalledTimes(1);
      expect(expectToolJson(result)).toEqual({ updated: 2 });
    });

    it("clears the category when categoryId is null", async () => {
      const tool = toolNamed(createAlertsTools(deps), "alerts_set_category");

      await tool.execute({ alertIds: ["alert-1"], categoryId: null });

      expect(deps.setCategoryBulk).toHaveBeenCalledWith(["alert-1"], null);
    });

    it("rejects more than 50 ids via schema validation, without calling the API", async () => {
      const tool = toolNamed(createAlertsTools(deps), "alerts_set_category");

      const result = await tool.execute({
        alertIds: Array.from({ length: 51 }, (_, i) => `alert-${i}`),
        categoryId: "cat-1",
      });

      expect(expectToolError(result)).toContain("Invalid input");
      expect(deps.setCategoryBulk).not.toHaveBeenCalled();
    });
  });

  it("alert_category_create returns the new category id and refreshes", async () => {
    const tool = toolNamed(createAlertsTools(deps), "alert_category_create");

    const result = await tool.execute({ name: "Network" });

    expect(deps.createCategory).toHaveBeenCalledWith("Network");
    expect(deps.refresh).toHaveBeenCalledTimes(1);
    expect(expectToolJson(result)).toEqual({
      categoryId: "cat-3",
      name: "Network",
    });
  });

  it("surfaces an API failure as an error result", async () => {
    deps.createCategory = vi
      .fn()
      .mockRejectedValue(new Error("A category with that name exists."));
    const tool = toolNamed(createAlertsTools(deps), "alert_category_create");

    const result = await tool.execute({ name: "Disk" });

    expect(expectToolError(result)).toBe("A category with that name exists.");
    expect(deps.refresh).not.toHaveBeenCalled();
  });
});
