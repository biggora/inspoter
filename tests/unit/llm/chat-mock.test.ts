import { describe, expect, it } from "vitest";
import type { LlmChatRequest, LlmMockTurn } from "@/lib/llm/contract";
import { MockLlmProvider } from "@/lib/llm/mock";

// A multi-step agent run is many chat() calls, and the Playwright suite needs
// every one of them reproducible. The turn is picked by counting the assistant
// turns already in the transcript, so it is a pure function of the input —
// no instance state, identical across processes and reruns.

const SCRIPT: LlmMockTurn[] = [
  { toolCalls: [{ name: "logs_search", arguments: { limit: 5 } }] },
  { text: "Nothing broke overnight." },
];

function provider(): MockLlmProvider {
  return new MockLlmProvider("cred-mock", "Mock", "mock-model");
}

function afterTurns(count: number): LlmChatRequest {
  const messages: LlmChatRequest["messages"] = [
    { role: "user", content: "report" },
  ];
  for (let i = 0; i < count; i++) {
    messages.push({ role: "assistant", content: `turn ${i}` });
  }
  return { messages, mockTurns: SCRIPT };
}

describe("MockLlmProvider.chat()", () => {
  it("plays the scripted turns in order", async () => {
    const first = await provider().chat(afterTurns(0));
    expect(first.ok && first.data.toolCalls).toEqual([
      {
        id: "mock_call_0_0",
        name: "logs_search",
        arguments: '{"limit":5}',
      },
    ]);
    expect(first.ok && first.data.stopReason).toBe("tool_calls");

    const second = await provider().chat(afterTurns(1));
    expect(second.ok && second.data.text).toBe("Nothing broke overnight.");
    expect(second.ok && second.data.toolCalls).toEqual([]);
    expect(second.ok && second.data.stopReason).toBe("stop");
  });

  it("terminates past the end of the script instead of looping", async () => {
    const beyond = await provider().chat(afterTurns(7));
    expect(beyond.ok && beyond.data.toolCalls).toEqual([]);
    expect(beyond.ok && beyond.data.stopReason).toBe("stop");
    expect(beyond.ok && beyond.data.text).toBe("Nothing broke overnight.");
  });

  it("answers identically for the same transcript, across instances", async () => {
    const a = await provider().chat(afterTurns(0));
    const b = await new MockLlmProvider("other", "Other", "mock-model").chat(
      afterTurns(0),
    );
    expect(a).toEqual(b);
  });

  it("falls back to a fingerprinted answer with no script", async () => {
    const result = await provider().chat({
      messages: [{ role: "user", content: "an unscripted question" }],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.text).toContain("[mock:mock-model:");
    expect(result.data.toolCalls).toEqual([]);
    expect(result.data.stopReason).toBe("stop");
    expect(result.data.usage.totalTokens).toBeGreaterThan(0);
  });

  it("reaches no network", async () => {
    // No fetch stub is installed anywhere in this file; a driver that called
    // out would fail against the test environment rather than pass silently.
    await expect(provider().chat(afterTurns(0))).resolves.toMatchObject({
      ok: true,
    });
  });
});
