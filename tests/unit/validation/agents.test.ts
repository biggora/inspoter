import { describe, expect, it } from "vitest";
import {
  agentCreateSchema,
  agentSkillsSetSchema,
  agentUpdateSchema,
  skillCreateSchema,
  AGENT_INSTRUCTIONS_MAX,
  AGENT_MAX_SKILLS,
  SKILL_INSTRUCTIONS_MAX,
} from "@/lib/validation/agents";
import { MCP_SCOPES } from "@/lib/mcp/scopes";

// The agent form is the only place an operator hands out permissions, so the
// scope list is validated against MCP_SCOPES rather than accepted as free
// text: an unknown scope is rejected, not silently dropped, because storing
// fewer permissions than the operator ticked is the worse surprise.

describe("agentCreateSchema", () => {
  it("accepts a minimal agent", () => {
    const parsed = agentCreateSchema.safeParse({
      name: "Night watch",
      instructions: "Summarize what broke overnight.",
    });
    expect(parsed.success).toBe(true);
  });

  it("accepts every known scope", () => {
    const parsed = agentCreateSchema.safeParse({
      name: "Everything",
      instructions: "Look at all of it.",
      scopes: [...MCP_SCOPES],
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects an unknown scope", () => {
    const parsed = agentCreateSchema.safeParse({
      name: "Sneaky",
      instructions: "Do things.",
      scopes: ["backup:write"],
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects a repeated scope", () => {
    const parsed = agentCreateSchema.safeParse({
      name: "Doubled",
      instructions: "Do things.",
      scopes: ["logs:read", "logs:read"],
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects unknown keys", () => {
    const parsed = agentCreateSchema.safeParse({
      name: "Extra",
      instructions: "Do things.",
      workspaceId: "somebody-elses-workspace",
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects instructions past the cap", () => {
    const parsed = agentCreateSchema.safeParse({
      name: "Verbose",
      instructions: "x".repeat(AGENT_INSTRUCTIONS_MAX + 1),
    });
    expect(parsed.success).toBe(false);
  });

  it.each([
    ["maxSteps", 0],
    ["maxSteps", 25],
    ["maxTokens", 999],
    ["maxTokens", 200_001],
    ["timeoutSeconds", 29],
    ["timeoutSeconds", 1_801],
  ])("rejects %s = %i", (field, value) => {
    const parsed = agentCreateSchema.safeParse({
      name: "Out of range",
      instructions: "Do things.",
      [field]: value,
    });
    expect(parsed.success).toBe(false);
  });
});

describe("agentUpdateSchema", () => {
  it("rejects an empty patch", () => {
    expect(agentUpdateSchema.safeParse({}).success).toBe(false);
  });

  it("accepts a scopes-only patch", () => {
    const parsed = agentUpdateSchema.safeParse({ scopes: ["kanban:read"] });
    expect(parsed.success).toBe(true);
  });

  it("accepts clearing every scope", () => {
    const parsed = agentUpdateSchema.safeParse({ scopes: [] });
    expect(parsed.success).toBe(true);
  });
});

describe("skillCreateSchema", () => {
  it("accepts a skill without a tool narrowing", () => {
    const parsed = skillCreateSchema.safeParse({
      name: "Incident triage",
      description: "How to read an alert storm.",
      instructions: "Group by service first.",
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects a tool name that is not snake_case", () => {
    const parsed = skillCreateSchema.safeParse({
      name: "Bad tools",
      description: "…",
      instructions: "…",
      toolNames: ["Logs Search"],
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects instructions past the cap", () => {
    const parsed = skillCreateSchema.safeParse({
      name: "Verbose",
      description: "…",
      instructions: "x".repeat(SKILL_INSTRUCTIONS_MAX + 1),
    });
    expect(parsed.success).toBe(false);
  });
});

describe("agentSkillsSetSchema", () => {
  it("accepts an empty list, which detaches everything", () => {
    expect(agentSkillsSetSchema.safeParse({ skillIds: [] }).success).toBe(true);
  });

  it("rejects the same skill twice", () => {
    const parsed = agentSkillsSetSchema.safeParse({
      skillIds: ["skill-1", "skill-1"],
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects more skills than an agent may carry", () => {
    const parsed = agentSkillsSetSchema.safeParse({
      skillIds: Array.from(
        { length: AGENT_MAX_SKILLS + 1 },
        (_, index) => `skill-${index}`,
      ),
    });
    expect(parsed.success).toBe(false);
  });
});
