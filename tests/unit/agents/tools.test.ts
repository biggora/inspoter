import { describe, expect, it, vi } from "vitest";
import {
  buildAgentToolset,
  frameToolResult,
  toolResultToText,
  truncate,
} from "@/lib/agents/tools";
import { MCP_SCOPES } from "@/lib/mcp/scopes";
import { ALL_TOOLS } from "@/lib/mcp/server";

vi.mock("@/lib/config/env", () => ({
  env: { AGENT_TOOL_RESULT_MAX_CHARS: 40 },
}));

// Permission is structural here: a tool outside the agent's scopes is absent
// from the array, not refused at call time. These tests pin that property and
// the skill narrowing that sits on top of it.

describe("buildAgentToolset", () => {
  it("offers nothing to an agent with no scopes", () => {
    expect(buildAgentToolset([])).toEqual([]);
  });

  it("offers the whole catalogue to an agent with every scope", () => {
    expect(buildAgentToolset(MCP_SCOPES)).toHaveLength(ALL_TOOLS.length);
  });

  it("offers only the tools the granted scopes select", () => {
    const toolset = buildAgentToolset(["logs:read"]);
    expect(toolset.length).toBeGreaterThan(0);
    expect(toolset.every((tool) => tool.scope === "logs:read")).toBe(true);
  });

  it("keeps management tools out of the public MCP scope set", () => {
    expect(MCP_SCOPES).not.toContain("management:read");
    expect(MCP_SCOPES).not.toContain("management:write");
    expect(buildAgentToolset(["management:read"])).toEqual([
      expect.objectContaining({ name: "management_snapshot_get" }),
    ]);
  });

  it("intersects with a skill's allowlist, never widening it", () => {
    const logsOnly = buildAgentToolset(["logs:read"]);
    const name = logsOnly[0].name;

    // A name the agent's scopes do not cover cannot be added back by a skill.
    const narrowed = buildAgentToolset(["logs:read"], [name, "mail_send"]);
    expect(narrowed.map((tool) => tool.name)).toEqual([name]);
  });

  it("advertises a JSON Schema object for every tool it offers", () => {
    for (const tool of buildAgentToolset(MCP_SCOPES)) {
      expect(tool.definition.name).toBe(tool.name);
      expect(tool.definition.description.length).toBeGreaterThan(0);
      expect(tool.definition.inputSchema).toMatchObject({ type: "object" });
    }
  });
});

describe("toolResultToText", () => {
  it("joins text blocks and reports the error flag", () => {
    expect(
      toolResultToText({
        content: [
          { type: "text", text: "first" },
          { type: "text", text: "second" },
        ],
        isError: true,
      }),
    ).toEqual({ text: "first\nsecond", isError: true });
  });

  it("truncates a result that would eat the run's token budget", () => {
    const { text } = toolResultToText({
      content: [{ type: "text", text: "x".repeat(100) }],
    });
    expect(text).toContain("[truncated 60 characters]");
  });
});

describe("truncate", () => {
  it("leaves a short string alone", () => {
    expect(truncate("short", 40)).toBe("short");
  });
});

describe("frameToolResult", () => {
  it("wraps the answer in the delimiters the system prompt names", () => {
    const framed = frameToolResult("logs_search", "[]");
    expect(framed.startsWith("<<<TOOL_RESULT name=logs_search")).toBe(true);
    expect(framed.endsWith("TOOL_RESULT>>>")).toBe(true);
  });
});
