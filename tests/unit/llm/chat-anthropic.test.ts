import { afterEach, describe, expect, it, vi } from "vitest";
import { AnthropicCompatibleLlmProvider } from "@/lib/llm/anthropic";

// The Messages API has no `tool` role: a tool answer is a tool_result block
// inside a user turn, and a run of them has to arrive as ONE turn. That
// regrouping is the only place the two wire formats genuinely diverge, so it
// carries most of the assertions here.

vi.mock("@/lib/config/env", () => ({
  env: { LLM_REQUEST_TIMEOUT_MS: 20 },
}));

const API_KEY = "sk-ant-super-secret";

function provider(): AnthropicCompatibleLlmProvider {
  return new AnthropicCompatibleLlmProvider(
    "cred-1",
    "GLM",
    "https://api.z.ai/api/anthropic",
    "glm-4",
    API_KEY,
  );
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function bodyOf(fetchMock: ReturnType<typeof vi.fn>): Record<string, unknown> {
  return JSON.parse(fetchMock.mock.calls[0][1].body as string) as Record<
    string,
    unknown
  >;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("AnthropicCompatibleLlmProvider.chat()", () => {
  it("sends system at the top level and tools with input_schema", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      jsonResponse(200, {
        model: "glm-4-plus",
        content: [
          { type: "text", text: "looking" },
          {
            type: "tool_use",
            id: "toolu_1",
            name: "logs_search",
            input: { limit: 5 },
          },
        ],
        stop_reason: "tool_use",
        usage: { input_tokens: 30, output_tokens: 9 },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await provider().chat({
      system: "you are an agent",
      messages: [{ role: "user", content: "what broke" }],
      tools: [
        {
          name: "logs_search",
          description: "Search log entries",
          inputSchema: { type: "object" },
        },
      ],
      maxTokens: 700,
    });

    const body = bodyOf(fetchMock);
    expect(body.system).toBe("you are an agent");
    expect(body.max_tokens).toBe(700);
    expect(body.tools).toEqual([
      {
        name: "logs_search",
        description: "Search log entries",
        input_schema: { type: "object" },
      },
    ]);

    expect(result).toEqual({
      ok: true,
      data: {
        text: "looking",
        toolCalls: [
          { id: "toolu_1", name: "logs_search", arguments: '{"limit":5}' },
        ],
        stopReason: "tool_calls",
        model: "glm-4-plus",
        usage: { promptTokens: 30, completionTokens: 9, totalTokens: 39 },
      },
    });
  });

  it("batches consecutive tool answers into a single user turn", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      jsonResponse(200, {
        content: [{ type: "text", text: "done" }],
        stop_reason: "end_turn",
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await provider().chat({
      messages: [
        { role: "user", content: "check both" },
        {
          role: "assistant",
          content: "",
          toolCalls: [
            { id: "toolu_1", name: "logs_search", arguments: '{"limit":1}' },
            { id: "toolu_2", name: "alerts_search", arguments: "{}" },
          ],
        },
        {
          role: "tool",
          toolCallId: "toolu_1",
          toolName: "logs_search",
          content: "[]",
        },
        {
          role: "tool",
          toolCallId: "toolu_2",
          toolName: "alerts_search",
          content: "boom",
          isError: true,
        },
      ],
    });

    expect(bodyOf(fetchMock).messages).toEqual([
      { role: "user", content: "check both" },
      {
        role: "assistant",
        content: [
          {
            type: "tool_use",
            id: "toolu_1",
            name: "logs_search",
            input: { limit: 1 },
          },
          { type: "tool_use", id: "toolu_2", name: "alerts_search", input: {} },
        ],
      },
      {
        role: "user",
        content: [
          { type: "tool_result", tool_use_id: "toolu_1", content: "[]" },
          {
            type: "tool_result",
            tool_use_id: "toolu_2",
            content: "boom",
            is_error: true,
          },
        ],
      },
    ]);
  });

  it("never prefills the assistant turn in chat mode", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(200, { content: [{ type: "text", text: "ok" }] }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await provider().chat({ messages: [{ role: "user", content: "hi" }] });

    // Prefill and tool use cannot coexist: the model must be free to open its
    // turn with a tool_use block.
    expect(bodyOf(fetchMock).messages).toEqual([
      { role: "user", content: "hi" },
    ]);
  });

  it("maps stop reasons and reports an empty answer as text", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          jsonResponse(200, { content: [], stop_reason: "max_tokens" }),
        ),
    );

    const result = await provider().chat({
      messages: [{ role: "user", content: "essay" }],
    });

    expect(result.ok && result.data.text).toBe("");
    expect(result.ok && result.data.stopReason).toBe("max_tokens");
  });

  it("rejects a tool_use block without an id or a name", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(
        jsonResponse(200, {
          content: [{ type: "tool_use", name: "logs_search" }],
          stop_reason: "tool_use",
        }),
      ),
    );

    const result = await provider().chat({
      messages: [{ role: "user", content: "go" }],
    });

    expect(result).toEqual({
      ok: false,
      kind: "error",
      category: "invalid_response",
      message: "Model requested a tool without an id or a name",
    });
  });

  it("keeps the API key out of a typed 400 error message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(
        jsonResponse(400, {
          error: {
            type: "authentication_error",
            message: `bad key ${API_KEY}`,
          },
        }),
      ),
    );

    const result = await provider().chat({
      messages: [{ role: "user", content: "go" }],
    });

    expect(result.ok).toBe(false);
    if (result.ok || result.kind !== "error") return;
    expect(result.category).toBe("auth");
    expect(result.message).not.toContain(API_KEY);
  });
});
