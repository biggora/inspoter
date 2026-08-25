import { env } from "@/lib/config/env";
import type {
  LlmChatCompletion,
  LlmChatRequest,
  LlmCompletion,
  LlmCompletionRequest,
  LlmEmbedding,
  LlmErrorCategory,
  LlmMessage,
  LlmProvider,
  LlmResult,
  LlmStopReason,
  LlmToolCall,
  LlmUsage,
} from "@/lib/llm/contract";

// REAL driver for any Anthropic-compatible endpoint: z.ai/GLM
// (https://api.z.ai/api/anthropic) or Anthropic itself. They share
// `POST /v1/messages`, which differs from the OpenAI shape in three ways that
// matter here: `system` is a top-level field rather than a message, the answer
// is a list of content blocks rather than one string, and `max_tokens` is
// mandatory on every request.
//
// Like src/lib/llm/openai.ts this makes exactly one attempt and deliberately
// does not reuse src/lib/providers/http.ts, whose three retries are right for
// a listing call and wrong for a model call. Redaction follows
// architecture.md §7.6: the API key is scrubbed from every message that can
// reach a LogEntry or the UI.

const SNIPPET_MAX = 200;

// The Messages API rejects a request without max_tokens, so a driver-level
// default is a requirement rather than a preference. 1024 is the ceiling of a
// cheap answer: a mail summary and a filter proposal land near 300, and a
// reply draft passes its own larger limit explicitly.
const DEFAULT_MAX_TOKENS = 1024;
const ANTHROPIC_VERSION = "2023-06-01";

// Anthropic has no response_format. The canonical way to force a JSON object
// is to prefill the assistant turn with the opening brace: the model then
// cannot begin with prose or a fenced block. The brace is stitched back on so
// the caller always sees a whole object.
const JSON_PREFILL = "{";

interface MessagesResponse {
  model?: string;
  content?: Array<{
    type?: string;
    text?: string;
    id?: string;
    name?: string;
    input?: unknown;
  }>;
  stop_reason?: string;
  usage?: { input_tokens?: number; output_tokens?: number };
}

interface ErrorResponse {
  error?: { type?: string; message?: string };
}

function withPrefill(text: string): string {
  return text.trimStart().startsWith(JSON_PREFILL)
    ? text
    : `${JSON_PREFILL}${text}`;
}

function errorTypeOf(body: string): string | undefined {
  try {
    return (JSON.parse(body) as ErrorResponse).error?.type;
  } catch {
    return undefined;
  }
}

// Anthropic reports several conditions as HTTP 400 with a typed body, so the
// status alone cannot tell a wrong key from a malformed request. 529
// (overloaded) maps to rate_limit rather than upstream because the only
// distinction a caller acts on is whether retrying later is worth it.
function categoryForResponse(
  status: number,
  errorType: string | undefined,
): LlmErrorCategory {
  if (status === 401 || status === 403) return "auth";
  if (status === 429 || status === 529) return "rate_limit";
  if (status === 408 || status === 504) return "timeout";
  if (
    errorType === "authentication_error" ||
    errorType === "permission_error"
  ) {
    return "auth";
  }
  if (errorType === "rate_limit_error" || errorType === "overloaded_error") {
    return "rate_limit";
  }
  return "upstream";
}

function truncate(text: string): string {
  const collapsed = text.replace(/\s+/g, " ").trim();
  return collapsed.length > SNIPPET_MAX
    ? `${collapsed.slice(0, SNIPPET_MAX)}…`
    : collapsed;
}

// Mirrors describeError() in src/lib/llm/openai.ts: undici hides the real
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

// The one place the two wire formats genuinely diverge. Anthropic has no
// `tool` role: a tool's answer is a `tool_result` block inside a *user* turn,
// and a run of results has to arrive as ONE turn — sending them as consecutive
// user messages is rejected. So the flat contract transcript is regrouped here.
function toWireMessages(
  messages: readonly LlmMessage[],
): Array<Record<string, unknown>> {
  const wire: Array<Record<string, unknown>> = [];
  let pendingResults: Array<Record<string, unknown>> = [];

  const flushResults = (): void => {
    if (pendingResults.length === 0) return;
    wire.push({ role: "user", content: pendingResults });
    pendingResults = [];
  };

  for (const message of messages) {
    if (message.role === "tool") {
      pendingResults.push({
        type: "tool_result",
        tool_use_id: message.toolCallId,
        content: message.content,
        ...(message.isError ? { is_error: true } : {}),
      });
      continue;
    }

    flushResults();

    if (message.role === "assistant") {
      const blocks: Array<Record<string, unknown>> = [];
      if (message.content) blocks.push({ type: "text", text: message.content });
      for (const call of message.toolCalls ?? []) {
        blocks.push({
          type: "tool_use",
          id: call.id,
          name: call.name,
          // The transcript carries arguments as text (see LlmToolCall); the
          // API wants the object back. This text came from this driver's own
          // JSON.stringify of the model's input, so a parse failure means the
          // caller rewrote it — an empty object is closer to the truth than a
          // throw.
          input: parseArguments(call.arguments),
        });
      }
      wire.push({ role: "assistant", content: blocks });
      continue;
    }

    wire.push({ role: "user", content: message.content });
  }

  flushResults();
  return wire;
}

