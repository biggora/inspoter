import { env } from "@/lib/config/env";
import type {
  LlmCompletion,
  LlmCompletionRequest,
  LlmEmbedRequest,
  LlmEmbedding,
  LlmErrorCategory,
  LlmProvider,
  LlmResult,
  LlmUsage,
} from "@/lib/llm/contract";

// REAL driver for any OpenAI-compatible endpoint: Ollama, vLLM, LM Studio,
// OpenRouter, or OpenAI itself — they share `POST /chat/completions` and
// `POST /embeddings`, so one adapter covers all of them.
//
// Deliberately does not reuse src/lib/providers/http.ts: that client retries
// every request three times, which is right for a listing call and wrong for
// a model call (each attempt costs tokens or a GPU-minute, and a timeout
// often means the model is still generating). This driver makes exactly one
// attempt and reports why it failed instead.
//
// Redaction (architecture.md §7.6): request headers and bodies are never
// logged or returned; the API key is scrubbed from every message that can
// reach a LogEntry or the UI.

const SNIPPET_MAX = 200;

interface ChatCompletionResponse {
  model?: string;
  choices?: Array<{ message?: { content?: string } }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}

interface EmbeddingsResponse {
  model?: string;
  data?: Array<{ embedding?: number[] }>;
  usage?: { prompt_tokens?: number; total_tokens?: number };
}

function categoryForStatus(status: number): LlmErrorCategory {
  if (status === 401 || status === 403) return "auth";
  if (status === 429) return "rate_limit";
  if (status === 408 || status === 504) return "timeout";
  return "upstream";
}

function truncate(text: string): string {
  const collapsed = text.replace(/\s+/g, " ").trim();
  return collapsed.length > SNIPPET_MAX
    ? `${collapsed.slice(0, SNIPPET_MAX)}…`
    : collapsed;
}

// Mirrors describeError() in src/lib/providers/http.ts: undici hides the real
// reason behind a bare "fetch failed" and puts it in `cause`.
function describeError(err: unknown): string {
  if (err && typeof err === "object") {
    const cause = (err as { cause?: unknown }).cause;
    if (cause instanceof Error && cause.message) return cause.message;
    const message = (err as { message?: unknown }).message;
    if (typeof message === "string" && message) return message;
  }
  return String(err);
}

function toUsage(
  raw: { prompt_tokens?: number; completion_tokens?: number } | undefined,
): LlmUsage {
  const promptTokens = raw?.prompt_tokens ?? 0;
  const completionTokens = raw?.completion_tokens ?? 0;
  return {
    promptTokens,
    completionTokens,
    totalTokens: promptTokens + completionTokens,
  };
}

export class OpenAiCompatibleLlmProvider implements LlmProvider {
  readonly mode = "real" as const;
  readonly id: string;
  readonly label: string;
  readonly model: string;
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(
    id: string,
    label: string,
    baseUrl: string,
    model: string,
    apiKey: string,
  ) {
    this.id = id;
    this.label = label;
    this.model = model;
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.apiKey = apiKey;
  }

  // The key is not expected in an upstream body, but an echoing proxy or a
  // verbose gateway error would put it there — and that text is headed for
  // the Logs page.
  private redact(text: string): string {
    return this.apiKey ? text.split(this.apiKey).join("***") : text;
  }

  private error(category: LlmErrorCategory, message: string): LlmResult<never> {
    return {
      ok: false,
      kind: "error",
      category,
      message: this.redact(message),
    };
  }

  private async post<T>(
    path: string,
    body: unknown,
    signal: AbortSignal | undefined,
  ): Promise<LlmResult<T>> {
    const timeoutSignal = AbortSignal.timeout(env.LLM_REQUEST_TIMEOUT_MS);
    let response: Response;

    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: signal
          ? AbortSignal.any([signal, timeoutSignal])
          : timeoutSignal,
      });
    } catch (err) {
      if (timeoutSignal.aborted) {
        return this.error(
          "timeout",
          `Model request timed out after ${env.LLM_REQUEST_TIMEOUT_MS} ms`,
        );
      }
      if (signal?.aborted) return this.error("upstream", "Request aborted");
      return this.error("upstream", `Model unreachable: ${describeError(err)}`);
    }

    if (!response.ok) {
      return this.error(
        categoryForStatus(response.status),
        `Model error (HTTP ${response.status}): ${await this.bodySnippet(response)}`,
      );
    }

    const text = await response.text();
    try {
      return { ok: true, data: JSON.parse(text) as T };
    } catch {
      return this.error(
        "invalid_response",
        `Invalid response from model: ${truncate(text)}`,
      );
    }
  }

  // Must never throw itself — a broken body stream shouldn't take down error
  // handling with it (same contract as providers/http.ts's safeBodySnippet).
  private async bodySnippet(response: Response): Promise<string> {
    try {
      return truncate(await response.text());
    } catch {
      return "(unable to read response body)";
    }
  }

  async complete(
    request: LlmCompletionRequest,
  ): Promise<LlmResult<LlmCompletion>> {
    const result = await this.post<ChatCompletionResponse>(
      "/chat/completions",
      {
        model: this.model,
        messages: [
          ...(request.system
            ? [{ role: "system", content: request.system }]
            : []),
          { role: "user", content: request.prompt },
        ],
        ...(request.maxTokens !== undefined
          ? { max_tokens: request.maxTokens }
          : {}),
        // Belt to the system prompt's braces: endpoints that honour it stop
        // wrapping the object in prose, and endpoints that don't simply
        // ignore an unknown key.
        ...(request.responseFormat === "json"
          ? { response_format: { type: "json_object" } }
          : {}),
        stream: false,
      },
      request.signal,
    );
    if (!result.ok) return result;

    const text = result.data.choices?.[0]?.message?.content;
    if (typeof text !== "string") {
      return this.error(
        "invalid_response",
        "Model response contains no message content",
      );
    }

    return {
      ok: true,
      data: {
        text,
        model: result.data.model ?? this.model,
        usage: toUsage(result.data.usage),
      },
    };
  }

  async embed(request: LlmEmbedRequest): Promise<LlmResult<LlmEmbedding>> {
    const result = await this.post<EmbeddingsResponse>(
      "/embeddings",
      { model: this.model, input: request.input },
      request.signal,
    );
    if (!result.ok) return result;

    const entries = result.data.data ?? [];
    const vectors = entries.map((entry) => entry.embedding);
    if (
      entries.length !== request.input.length ||
      vectors.some((vector) => !Array.isArray(vector))
    ) {
      return this.error(
        "invalid_response",
        `Model returned ${entries.length} embeddings for ${request.input.length} inputs`,
      );
    }

    return {
      ok: true,
      data: {
        vectors: vectors as number[][],
        model: result.data.model ?? this.model,
        // The embeddings endpoint reports no completion tokens.
        usage: toUsage(result.data.usage),
      },
    };
  }
}
