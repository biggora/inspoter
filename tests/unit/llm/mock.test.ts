import { describe, expect, it } from "vitest";
import { MockLlmProvider } from "@/lib/llm/mock";

// The mock driver is what keeps the Playwright suite reproducible, so the
// property under test is determinism itself, not the shape of the text.

const provider = new MockLlmProvider("cred-1", "Local model", "test-model");

describe("MockLlmProvider.complete", () => {
  it("returns the same answer for the same request", async () => {
    const first = await provider.complete({ prompt: "summarize this mail" });
    const second = await provider.complete({ prompt: "summarize this mail" });

    expect(first.ok).toBe(true);
    expect(second).toEqual(first);
  });

  it("returns a different answer for a different prompt", async () => {
    const first = await provider.complete({ prompt: "prompt a" });
    const second = await provider.complete({ prompt: "prompt b" });

    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(second.data.text).not.toBe(first.data.text);
  });

  it("distinguishes the system prompt from the user prompt", async () => {
    const withSystem = await provider.complete({
      prompt: "same prompt",
      system: "you are terse",
    });
    const withoutSystem = await provider.complete({ prompt: "same prompt" });

    expect(withSystem.ok && withoutSystem.ok).toBe(true);
    if (!withSystem.ok || !withoutSystem.ok) return;
    expect(withSystem.data.text).not.toBe(withoutSystem.data.text);
  });

  it("reports the configured model and a non-zero token count", async () => {
    const result = await provider.complete({ prompt: "two words" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.model).toBe("test-model");
    expect(result.data.usage.promptTokens).toBeGreaterThan(0);
    expect(result.data.usage.totalTokens).toBe(
      result.data.usage.promptTokens + result.data.usage.completionTokens,
    );
  });
});

describe("MockLlmProvider.embed", () => {
  it("returns one stable vector per input", async () => {
    const first = await provider.embed({ input: ["alpha", "beta"] });
    const second = await provider.embed({ input: ["alpha", "beta"] });

    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.data.vectors).toHaveLength(2);
    expect(first.data.vectors[0]).not.toEqual(first.data.vectors[1]);
    expect(second).toEqual(first);
  });

  it("keeps every component inside [-1, 1)", async () => {
    const result = await provider.embed({ input: ["alpha"] });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    for (const component of result.data.vectors[0]) {
      expect(component).toBeGreaterThanOrEqual(-1);
      expect(component).toBeLessThan(1);
    }
  });
});
