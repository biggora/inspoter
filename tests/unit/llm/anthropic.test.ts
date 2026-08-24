import { afterEach, describe, expect, it, vi } from "vitest";
import { AnthropicCompatibleLlmProvider } from "@/lib/llm/anthropic";

// REAL driver for the Anthropic Messages shape (z.ai/GLM and Anthropic
// itself). Covers what differs from openai.ts: mandatory max_tokens, the
// version header, content blocks instead of one string, the typed HTTP 400
// bodies, the JSON prefill, and an embed() that never touches the network.

// env is parsed once at import time, so the request deadline is stubbed at
// the module level — short enough that the timeout case cannot stall the run.
vi.mock("@/lib/config/env", () => ({
  env: { LLM_REQUEST_TIMEOUT_MS: 20 },
}));

const API_KEY = "sk-zai-super-secret-key";

function provider(): AnthropicCompatibleLlmProvider {
  return new AnthropicCompatibleLlmProvider(
    "cred-1",
    "GLM",
    // Trailing slash on purpose: the driver must not build "//v1/messages".
    "https://api.z.ai/api/anthropic/",
    "glm-4.6",
    API_KEY,
  );
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function okBody(text: string) {
  return {
    model: "glm-4.6-0801",
    content: [{ type: "text", text }],
    usage: { input_tokens: 12, output_tokens: 3 },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("AnthropicCompatibleLlmProvider.complete()", () => {
  it("posts to <baseUrl>/v1/messages with the version header and maps usage", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, okBody("the answer")));
    vi.stubGlobal("fetch", fetchMock);

    const result = await provider().complete({
      prompt: "the question",
      system: "be terse",
    });

    expect(result).toEqual({
      ok: true,
      data: {
        text: "the answer",
        model: "glm-4.6-0801",
        usage: { promptTokens: 12, completionTokens: 3, totalTokens: 15 },
      },
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.z.ai/api/anthropic/v1/messages");
    expect(init.headers).toMatchObject({
      Authorization: `Bearer ${API_KEY}`,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    });

    const body = JSON.parse(init.body);
    expect(body).toMatchObject({
      model: "glm-4.6",
      system: "be terse",
      messages: [{ role: "user", content: "the question" }],
      stream: false,
    });
  });

  it("always sends max_tokens, defaulting when the caller gives none", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(200, okBody("answer")));
    vi.stubGlobal("fetch", fetchMock);

    await provider().complete({ prompt: "q" });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).max_tokens).toBe(1024);

    await provider().complete({ prompt: "q", maxTokens: 64 });
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).max_tokens).toBe(64);
  });

  it("omits system when the caller gives none", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, okBody("answer")));
    vi.stubGlobal("fetch", fetchMock);

    await provider().complete({ prompt: "q" });

    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).not.toHaveProperty(
      "system",
    );
  });

  it("joins several text blocks and ignores non-text ones", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      jsonResponse(200, {
        model: "glm-4.6",
        content: [
          { type: "text", text: "first " },
          { type: "thinking", thinking: "ignored" },
          { type: "text", text: "second" },
        ],
        usage: { input_tokens: 1, output_tokens: 2 },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await provider().complete({ prompt: "q" });

    expect(result).toMatchObject({ ok: true, data: { text: "first second" } });
  });

  it("reports invalid_response when the reply carries no text block", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(
        jsonResponse(200, {
          model: "glm-4.6",
          content: [{ type: "thinking", thinking: "only this" }],
        }),
      ),
    );

    const result = await provider().complete({ prompt: "q" });

    expect(result).toMatchObject({
      ok: false,
      kind: "error",
      category: "invalid_response",
    });
  });

  it("falls back to the configured model name when the reply omits it", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          jsonResponse(200, { content: [{ type: "text", text: "a" }] }),
        ),
    );

    const result = await provider().complete({ prompt: "q" });

    expect(result).toMatchObject({
      ok: true,
      data: { model: "glm-4.6", usage: { totalTokens: 0 } },
    });
  });

  it("makes exactly one attempt — a model call is never retried", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(500, { error: { type: "api_error" } }));
    vi.stubGlobal("fetch", fetchMock);

    await provider().complete({ prompt: "q" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("reports a timeout instead of hanging past the deadline", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            init.signal?.addEventListener("abort", () =>
              reject(new Error("aborted")),
            );
          }),
      ),
    );

    const result = await provider().complete({ prompt: "q" });

    expect(result).toMatchObject({
      ok: false,
      kind: "error",
      category: "timeout",
    });
  });

  it("unwraps the undici cause instead of reporting a bare fetch failure", async () => {
    const failure = new Error("fetch failed");
    (failure as { cause?: unknown }).cause = new Error("ECONNREFUSED");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValueOnce(failure));

    const result = await provider().complete({ prompt: "q" });

    expect(result).toMatchObject({ ok: false, category: "upstream" });
    expect((result as { message: string }).message).toContain("ECONNREFUSED");
  });

  it("never lets the API key reach an error message", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(`gateway echoed ${API_KEY} back`, { status: 502 }),
        ),
    );

    const result = await provider().complete({ prompt: "q" });

    const message = (result as { message: string }).message;
    expect(message).not.toContain(API_KEY);
    expect(message).toContain("***");
  });
});

