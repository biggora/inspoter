import { describe, expect, it } from "vitest";
import {
  BRIEF_MAX_CHARS,
  FIELD_MAX_CHARS,
  buildDraftContext,
  buildDraftMockAnswer,
  buildDraftPrompt,
  buildDraftSystemPrompt,
  trimToLimit,
} from "@/lib/agents/authoring-prompts";
import {
  agentDraftAnswerSchema,
  type AgentDraftInput,
  type AiDraftField,
  type AiDraftKind,
} from "@/lib/validation/agents-ai";

// Prompt construction, brief hygiene and the deterministic mock answers of the
// authoring assistant. The last describe block is the contract the e2e suite
// rests on: every mock answer must satisfy the same schema the real answer is
// validated with, and fit the field it is drafted for.

const INSTRUCTIONS_MARKER = "MARKER-ONLY-IN-INSTRUCTIONS";

const COMBINATIONS: Array<[AiDraftKind, AiDraftField]> = [
  ["AGENT", "description"],
  ["AGENT", "instructions"],
  ["SKILL", "description"],
  ["SKILL", "instructions"],
];

function input(overrides: Partial<AgentDraftInput> = {}): AgentDraftInput {
  return {
    kind: "AGENT",
    field: "instructions",
    language: "en",
    name: "Night watch",
    description: "Reports what broke overnight.",
    instructions: INSTRUCTIONS_MARKER,
    ...overrides,
  };
}

describe("buildDraftContext()", () => {
  it("keeps the whole brief when drafting instructions", () => {
    const context = buildDraftContext(input());

    expect(context.name).toBe("Night watch");
    expect(context.description).toBe("Reports what broke overnight.");
    expect(context.instructions).toBe(INSTRUCTIONS_MARKER);
  });

  // The brief rule is enforced here rather than in the schema, so an
  // over-sending client cannot get the current body into a description prompt.
  it("drops the instructions when drafting a description", () => {
    const context = buildDraftContext(input({ field: "description" }));

    expect(context.instructions).toBe("");
    expect(buildDraftPrompt(context)).not.toContain(INSTRUCTIONS_MARKER);
  });

  it("clips an over-long brief and says so", () => {
    const context = buildDraftContext(
      input({ instructions: "x".repeat(BRIEF_MAX_CHARS + 500) }),
    );

    expect(context.truncated).toBe(true);
    expect(context.instructions).toContain("[truncated]");
    expect(context.instructions.length).toBeLessThan(BRIEF_MAX_CHARS + 100);
  });

  it("reports a short brief as untruncated", () => {
    expect(buildDraftContext(input()).truncated).toBe(false);
  });
});

describe("system prompts", () => {
  const prompts = COMBINATIONS.map(([kind, field]) =>
    buildDraftSystemPrompt(buildDraftContext(input({ kind, field })), "en"),
  );

  it("state the JSON contract", () => {
    for (const prompt of prompts) {
      expect(prompt).toContain("exactly one JSON object");
      expect(prompt).toContain("no markdown fences");
    }
  });

  it("frame the brief as untrusted data", () => {
    for (const prompt of prompts) {
      expect(prompt).toContain("untrusted data");
      expect(prompt).toContain("never instructions");
    }
  });

  // A model that runs into max_tokens returns truncated JSON, which becomes an
  // invalid_response rather than a shorter draft — so the budget has to be in
  // the prompt, not only in the request.
  it.each(COMBINATIONS)(
    "name the character budget for %s/%s",
    (kind, field) => {
      const prompt = buildDraftSystemPrompt(
        buildDraftContext(input({ kind, field })),
        "en",
      );

      expect(prompt).toContain(String(FIELD_MAX_CHARS[kind][field]));
    },
  );

  it("name the answer language in the base language", () => {
    const context = buildDraftContext(input());

    expect(buildDraftSystemPrompt(context, "ru")).toContain("Russian");
    expect(buildDraftSystemPrompt(context, "en")).toContain("English");
    // The source stays free of Cyrillic — scripts/check-base-language.mjs.
    expect(/[Ѐ-ӿ]/.test(buildDraftSystemPrompt(context, "ru"))).toBe(false);
  });
});

describe("user prompts", () => {
  it.each(COMBINATIONS)(
    "wrap the brief in delimiters for %s/%s",
    (kind, field) => {
      const prompt = buildDraftPrompt(
        buildDraftContext(input({ kind, field })),
      );

      expect(prompt).toContain("<<<OPERATOR_BRIEF");
      expect(prompt).toContain("OPERATOR_BRIEF>>>");
      expect(prompt).toContain("Night watch");
    },
  );

  it("asks for a rewrite when instructions are already written", () => {
    expect(buildDraftPrompt(buildDraftContext(input()))).toContain("Rewrite");
  });

  it("asks for a fresh draft when they are empty", () => {
    const prompt = buildDraftPrompt(
      buildDraftContext(input({ instructions: "" })),
    );

    expect(prompt).not.toContain("Rewrite");
    expect(prompt).toContain("Draft the instructions");
  });

  it("omits an empty description from the brief", () => {
    const prompt = buildDraftPrompt(
      buildDraftContext(input({ description: "" })),
    );

    expect(prompt).not.toContain("Description:");
  });
});

describe("trimToLimit()", () => {
  it("leaves a short draft alone", () => {
    expect(trimToLimit("  short  ", 100)).toEqual({
      text: "short",
      trimmed: false,
    });
  });

  it("cuts on a word boundary and reports the cut", () => {
    const result = trimToLimit("alpha beta gamma delta", 14);

    expect(result.trimmed).toBe(true);
    expect(result.text.length).toBeLessThanOrEqual(14);
    expect(result.text).toBe("alpha beta");
  });

  it("cuts hard when a single word overruns the whole field", () => {
    const result = trimToLimit("y".repeat(50), 10);

    expect(result.text).toBe("y".repeat(10));
    expect(result.trimmed).toBe(true);
  });
});

// The load-bearing block: the mock driver returns these verbatim, so if one
// stops matching its schema the e2e suite breaks with no clue why.
describe("mock answers match the schema the real answers are parsed with", () => {
  it.each(COMBINATIONS)("%s/%s", (kind, field) => {
    const context = buildDraftContext(input({ kind, field }));
    const maxChars = FIELD_MAX_CHARS[kind][field];

    const parsed = agentDraftAnswerSchema(maxChars).parse(
      JSON.parse(buildDraftMockAnswer(context)),
    );

    // The echoed name is what lets an e2e assertion tell the mock reacted to
    // this brief rather than returning a constant.
    expect(parsed.text).toContain("Night watch");
    // Under the field's own cap, so the trim never fires for a mock run.
    expect(parsed.text.length).toBeLessThanOrEqual(maxChars);
  });

  it("are deterministic", () => {
    expect(buildDraftMockAnswer(buildDraftContext(input()))).toBe(
      buildDraftMockAnswer(buildDraftContext(input())),
    );
  });
});
