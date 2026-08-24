import { describe, expect, it } from "vitest";
import { z } from "zod";
import { extractJsonObject, parseJsonAnswer } from "@/lib/llm/json";

// Models wrap objects in prose and in fenced blocks whatever the endpoint
// promised, so extraction runs before validation on every answer. The
// load-bearing assertion in this file is the last one: a failure message must
// never carry what the model wrote, because that text is a restatement of the
// operator's mail.

const schema = z.object({
  summary: z.string().min(1),
  bullets: z.array(z.string()).default([]),
});

describe("extractJsonObject()", () => {
  it("returns a bare object unchanged", () => {
    expect(extractJsonObject('{"a":1}')).toBe('{"a":1}');
  });

  it("unwraps a fenced block", () => {
    expect(extractJsonObject('```json\n{"a":1}\n```')).toBe('{"a":1}');
    expect(extractJsonObject('```\n{"a":1}\n```')).toBe('{"a":1}');
  });

  it("drops prose before and after the object", () => {
    expect(
      extractJsonObject('Sure! Here it is:\n{"a":1}\nHope that helps.'),
    ).toBe('{"a":1}');
  });

  it("swallows a stray leading brace from an ignored assistant prefill", () => {
    expect(extractJsonObject('{{"a":1}')).toBe('{"a":1}');
  });

  it("returns null when nothing is object-shaped", () => {
    expect(extractJsonObject("no braces here")).toBeNull();
    expect(extractJsonObject("}{")).toBeNull();
    expect(extractJsonObject("")).toBeNull();
  });
});

describe("parseJsonAnswer()", () => {
  it("returns the validated value", () => {
    const result = parseJsonAnswer(
      '```json\n{"summary":"short","bullets":["one"]}\n```',
      schema,
    );

    expect(result).toEqual({
      ok: true,
      data: { summary: "short", bullets: ["one"] },
    });
  });

  it("applies schema defaults", () => {
    const result = parseJsonAnswer('{"summary":"short"}', schema);

    expect(result).toMatchObject({ ok: true, data: { bullets: [] } });
  });

  it("reports invalid_response when there is no object", () => {
    expect(parseJsonAnswer("I cannot do that", schema)).toEqual({
      ok: false,
      kind: "error",
      category: "invalid_response",
      message: "Model returned no JSON object",
    });
  });

  it("reports invalid_response on malformed JSON", () => {
    expect(parseJsonAnswer('{"summary": }', schema)).toMatchObject({
      ok: false,
      category: "invalid_response",
      message: "Model returned malformed JSON",
    });
  });

  it("names the failing schema paths on a shape mismatch", () => {
    const result = parseJsonAnswer('{"bullets":"not an array"}', schema);

    expect(result).toMatchObject({ ok: false, category: "invalid_response" });
    expect((result as { message: string }).message).toContain("summary");
    expect((result as { message: string }).message).toContain("bullets");
  });

  it("never puts the model output into the failure message", () => {
    const leak = "Invoice 88213 for acme-corp, due 2026-09-01";

    for (const text of [
      leak,
      `{"summary": ${leak}}`,
      `{"bullets": "${leak}"}`,
    ]) {
      const result = parseJsonAnswer(text, schema);
      expect(result.ok).toBe(false);
      expect((result as { message: string }).message).not.toContain(leak);
      expect((result as { message: string }).message).not.toContain(
        "acme-corp",
      );
      expect((result as { message: string }).message).not.toContain("88213");
    }
  });
});
