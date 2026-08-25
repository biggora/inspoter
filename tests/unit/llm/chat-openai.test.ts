import { afterEach, describe, expect, it, vi } from "vitest";
import { OpenAiCompatibleLlmProvider } from "@/lib/llm/openai";

// chat() is the tool-calling half of the contract: a transcript in, prose or a
// list of tool calls out. These assertions pin the wire mapping — the shape an
// OpenAI-compatible endpoint actually receives — and the stop-reason rules the
// agent loop branches on.

vi.mock("@/lib/config/env", () => ({
  env: { LLM_REQUEST_TIMEOUT_MS: 20 },
}));

const API_KEY = "sk-super-secret-key";

function provider(): OpenAiCompatibleLlmProvider {
  return new OpenAiCompatibleLlmProvider(
    "cred-1",
    "Local model",
    "https://models.example.com/v1",
    "test-model",
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

describe("OpenAiCompatibleLlmProvider.chat()", () => {
  it("sends the transcript and the tool catalogue, and reads back tool calls", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      jsonResponse(200, {
        model: "test-model-0125",
        choices: [
          {
            message: {
              content: null,
              tool_calls: [
                {
                  id: "call_abc",
                  type: "function",
                  function: {
                    name: "logs_search",
                    arguments: '{"limit":5}',
                  },
                },
              ],
            },
            finish_reason: "tool_calls",
          },
        ],
        usage: { prompt_tokens: 40, completion_tokens: 8 },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await provider().chat({
      system: "you are an agent",
      messages: [{ role: "user", content: "what broke last night" }],
      tools: [
        {
          name: "logs_search",
          description: "Search log entries",
          inputSchema: { type: "object", properties: { limit: {} } },
        },
      ],
      maxTokens: 700,
    });

    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://models.example.com/v1/chat/completions",
    );
    const body = bodyOf(fetchMock);
    expect(body.messages).toEqual([
      { role: "system", content: "you are an agent" },
      { role: "user", content: "what broke last night" },
    ]);
    expect(body.tools).toEqual([
      {
        type: "function",
        function: {
          name: "logs_search",
          description: "Search log entries",
          parameters: { type: "object", properties: { limit: {} } },
        },
      },
    ]);
    expect(body.tool_choice).toBe("auto");
    expect(body.max_tokens).toBe(700);

    expect(result).toEqual({
      ok: true,
      data: {
        text: "",
        toolCalls: [
          { id: "call_abc", name: "logs_search", arguments: '{"limit":5}' },
        ],
        stopReason: "tool_calls",
        model: "test-model-0125",
        usage: { promptTokens: 40, completionTokens: 8, totalTokens: 48 },
      },
    });
  });

  it("maps an assistant tool turn and its tool answer back onto the wire", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      jsonResponse(200, {
        choices: [{ message: { content: "all clear" }, finish_reason: "stop" }],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await provider().chat({
      messages: [
        { role: "user", content: "check" },
        {
          role: "assistant",
          content: "",
          toolCalls: [{ id: "call_abc", name: "logs_search", arguments: "{}" }],
        },
        {
          role: "tool",
          toolCallId: "call_abc",
          toolName: "logs_search",
          content: "[]",
        },
      ],
    });

    expect(bodyOf(fetchMock).messages).toEqual([
      { role: "user", content: "check" },
      {
        role: "assistant",
        content: null,
        tool_calls: [
          {
            id: "call_abc",
            type: "function",
            function: { name: "logs_search", arguments: "{}" },
          },
        ],
      },
      { role: "tool", tool_call_id: "call_abc", content: "[]" },
    ]);
    expect(result.ok && result.data.stopReason).toBe("stop");
    expect(result.ok && result.data.text).toBe("all clear");
  });

  it("omits the tool fields entirely when no tool is offered", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(200, { choices: [{ message: { content: "hi" } }] }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await provider().chat({ messages: [{ role: "user", content: "hi" }] });

    const body = bodyOf(fetchMock);
    expect(body).not.toHaveProperty("tools");
    expect(body).not.toHaveProperty("tool_choice");
  });

  it("reports tool calls even when the endpoint claims it stopped normally", async () => {
    // Ollama answers finish_reason "stop" alongside tool_calls; the calls have
    // to win or the agent loop would drop them.
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(
        jsonResponse(200, {
          choices: [
            {
              message: {
                content: "",
                tool_calls: [{ id: "c1", function: { name: "logs_search" } }],
              },
              finish_reason: "stop",
            },
          ],
        }),
      ),
    );

    const result = await provider().chat({
      messages: [{ role: "user", content: "go" }],
    });

    expect(result.ok && result.data.stopReason).toBe("tool_calls");
    // Absent arguments mean "no arguments", not a broken call.
    expect(result.ok && result.data.toolCalls[0].arguments).toBe("{}");
  });

  it("maps a truncated answer to max_tokens", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(
        jsonResponse(200, {
          choices: [
            { message: { content: "half a th" }, finish_reason: "length" },
          ],
        }),
      ),
    );

    const result = await provider().chat({
      messages: [{ role: "user", content: "write an essay" }],
    });

    expect(result.ok && result.data.stopReason).toBe("max_tokens");
  });

  it("rejects a tool call that carries no name", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(
        jsonResponse(200, {
          choices: [
            {
              message: {
                content: "",
                tool_calls: [{ id: "c1", function: {} }],
              },
              finish_reason: "tool_calls",
            },
          ],
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
      message: "Model requested a tool without naming it",
    });
  });

  it("keeps the API key out of an upstream error message", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(`bad key ${API_KEY}`, { status: 401 }),
        ),
    );

    const result = await provider().chat({
      messages: [{ role: "user", content: "go" }],
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.kind).toBe("error");
    if (result.kind !== "error") return;
    expect(result.category).toBe("auth");
    expect(result.message).not.toContain(API_KEY);
  });
});
