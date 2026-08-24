import { describe, expect, it } from "vitest";
import {
  mailFilterProposalAnswerSchema,
  mailReplyDraftAnswerSchema,
  mailSummaryAnswerSchema,
  sanitizeProposedConditions,
  summarizeMailSchema,
} from "@/lib/validation/mail-ai";

// The model's answer is untrusted input, so it goes through zod like any other
// input. The conditions it proposes go through the exact schema that validates
// an operator's hand-typed ones — the point of the feature is that the
// deterministic engine never sees anything the operator could not have typed.

function condition(overrides: Record<string, unknown> = {}) {
  return {
    field: "FROM_DOMAIN",
    operator: "EQUALS",
    value: "example.com",
    isNegated: false,
    ...overrides,
  };
}

describe("request schemas", () => {
  it("accepts a supported language and rejects anything else", () => {
    expect(summarizeMailSchema.safeParse({ language: "ru" }).success).toBe(
      true,
    );
    expect(summarizeMailSchema.safeParse({ language: "de" }).success).toBe(
      false,
    );
  });

  it("rejects unexpected fields from the operator", () => {
    expect(
      summarizeMailSchema.safeParse({ language: "en", tone: "casual" }).success,
    ).toBe(false);
  });
});

describe("answer schemas", () => {
  it("defaults the optional summary lists", () => {
    const parsed = mailSummaryAnswerSchema.parse({ summary: "short" });

    expect(parsed).toEqual({ summary: "short", bullets: [], actionItems: [] });
  });

  it("ignores extra fields a model volunteers instead of failing", () => {
    const parsed = mailSummaryAnswerSchema.parse({
      summary: "short",
      confidence: 0.9,
    });

    expect(parsed).not.toHaveProperty("confidence");
  });

  it("rejects an empty reply body", () => {
    expect(
      mailReplyDraftAnswerSchema.safeParse({ bodyText: "  " }).success,
    ).toBe(false);
  });

  it("defaults the proposal match mode to ALL", () => {
    const parsed = mailFilterProposalAnswerSchema.parse({
      name: "Invoices",
      conditions: [condition()],
    });

    expect(parsed.matchMode).toBe("ALL");
  });

  it("rejects a proposal with no conditions at all", () => {
    expect(
      mailFilterProposalAnswerSchema.safeParse({ name: "x", conditions: [] })
        .success,
    ).toBe(false);
  });
});

describe("sanitizeProposedConditions()", () => {
  it("keeps a valid condition and normalizes its value", () => {
    const result = sanitizeProposedConditions([
      condition({ value: "  Example.com  " }),
    ]);

    expect(result).toEqual({
      conditions: [
        {
          field: "FROM_DOMAIN",
          operator: "EQUALS",
          value: "Example.com",
          isNegated: false,
        },
      ],
      dropped: 0,
    });
  });

  it("drops a field/operator pair the deterministic engine does not allow", () => {
    const result = sanitizeProposedConditions([
      condition({ operator: "CONTAINS" }),
      condition({ field: "BODY", operator: "EQUALS" }),
      condition(),
    ]);

    expect(result.conditions).toHaveLength(1);
    expect(result.dropped).toBe(2);
  });

  it("drops a HAS_ATTACHMENT condition whose value is not true/false", () => {
    const result = sanitizeProposedConditions([
      condition({ field: "HAS_ATTACHMENT", operator: "IS", value: "maybe" }),
      condition({ field: "HAS_ATTACHMENT", operator: "IS", value: "true" }),
    ]);

    expect(result.conditions).toHaveLength(1);
    expect(result.dropped).toBe(1);
  });

  it("drops an over-long value rather than truncating it", () => {
    const result = sanitizeProposedConditions([
      condition({ value: "a".repeat(501) }),
    ]);

    expect(result).toEqual({ conditions: [], dropped: 1 });
  });

  it("drops entries that are not conditions at all", () => {
    const result = sanitizeProposedConditions([
      "not an object",
      null,
      { field: "NOPE", operator: "EQUALS", value: "x", isNegated: false },
      condition({ isNegated: "yes" }),
    ]);

    expect(result).toEqual({ conditions: [], dropped: 4 });
  });

  it("deduplicates conditions that differ only in case", () => {
    const result = sanitizeProposedConditions([
      condition({ value: "example.com" }),
      condition({ value: "EXAMPLE.COM" }),
    ]);

    expect(result.conditions).toHaveLength(1);
    expect(result.dropped).toBe(1);
  });

  it("caps at the engine limit and counts the overflow", () => {
    const raw = Array.from({ length: 13 }, (_, index) =>
      condition({ value: `sender-${index}.example.com` }),
    );

    const result = sanitizeProposedConditions(raw);

    expect(result.conditions).toHaveLength(10);
    expect(result.dropped).toBe(3);
  });
});
