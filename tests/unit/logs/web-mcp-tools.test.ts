import { describe, expect, it, vi } from "vitest";

import {
  createLogsTools,
  type LogsToolDeps,
} from "@/components/logs/web-mcp-tools";
import type { LogEntryDto } from "@/components/logs/api";
import { expectToolError, expectToolJson } from "../web-mcp/test-utils";

const NOW = "2026-01-01T00:00:00.000Z";

function makeLog(overrides: Partial<LogEntryDto> = {}): LogEntryDto {
  return {
    id: "log-1",
    level: "error",
    source: "edge-node",
    message: "Connection refused.",
    details: "stack trace",
    timestamp: NOW,
    ...overrides,
  };
}

function makeDeps(overrides: Partial<LogsToolDeps> = {}): LogsToolDeps {
  return {
    fetchLogs: vi
      .fn()
      .mockResolvedValue({ items: [makeLog()], nextCursor: "cur-2" }),
    ...overrides,
  };
}

function logsSearch(deps: LogsToolDeps) {
  const [tool] = createLogsTools(deps);
  return tool;
}

describe("createLogsTools", () => {
  it("exposes a single logs_search tool with a non-empty title", () => {
    const tools = createLogsTools(makeDeps());

    expect(tools.map((tool) => tool.name)).toEqual(["logs_search"]);
    expect(tools[0].title).toBe("Search logs");
  });

  it("flags the tool read-only and its output untrusted", () => {
    expect(logsSearch(makeDeps()).annotations).toEqual({
      readOnlyHint: true,
      untrustedContentHint: true,
    });
  });

  it("forwards every filter and returns a compact projection", async () => {
    const deps = makeDeps();

    const result = await logsSearch(deps).execute({
      query: "refused",
      level: "error",
      source: "edge-node",
      sort: "asc",
      cursor: "cur-1",
    });

    expect(deps.fetchLogs).toHaveBeenCalledWith({
      query: "refused",
      level: "error",
      source: "edge-node",
      sort: "asc",
      cursor: "cur-1",
    });
    expect(expectToolJson(result)).toEqual({
      logs: [
        {
          id: "log-1",
          timestamp: NOW,
          level: "error",
          source: "edge-node",
          message: "Connection refused.",
        },
      ],
      nextCursor: "cur-2",
      truncated: false,
    });
  });

  it("omits every filter that was not given", async () => {
    const deps = makeDeps();

    await logsSearch(deps).execute({});

    expect(deps.fetchLogs).toHaveBeenCalledWith({
      query: undefined,
      level: undefined,
      source: undefined,
      sort: undefined,
      cursor: undefined,
    });
  });

  it("truncates long log messages", async () => {
    const deps = makeDeps({
      fetchLogs: vi.fn().mockResolvedValue({
        items: [makeLog({ message: "x".repeat(500) })],
        nextCursor: null,
      }),
    });

    const result = await logsSearch(deps).execute({});
    const { logs } = expectToolJson<{ logs: { message: string }[] }>(result);

    expect(logs[0].message).toHaveLength(161);
    expect(logs[0].message.endsWith("…")).toBe(true);
  });

  // A trimmed page's cursor points past the entries that were cut, so handing
  // it back would silently skip them.
  it("trims the page to limit and withholds the cursor", async () => {
    const deps = makeDeps({
      fetchLogs: vi.fn().mockResolvedValue({
        items: [
          makeLog({ id: "log-1" }),
          makeLog({ id: "log-2" }),
          makeLog({ id: "log-3" }),
        ],
        nextCursor: "cur-2",
      }),
    });

    const result = await logsSearch(deps).execute({ limit: 2 });
    const payload = expectToolJson<{
      logs: { id: string }[];
      nextCursor: string | null;
      truncated: boolean;
    }>(result);

    expect(payload.logs.map((entry) => entry.id)).toEqual(["log-1", "log-2"]);
    expect(payload.nextCursor).toBeNull();
    expect(payload.truncated).toBe(true);
  });

  it("defaults the limit to 10 and advertises it as optional", () => {
    const schema = logsSearch(makeDeps()).inputSchema as {
      required?: string[];
      properties?: Record<string, { default?: unknown }>;
    };

    expect(schema.required ?? []).not.toContain("limit");
    expect(schema.properties?.limit?.default).toBe(10);
  });

  it("rejects a limit above 50 without calling the api", async () => {
    const deps = makeDeps();

    const result = await logsSearch(deps).execute({ limit: 51 });

    expect(expectToolError(result)).toContain("Invalid input");
    expect(deps.fetchLogs).not.toHaveBeenCalled();
  });

  it("surfaces a rejecting fetch as an error result", async () => {
    const deps = makeDeps({
      fetchLogs: vi
        .fn()
        .mockRejectedValue(new Error("Couldn't load logs. Try again.")),
    });

    const result = await logsSearch(deps).execute({});

    expect(result.isError).toBe(true);
    expect(expectToolError(result)).toBe("Couldn't load logs. Try again.");
  });
});
