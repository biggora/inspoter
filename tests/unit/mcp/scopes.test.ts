import { describe, expect, it, vi } from "vitest";

// Tool modules reach the service layer, which constructs the Prisma client and
// reads env at import time. Neither is exercised here — only which tools get
// registered for a given scope set.
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/config/env", () => ({
  env: { LIST_PAGE_SIZE: 50, MAIL_SEND_RATE_LIMIT: 10 },
}));

import {
  hasScope,
  isMcpScope,
  MCP_SCOPES,
  parseScopes,
} from "@/lib/mcp/scopes";
import { ALL_TOOLS, selectTools } from "@/lib/mcp/server";

describe("MCP scopes", () => {
  it("recognizes every declared scope and nothing else", () => {
    for (const scope of MCP_SCOPES) {
      expect(isMcpScope(scope)).toBe(true);
    }
    expect(isMcpScope("mail:delete")).toBe(false);
    expect(isMcpScope("")).toBe(false);
  });

  it("drops unknown persisted values instead of trusting them", () => {
    expect(parseScopes(["mail:read", "mail:admin", "logs:read"])).toEqual([
      "mail:read",
      "logs:read",
    ]);
    expect(parseScopes([])).toEqual([]);
  });

  it("checks a single required scope", () => {
    expect(hasScope(["mail:read"], "mail:read")).toBe(true);
    expect(hasScope(["mail:read"], "mail:write")).toBe(false);
    expect(hasScope([], "logs:read")).toBe(false);
  });
});

describe("tool selection", () => {
  it("exposes no tool at all to a token without scopes", () => {
    expect(selectTools([])).toEqual([]);
  });

  it("exposes every tool to a token holding every scope", () => {
    expect(selectTools(MCP_SCOPES).length).toBe(ALL_TOOLS.length);
  });

  it("hides mail writes from a read-only mail token", () => {
    const names = selectTools(["mail:read"]).map((tool) => tool.name);

    expect(names).toContain("mail_search");
    expect(names).toContain("mail_get");
    expect(names).not.toContain("mail_send");
    expect(names).not.toContain("mail_draft_save");
  });

  it("keeps domains independent", () => {
    const names = selectTools(["logs:read"]).map((tool) => tool.name);

    expect(names).toEqual(["logs_search"]);
  });

  it("declares a known scope for every tool and no duplicate names", () => {
    const names = ALL_TOOLS.map((tool) => tool.name);

    expect(new Set(names).size).toBe(names.length);
    for (const tool of ALL_TOOLS) {
      expect(isMcpScope(tool.scope)).toBe(true);
    }
  });
});
