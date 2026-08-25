import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ALL_TOOLS, findTool } from "@/lib/mcp/server";

// `defineTool` publishes title/description/inputSchema/invoke on the definition
// so the in-app agent runtime can advertise the same catalogue to a model
// (src/lib/agents/tools.ts). These assertions pin the properties that runtime
// depends on; tests/unit/mcp/server.test.ts separately pins that /api/mcp is
// unaffected.

// Capabilities deliberately absent from every agent-reachable surface
// (docs/architecture.md §6.6): credentials, membership, backups, power
// actions, and the cascading deletes that take content the caller never saw.
const FORBIDDEN_NAME_FRAGMENTS = [
  "credential",
  "member",
  "power",
  "backup",
  "mail_account_create",
  "mail_account_update",
  "mail_account_delete",
  "board_delete",
  "column_delete",
  "channel_delete",
  "category_delete",
];

describe("MCP tool catalogue", () => {
  it("publishes usable metadata on every definition", () => {
    for (const tool of ALL_TOOLS) {
      expect(tool.title.length, tool.name).toBeGreaterThan(0);
      expect(tool.description.length, tool.name).toBeGreaterThan(0);
      expect(typeof tool.readOnly, tool.name).toBe("boolean");
      expect(typeof tool.invoke, tool.name).toBe("function");
      expect(tool.inputSchema, tool.name).toBeInstanceOf(z.ZodObject);
    }
  });

  it("converts every input schema to JSON Schema in input mode", () => {
    for (const tool of ALL_TOOLS) {
      const schema = z.toJSONSchema(tool.inputSchema, { io: "input" }) as {
        type?: string;
      };
      expect(schema.type, tool.name).toBe("object");
    }
  });

  it("resolves a tool by the name a model would ask for", () => {
    for (const tool of ALL_TOOLS) {
      expect(findTool(tool.name)).toBe(tool);
    }
    expect(findTool("no_such_tool")).toBeUndefined();
  });

  it("carries no tool from the deliberately excluded classes", () => {
    for (const tool of ALL_TOOLS) {
      for (const fragment of FORBIDDEN_NAME_FRAGMENTS) {
        expect(tool.name, `${tool.name} matches ${fragment}`).not.toContain(
          fragment,
        );
      }
    }
  });
});