describe("AnthropicCompatibleLlmProvider error categories", () => {
  it.each([
    [401, undefined, "auth"],
    [403, undefined, "auth"],
    [429, undefined, "rate_limit"],
    [529, undefined, "rate_limit"],
    [408, undefined, "timeout"],
    [504, undefined, "timeout"],
    [500, undefined, "upstream"],
    [404, undefined, "upstream"],
    // Anthropic reports these as HTTP 400 with a typed body, so the status
    // alone would misclassify all four.
    [400, "authentication_error", "auth"],
    [400, "permission_error", "auth"],
    [400, "rate_limit_error", "rate_limit"],
    [400, "overloaded_error", "rate_limit"],
    [400, "invalid_request_error", "upstream"],
  ])("maps HTTP %s / %s to %s", async (status, errorType, category) => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(
        jsonResponse(status as number, {
          type: "error",
          error: { type: errorType, message: "nope" },
        }),
      ),
    );

    const result = await provider().complete({ prompt: "q" });

    expect(result).toMatchObject({ ok: false, kind: "error", category });
  });

  it("falls back to upstream when the error body is not JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response("<html>bad gateway", { status: 400 }),
        ),
    );

    const result = await provider().complete({ prompt: "q" });

    expect(result).toMatchObject({ ok: false, category: "upstream" });
  });

  it("reports invalid_response when a 200 body is not JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(new Response("not json", { status: 200 })),
    );

    const result = await provider().complete({ prompt: "q" });

    expect(result).toMatchObject({ ok: false, category: "invalid_response" });
  });
});

describe("AnthropicCompatibleLlmProvider JSON mode", () => {
  it("prefills the assistant turn with a brace and stitches it back on", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, okBody('"a":1}')));
    vi.stubGlobal("fetch", fetchMock);

    const result = await provider().complete({
      prompt: "q",
      responseFormat: "json",
    });

    expect(JSON.parse(fetchMock.mock.calls[0][1].body).messages).toEqual([
      { role: "user", content: "q" },
      { role: "assistant", content: "{" },
    ]);
    expect(result).toMatchObject({ ok: true, data: { text: '{"a":1}' } });
  });

  it("does not double the brace when the upstream ignores the prefill", async () => {
    // A compatible implementation is free to ignore the prefill and answer
    // with the whole object; z.ai is such an implementation, not Anthropic.
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(jsonResponse(200, okBody('{"a":1}'))),
    );

    const result = await provider().complete({
      prompt: "q",
      responseFormat: "json",
    });

    expect(result).toMatchObject({ ok: true, data: { text: '{"a":1}' } });
  });

  it("sends no prefill in text mode", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, okBody("plain")));
    vi.stubGlobal("fetch", fetchMock);

    await provider().complete({ prompt: "q" });

    expect(JSON.parse(fetchMock.mock.calls[0][1].body).messages).toEqual([
      { role: "user", content: "q" },
    ]);
  });
});

describe("AnthropicCompatibleLlmProvider.embed()", () => {
  it("reports unsupported without touching the network", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    // The driver takes no argument at all: "unsupported" is decided before
    // there is anything to read.
    const result = await provider().embed();

    expect(result).toEqual({
      ok: false,
      kind: "unsupported",
      operation: "embed",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
