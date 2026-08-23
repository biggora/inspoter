import { describe, expect, it } from "vitest";
import { MCP_SCOPES } from "@/lib/mcp/scopes";
import { ALL_TOOLS, buildMcpServer, selectTools } from "@/lib/mcp/server";

// Registering a tool is where its zod schema is converted into the JSON Schema
// `tools/list` publishes, so a schema the SDK cannot express throws here rather
// than at the first call. Building the server with every scope is therefore a
// real assertion even though it looks like a smoke test: it is the only place
// outside the integration suite where all of the catalogue is converted.

const context = {
  workspaceId: "workspace-under-test",
  scopes: MCP_SCOPES,
  tokenId: "token-under-test",
  tokenName: "test token",
};

describe("MCP server construction", () => {
  it("converts the schema of every tool a full-scope token may see", () => {
    expect(selectTools(MCP_SCOPES)).toHaveLength(ALL_TOOLS.length);
    expect(() => buildMcpServer(context)).not.toThrow();
  });

  it("builds an empty server for a token carrying no scope", () => {
    expect(selectTools([])).toEqual([]);
    expect(() => buildMcpServer({ ...context, scopes: [] })).not.toThrow();
  });

  it("names every tool in the snake_case a client can call", () => {
    for (const tool of ALL_TOOLS) {
      expect(tool.name).toMatch(/^[a-z][a-z0-9_]*$/);
    }
  });
});