function parseArguments(raw: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function stopReasonFor(
  raw: string | undefined,
  toolCalls: readonly LlmToolCall[],
): LlmStopReason {
  if (toolCalls.length > 0) return "tool_calls";
  if (raw === "max_tokens") return "max_tokens";
  if (raw === "end_turn" || raw === "stop_sequence") return "stop";
  return "other";
}

function toUsage(
  raw: { input_tokens?: number; output_tokens?: number } | undefined,
): LlmUsage {
  const promptTokens = raw?.input_tokens ?? 0;
  const completionTokens = raw?.output_tokens ?? 0;
  return {
    promptTokens,
    completionTokens,
    totalTokens: promptTokens + completionTokens,
  };
}

export class AnthropicCompatibleLlmProvider implements LlmProvider {
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
          // z.ai accepts the bearer form, and so does Anthropic; carrying one
          // scheme instead of also setting x-api-key leaves a single thing to
          // redact.
          Authorization: `Bearer ${this.apiKey}`,
          "anthropic-version": ANTHROPIC_VERSION,
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

    // Read the body once: it serves both the error category (the typed 400s
    // above) and the truncated snippet.
    const text = await this.bodyText(response);

    if (!response.ok) {
      return this.error(
        categoryForResponse(response.status, errorTypeOf(text)),
        `Model error (HTTP ${response.status}): ${truncate(text)}`,
      );
    }

    try {
      return { ok: true, data: JSON.parse(text) as T };
    } catch {
      return this.error(
        "invalid_response",
        `Invalid response from model: ${truncate(text)}`,
      );
    }
  }

  // Must never throw itself — a broken body stream should not take down error
  // handling with it (same contract as bodySnippet in openai.ts).
  private async bodyText(response: Response): Promise<string> {
    try {
      return await response.text();
    } catch {
      return "(unable to read response body)";
    }
  }

  async complete(
    request: LlmCompletionRequest,
  ): Promise<LlmResult<LlmCompletion>> {
    const wantsJson = request.responseFormat === "json";
    const result = await this.post<MessagesResponse>(
      "/v1/messages",
      {
        model: this.model,
        max_tokens: request.maxTokens ?? DEFAULT_MAX_TOKENS,
        ...(request.system ? { system: request.system } : {}),
        messages: [
          { role: "user", content: request.prompt },
          ...(wantsJson ? [{ role: "assistant", content: JSON_PREFILL }] : []),
        ],
        stream: false,
      },
      request.signal,
    );
    if (!result.ok) return result;

    const texts = (result.data.content ?? [])
      .filter(
        (block) => block.type === "text" && typeof block.text === "string",
      )
      .map((block) => block.text as string);
    if (texts.length === 0) {
      return this.error(
        "invalid_response",
        "Model response contains no text block",
      );
    }

    const joined = texts.join("");
    return {
      ok: true,
      data: {
        // Stitch the prefill back on so the caller sees a whole object —
        // unless the upstream ignored the prefill and answered with one
        // already. A continuation of "{" can never itself start with "{"
        // (the next token has to be a key or the closing brace), so the
        // check cannot misfire on a prefill that was honoured.
        text: wantsJson ? withPrefill(joined) : joined,
        model: result.data.model ?? this.model,
        usage: toUsage(result.data.usage),
      },
    };
  }

  async chat(request: LlmChatRequest): Promise<LlmResult<LlmChatCompletion>> {
    // No JSON prefill here: an assistant prefill and tool use cannot coexist —
    // the model has to be free to open its turn with a tool_use block.
    const result = await this.post<MessagesResponse>(
      "/v1/messages",
      {
        model: this.model,
        max_tokens: request.maxTokens ?? DEFAULT_MAX_TOKENS,
        ...(request.system ? { system: request.system } : {}),
        messages: toWireMessages(request.messages),
        ...(request.tools?.length
          ? {
              tools: request.tools.map((tool) => ({
                name: tool.name,
                description: tool.description,
                input_schema: tool.inputSchema,
              })),
            }
          : {}),
        stream: false,
      },
      request.signal,
    );
    if (!result.ok) return result;

    const texts: string[] = [];
    const toolCalls: LlmToolCall[] = [];
    for (const block of result.data.content ?? []) {
      if (block.type === "text" && typeof block.text === "string") {
        texts.push(block.text);
        continue;
      }
      if (block.type === "tool_use") {
        if (!block.id || !block.name) {
          return this.error(
            "invalid_response",
            "Model requested a tool without an id or a name",
          );
        }
        toolCalls.push({
          id: block.id,
          name: block.name,
          arguments: JSON.stringify(block.input ?? {}),
        });
      }
    }

    return {
      ok: true,
      data: {
        text: texts.join(""),
        toolCalls,
        stopReason: stopReasonFor(result.data.stop_reason, toolCalls),
        model: result.data.model ?? this.model,
        usage: toUsage(result.data.usage),
      },
    };
  }

  // The parameter is omitted rather than ignored: there is no input to read
  // when the operation does not exist.
  async embed(): Promise<LlmResult<LlmEmbedding>> {
    // The Messages API has no embeddings endpoint and there is nothing to fall
    // back to. "unsupported" is the contract word for an operation a driver
    // cannot perform, as opposed to one that was attempted and failed —
    // nothing leaves the machine.
    return { ok: false, kind: "unsupported", operation: "embed" };
  }
}
