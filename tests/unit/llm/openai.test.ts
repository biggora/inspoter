import { afterEach, describe, expect, it, vi } from "vitest";
import { OpenAiCompatibleLlmProvider } from "@/lib/llm/openai";

// REAL driver: HTTP status -> typed error category, response parsing, and the
// promise that the API key never reaches an error message (architecture.md
// §7.6). One attempt per call — a model call is not retried.

// env is parsed once at import time, so the request deadline is stubbed at
// the module level — short enough that the timeout case cannot stall the run.
vi.mock("@/lib/config/env", () => ({
  env: { LLM_REQUEST_TIMEOUT_MS: 20 },
}));

const API_KEY = "sk-super-secret-key";

function provider(): OpenAiCompatibleLlmProvider {
  return new OpenAiCompatibleLlmProvider(
    "cred-1",
    "Local model",
    // Trailing slash on purpose: the driver must not build "//chat".
    "https://models.example.com/v1/",
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

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("OpenAiCompatibleLlmProvider.complete()", () => {
  it("posts to <baseUrl>/chat/completions and maps the answer with its token usage", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      jsonResponse(200, {
        model: "test-model-0125",
        choices: [{ message: { content: "the answer" } }],
        usage: { prompt_tokens: 12, completion_tokens: 3, total_tokens: 15 },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await provider().complete({
      prompt: "the question",
      system: "be terse",
    });

    expect(result).toEqual({
      ok: true,
      data: {
        text: "the answer",
        model: "test-model-0125",
        usage: { promptTokens: 12, completionTokens: 3, totalTokens: 15 },
      },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://models.example.com/v1/chat/completions");
    expect(JSON.parse(init.body)).toMatchObject({
      model: "test-model",
      messages: [
        { role: "system", content: "be terse" },
        { role: "user", content: "the question" },
      ],
      stream: false,
    });
  });

  it("falls back to the configured model name when the endpoint omits it", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(
        jsonResponse(200, {
          choices: [{ message: { content: "hi" } }],
        }),
      ),
    );

    const result = await provider().complete({ prompt: "hi" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.model).toBe("test-model");
    expect(result.data.usage.totalTokens).toBe(0);
  });

  it.each([
    [401, "auth"],
    [403, "auth"],
    [429, "rate_limit"],
    [408, "timeout"],
    [504, "timeout"],
    [500, "upstream"],
    [404, "upstream"],
  ])("maps HTTP %i to the %s category", async (status, category) => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(jsonResponse(status, { error: "nope" })),
    );

    const result = await provider().complete({ prompt: "hi" });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result).toMatchObject({ kind: "error", category });
  });

  it("maps an unparsable body to invalid_response", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response("<html>gateway</html>", { status: 200 }),
        ),
    );

    const result = await provider().complete({ prompt: "hi" });

    expect(result).toEqual({
      ok: false,
      kind: "error",
      category: "invalid_response",
      message: "Invalid response from model: <html>gateway</html>",
    });
  });

  it("maps a well-formed response without message content to invalid_response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(jsonResponse(200, { choices: [] })),
    );

    const result = await provider().complete({ prompt: "hi" });

    expect(result).toMatchObject({
      ok: false,
      category: "invalid_response",
    });
  });

  it("maps a transport failure to upstream and keeps the underlying cause", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValueOnce(
        Object.assign(new Error("fetch failed"), {
          cause: new Error("ECONNREFUSED 127.0.0.1:11434"),
        }),
      ),
    );

    const result = await provider().complete({ prompt: "hi" });

    expect(result).toEqual({
      ok: false,
      kind: "error",
      category: "upstream",
      message: "Model unreachable: ECONNREFUSED 127.0.0.1:11434",
    });
  });

  it("maps an expired request deadline to timeout", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        // Reject the way undici does once the AbortSignal.timeout fires.
        await new Promise((resolve) =>
          init.signal?.addEventListener("abort", resolve, { once: true }),
        );
        throw new DOMException("This operation was aborted", "AbortError");
      }),
    );

    const result = await provider().complete({ prompt: "hi" });

    expect(result).toEqual({
      ok: false,
      kind: "error",
      category: "timeout",
      message: "Model request timed out after 20 ms",
    });
  });

  it("never echoes the API key back into an error message", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          jsonResponse(400, { error: `bad key: ${API_KEY}` }),
        ),
    );

    const result = await provider().complete({ prompt: "hi" });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.kind).toBe("error");
    if (result.kind !== "error") return;
    expect(result.message).not.toContain(API_KEY);
    expect(result.message).toContain("***");
  });
});

describe("OpenAiCompatibleLlmProvider.embed()", () => {
  it("posts to <baseUrl>/embeddings and returns one vector per input", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      jsonResponse(200, {
        model: "test-embed",
        data: [{ embedding: [0.1, 0.2] }, { embedding: [0.3, 0.4] }],
        usage: { prompt_tokens: 4, total_tokens: 4 },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await provider().embed({ input: ["alpha", "beta"] });

    expect(result).toEqual({
      ok: true,
      data: {
        vectors: [
          [0.1, 0.2],
          [0.3, 0.4],
        ],
        model: "test-embed",
        usage: { promptTokens: 4, completionTokens: 0, totalTokens: 4 },
      },
    });
    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://models.example.com/v1/embeddings",
    );
  });

  it("rejects a response with fewer vectors than inputs", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          jsonResponse(200, { data: [{ embedding: [0.1] }] }),
        ),
    );

    const result = await provider().embed({ input: ["alpha", "beta"] });

    expect(result).toMatchObject({
      ok: false,
      category: "invalid_response",
    });
  });
});
