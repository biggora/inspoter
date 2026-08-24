import { describe, expect, it, vi } from "vitest";

import {
  createActivityTools,
  type ActivityToolDeps,
} from "@/components/activity/web-mcp-tools";
import type { ActivityDto } from "@/components/activity/api";
import { expectToolError, expectToolJson } from "../web-mcp/test-utils";

const NOW = "2026-01-01T00:00:00.000Z";

function makeActivity(overrides: Partial<ActivityDto> = {}): ActivityDto {
  return {
    id: "act-1",
    operatorId: "op-1",
    operatorName: "alice",
    action: "create",
    entityType: "channel",
    entityId: "chan-1",
    entityLabel: "prod",
    details: null,
    timestamp: NOW,
    ...overrides,
  };
}

function makeDeps(overrides: Partial<ActivityToolDeps> = {}): ActivityToolDeps {
  return {
    fetchActivities: vi
      .fn()
      .mockResolvedValue({ items: [makeActivity()], nextCursor: "cur-2" }),
    ...overrides,
  };
}

function activitySearch(deps: ActivityToolDeps) {
  const [tool] = createActivityTools(deps);
  return tool;
}

describe("createActivityTools", () => {
  it("exposes a single activity_search tool with a non-empty title", () => {
    const tools = createActivityTools(makeDeps());

    expect(tools.map((tool) => tool.name)).toEqual(["activity_search"]);
    expect(tools[0].title).toBe("Search activity");
  });

  it("flags the tool read-only and its output untrusted", () => {
    expect(activitySearch(makeDeps()).annotations).toEqual({
      readOnlyHint: true,
      untrustedContentHint: true,
    });
  });

  it("forwards every filter and returns a compact projection", async () => {
    const deps = makeDeps();

    const result = await activitySearch(deps).execute({
      query: "prod",
      action: "create",
      entityType: "channel",
      operatorId: "op-1",
      sort: "asc",
      cursor: "cur-1",
    });

    expect(deps.fetchActivities).toHaveBeenCalledWith({
      query: "prod",
      action: "create",
      entityType: "channel",
      operatorId: "op-1",
      sort: "asc",
      cursor: "cur-1",
    });
    expect(expectToolJson(result)).toEqual({
      activities: [
        {
          id: "act-1",
          timestamp: NOW,
          operatorId: "op-1",
          operatorName: "alice",
          action: "create",
          entityType: "channel",
          entityId: "chan-1",
          entityLabel: "prod",
        },
      ],
      nextCursor: "cur-2",
      truncated: false,
    });
  });

  it("omits every filter that was not given", async () => {
    const deps = makeDeps();

    await activitySearch(deps).execute({});

    expect(deps.fetchActivities).toHaveBeenCalledWith({
      query: undefined,
      action: undefined,
      entityType: undefined,
      operatorId: undefined,
      sort: undefined,
      cursor: undefined,
    });
  });

  it("truncates a long entity label and keeps a null one null", async () => {
    const deps = makeDeps({
      fetchActivities: vi.fn().mockResolvedValue({
        items: [
          makeActivity({ entityLabel: "x".repeat(500) }),
          makeActivity({ id: "act-2", entityLabel: null }),
        ],
        nextCursor: null,
      }),
    });

    const result = await activitySearch(deps).execute({});
    const { activities } = expectToolJson<{
      activities: { entityLabel: string | null }[];
    }>(result);

    expect(activities[0].entityLabel).toHaveLength(81);
    expect(activities[0].entityLabel?.endsWith("…")).toBe(true);
    expect(activities[1].entityLabel).toBeNull();
  });

  // A trimmed page's cursor points past the entries that were cut, so handing
  // it back would silently skip them.
  it("trims the page to limit and withholds the cursor", async () => {
    const deps = makeDeps({
      fetchActivities: vi.fn().mockResolvedValue({
        items: [
          makeActivity({ id: "act-1" }),
          makeActivity({ id: "act-2" }),
          makeActivity({ id: "act-3" }),
        ],
        nextCursor: "cur-2",
      }),
    });

    const result = await activitySearch(deps).execute({ limit: 2 });
    const payload = expectToolJson<{
      activities: { id: string }[];
      nextCursor: string | null;
      truncated: boolean;
    }>(result);

    expect(payload.activities.map((entry) => entry.id)).toEqual([
      "act-1",
      "act-2",
    ]);
    expect(payload.nextCursor).toBeNull();
    expect(payload.truncated).toBe(true);
  });

  it("defaults the limit to 10 and advertises it as optional", () => {
    const schema = activitySearch(makeDeps()).inputSchema as {
      required?: string[];
      properties?: Record<string, { default?: unknown }>;
    };

    expect(schema.required ?? []).not.toContain("limit");
    expect(schema.properties?.limit?.default).toBe(10);
  });

  it("rejects a limit above 50 without calling the api", async () => {
    const deps = makeDeps();

    const result = await activitySearch(deps).execute({ limit: 51 });

    expect(expectToolError(result)).toContain("Invalid input");
    expect(deps.fetchActivities).not.toHaveBeenCalled();
  });

  it("surfaces a rejecting fetch as an error result", async () => {
    const deps = makeDeps({
      fetchActivities: vi
        .fn()
        .mockRejectedValue(new Error("Failed to load activity.")),
    });

    const result = await activitySearch(deps).execute({});

    expect(result.isError).toBe(true);
    expect(expectToolError(result)).toBe("Failed to load activity.");
  });
});
