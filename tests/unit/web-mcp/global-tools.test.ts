import { describe, expect, it } from "vitest";

import { createActivityTools } from "@/components/activity/web-mcp-tools";
import { createAlertsTools } from "@/components/alerts/web-mcp-tools";
import { createBookmarksTools } from "@/components/bookmarks/web-mcp-tools";
import { createContactsTools } from "@/components/contacts/web-mcp-tools";
import { createDomainsTools } from "@/components/domains/web-mcp-tools";
import { createKanbanTools } from "@/components/kanban/web-mcp-tools";
import { createLogsTools } from "@/components/logs/web-mcp-tools";
import { createMailTools } from "@/components/mail/web-mcp-tools";
import { createMessagesTools } from "@/components/messages/web-mcp-tools";
import { createNotesTools } from "@/components/notes/web-mcp-tools";
import { createServersTools } from "@/components/servers/web-mcp-tools";
import { createServicesTools } from "@/components/services/web-mcp-tools";
import type { WebMcpTool } from "@/lib/web-mcp/define-tool";

// Guards the composed catalog that src/components/shell/web-mcp-global-tools.tsx
// registers in one `useWebMcpTools` call. A duplicate tool name is the failure
// this file exists for: `registerTool` throws InvalidStateError for the second
// registration of a name, so a collision between two domains would silently
// cost an agent a whole tool at runtime. Everything else here is the budget
// `defineWebMcpTool` only warns about.
//
// Deliberately built from the factories rather than from the shell component:
// the shell is a "use client" React component and its only job is to pass the
// real api clients in, which no assertion here depends on.

/**
 * Stands in for any of the twelve deps interfaces. Every member of every one
 * of them is a function, and none is called while a factory merely builds its
 * tools — the calls happen inside `execute`, which this suite never runs.
 */
function stubDeps<T>(): T {
  return new Proxy({}, { get: () => () => Promise.resolve(undefined) }) as T;
}

/** Same order and same deps shape as the shell's `tools` memo. */
function allTools(): WebMcpTool[] {
  return [
    ...createNotesTools(stubDeps()),
    ...createMailTools(stubDeps()),
    ...createContactsTools(stubDeps()),
    ...createMessagesTools(stubDeps()),
    ...createLogsTools(stubDeps()),
    ...createActivityTools(stubDeps()),
    ...createServicesTools(stubDeps()),
    ...createServersTools(stubDeps()),
    ...createBookmarksTools(stubDeps()),
    ...createDomainsTools(stubDeps()),
    ...createKanbanTools(stubDeps()),
    ...createAlertsTools(stubDeps()),
  ];
}

// Bump deliberately: the count is here so that adding or losing a tool is a
// reviewed change rather than a silent one.
const EXPECTED_TOOL_COUNT = 98;

describe("the global WebMCP catalog", () => {
  it("registers every tool of all twelve domains", () => {
    expect(allTools()).toHaveLength(EXPECTED_TOOL_COUNT);
  });

  it("has no duplicate tool name across domains", () => {
    const names = allTools().map((tool) => tool.name);
    const duplicates = names.filter(
      (name, index) => names.indexOf(name) !== index,
    );

    expect(duplicates).toEqual([]);
    expect(new Set(names).size).toBe(names.length);
  });

  it("gives every tool a non-empty title", () => {
    for (const tool of allTools()) {
      expect(tool.title, tool.name).toBeTruthy();
    }
  });

  it("keeps every description inside the 500-char budget", () => {
    for (const tool of allTools()) {
      expect(tool.description.length, tool.name).toBeGreaterThan(0);
      expect(tool.description.length, tool.name).toBeLessThanOrEqual(500);
    }
  });

  it("keeps every tool name inside the 30-char budget", () => {
    for (const tool of allTools()) {
      expect(tool.name.length, tool.name).toBeLessThanOrEqual(30);
    }
  });

  // A parameter reaches the agent with no description whenever a `.describe()`
  // sits on a schema that is then wrapped — `.nullable()` and friends do not
  // inherit it. That is invisible in the source, which reads as if it were
  // described, so it is asserted here rather than left to the dev-only warning.
  it("describes every advertised parameter, within 150 chars", () => {
    for (const tool of allTools()) {
      const properties = (
        tool.inputSchema as {
          properties?: Record<string, { description?: string }>;
        }
      ).properties;

      for (const [property, schema] of Object.entries(properties ?? {})) {
        const label = `${tool.name}.${property}`;
        expect(schema.description, label).toBeTruthy();
        expect(schema.description!.length, label).toBeLessThanOrEqual(150);
      }
    }
  });
});
