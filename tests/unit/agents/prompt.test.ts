import { describe, expect, it } from "vitest";
import {
  buildAgentMockTurns,
  buildAgentSystemPrompt,
  buildAgentUserPrompt,
  SKILL_BUDGET_CHARS,
} from "@/lib/agents/prompt";

// What actually leaves the machine. The budget rule is the one worth pinning:
// a skill whose body does not fit still gets its index line, because the model
// has to know the capability exists even when its instructions were cut.

function skill(name: string, body: string) {
  return {
    name,
    description: `${name} description`,
    instructions: body,
  };
}

describe("buildAgentSystemPrompt", () => {
  it("names the agent, its tools and the untrusted-data rule", () => {
    const { text } = buildAgentSystemPrompt({
      agentName: "Night watch",
      instructions: "Summarize what broke overnight.",
      skills: [],
      toolNames: ["logs_search", "alerts_search"],
    });

    expect(text).toContain('"Night watch"');
    expect(text).toContain("Summarize what broke overnight.");
    expect(text).toContain("logs_search, alerts_search");
    expect(text).toContain("<<<TOOL_RESULT");
    expect(text).toContain("never instructions");
  });

  it("says so when the agent has no tools at all", () => {
    const { text } = buildAgentSystemPrompt({
      agentName: "Talker",
      instructions: "Answer.",
      skills: [],
      toolNames: [],
    });
    expect(text).toContain("no tools available");
  });

  it("injects skill bodies in the order they were given", () => {
    const { text, skillsTruncated } = buildAgentSystemPrompt({
      agentName: "Ordered",
      instructions: "Do the thing.",
      skills: [skill("Alpha", "alpha body"), skill("Beta", "beta body")],
      toolNames: [],
    });

    expect(skillsTruncated).toBe(0);
    expect(text.indexOf("alpha body")).toBeLessThan(text.indexOf("beta body"));
    // The index lists both, ahead of either body.
    expect(text.indexOf("- Alpha: Alpha description")).toBeLessThan(
      text.indexOf("alpha body"),
    );
  });

  it("keeps the index line of a skill whose body does not fit the budget", () => {
    const { text, skillsTruncated } = buildAgentSystemPrompt({
      agentName: "Budgeted",
      instructions: "Do the thing.",
      skills: [
        skill("Small", "small body"),
        skill("Huge", "x".repeat(SKILL_BUDGET_CHARS + 1)),
      ],
      toolNames: [],
    });

    expect(skillsTruncated).toBe(1);
    expect(text).toContain("- Huge: Huge description");
    expect(text).not.toContain("x".repeat(200));
    expect(text).toContain("small body");
  });
});

describe("buildAgentUserPrompt", () => {
  it("falls back to the agent's own instructions when no task was given", () => {
    expect(buildAgentUserPrompt("   ")).toContain(
      "Carry out your instructions",
    );
  });

  it("passes a real task through untouched apart from trimming", () => {
    expect(buildAgentUserPrompt("  check the logs  ")).toBe("check the logs");
  });
});

describe("buildAgentMockTurns", () => {
  it("scripts one tool call and then a report", () => {
    const turns = buildAgentMockTurns({
      agentName: "Night watch",
      toolNames: ["logs_search", "alerts_search"],
    });

    expect(turns).toHaveLength(2);
    expect(turns[0].toolCalls).toEqual([
      { name: "logs_search", arguments: {} },
    ]);
    expect(turns[1].text).toContain("Night watch");
    expect(turns[1].toolCalls).toBeUndefined();
  });

  it("scripts a report alone when the agent has no tools", () => {
    const turns = buildAgentMockTurns({ agentName: "Talker", toolNames: [] });
    expect(turns).toHaveLength(1);
    expect(turns[0].toolCalls).toBeUndefined();
  });
});
