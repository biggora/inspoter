import { describe, expect, it } from "vitest";
import {
  ANSWER_SLACK,
  agentDraftAnswerSchema,
  agentDraftRequestSchema,
} from "@/lib/validation/agents-ai";
import {
  AGENT_DESCRIPTION_MAX,
  AGENT_INSTRUCTIONS_MAX,
  AGENT_NAME_MAX,
} from "@/lib/validation/agents";
import { VALIDATION_MESSAGES } from "@/lib/validation/error-map";

// Both directions of the authoring assistant: the dialog's request and the
// model's answer. Mirrors tests/unit/validation/mail-ai.test.ts.

function valid() {
  return {
    kind: "AGENT" as const,
    field: "instructions" as const,
    language: "en" as const,
    name: "Night watch",
  };
}

describe("agentDraftRequestSchema", () => {
  it("accepts a request with only a name for a brief", () => {
    const parsed = agentDraftRequestSchema.parse(valid());

    expect(parsed.description).toBe("");
    expect(parsed.instructions).toBe("");
  });

  it("trims the brief fields", () => {
    const parsed = agentDraftRequestSchema.parse({
      ...valid(),
      description: "  spaced  ",
    });

    expect(parsed.description).toBe("spaced");
  });

  it("requires a name", () => {
    const result = agentDraftRequestSchema.safeParse({
      ...valid(),
      name: "   ",
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe(
      VALIDATION_MESSAGES.agent.nameRequired,
    );
  });

  it("caps the name at the agent limit", () => {
    const result = agentDraftRequestSchema.safeParse({
      ...valid(),
      name: "n".repeat(AGENT_NAME_MAX + 1),
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe(
      VALIDATION_MESSAGES.agent.nameTooLong,
    );
  });

  it.each([
    ["description", AGENT_DESCRIPTION_MAX],
    ["instructions", AGENT_INSTRUCTIONS_MAX],
  ] as const)("caps the %s brief at its prompt budget", (field, max) => {
    expect(
      agentDraftRequestSchema.safeParse({
        ...valid(),
        [field]: "x".repeat(max),
      }).success,
    ).toBe(true);
    expect(
      agentDraftRequestSchema.safeParse({
        ...valid(),
        [field]: "x".repeat(max + 1),
      }).success,
    ).toBe(false);
  });

  it.each([
    ["kind", "TEAM"],
    ["field", "scopes"],
    ["language", "de"],
  ])("rejects an unknown %s", (key, value) => {
    expect(
      agentDraftRequestSchema.safeParse({ ...valid(), [key]: value }).success,
    ).toBe(false);
  });

  // .strict(): an unexpected field from our own dialog is a bug worth
  // surfacing, not something to strip in silence.
  it("rejects a key the dialog is not supposed to send", () => {
    expect(
      agentDraftRequestSchema.safeParse({ ...valid(), scopes: ["logs:read"] })
        .success,
    ).toBe(false);
  });
});

describe("agentDraftAnswerSchema()", () => {
  const schema = agentDraftAnswerSchema(AGENT_DESCRIPTION_MAX);
  const slack = Math.ceil(AGENT_DESCRIPTION_MAX * ANSWER_SLACK);

  it("keeps an answer of the right shape", () => {
    expect(schema.parse({ text: "  Watches the overnight logs.  " })).toEqual({
      text: "Watches the overnight logs.",
    });
  });

  // .strip(): an extra field from a model is noise, and throwing away a
  // paid-for answer over it would be worse than ignoring it.
  it("strips a field the model invented", () => {
    expect(schema.parse({ text: "Fine.", confidence: 0.9 })).toEqual({
      text: "Fine.",
    });
  });

  it("rejects an empty answer", () => {
    expect(schema.safeParse({ text: "   " }).success).toBe(false);
  });

  // A model that overshoots by a sentence is trimmed by the service; one that
  // overshoots by half again ignored the budget and loses its answer.
  it("allows an overshoot inside the slack and rejects one beyond it", () => {
    expect(schema.safeParse({ text: "x".repeat(slack) }).success).toBe(true);
    expect(schema.safeParse({ text: "x".repeat(slack + 1) }).success).toBe(
      false,
    );
  });
});
