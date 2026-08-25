// LLM provider contract, shaped after src/lib/providers/result.ts and
// src/lib/providers/dns/types.ts: drivers never throw to callers, every
// failure is in-band, and an operation a driver cannot perform is
// "unsupported" rather than an error.
//
// `category` is the one addition over ProviderResult — a model call fails in
// ways a caller may want to distinguish (a rate-limited call is worth
// retrying later, an auth failure is not), and the mapping lives in one place
// (src/lib/llm/openai.ts) instead of in message-string matching.

export type LlmErrorCategory =
  "auth" | "rate_limit" | "timeout" | "upstream" | "invalid_response";

export type LlmResult<T> =
  | { ok: true; data: T }
  | { ok: false; kind: "error"; category: LlmErrorCategory; message: string }
  | { ok: false; kind: "unsupported"; operation: string };

export interface LlmUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface LlmCompletionRequest {
  prompt: string;
  system?: string;
  maxTokens?: number;
  signal?: AbortSignal;
  // Ask the endpoint for a single JSON object. A hint to the transport, never
  // a guarantee: OpenAI-compatible endpoints support response_format
  // unevenly (Ollama, vLLM and DeepSeek disagree) and the Anthropic Messages
  // API has no such field at all. The format contract is therefore always
  // repeated in the system prompt, and the answer is always validated by the
  // caller through src/lib/llm/json.ts.
  responseFormat?: "text" | "json";
  // Deterministic answer for the MOCK driver, which returns it verbatim; REAL
  // drivers ignore it. It exists for e2e: a feature needs a reproducible
  // answer of the right shape, and src/lib/llm must not know domain types —
  // so the caller builds the answer from the same input it builds the prompt
  // from (see src/lib/mail/ai-prompts.ts).
  mockAnswer?: string;
}

export interface LlmCompletion {
  text: string;
  // The model that actually answered, as reported by the endpoint — it can
  // differ from the configured name (aliases, routed models), and the audit
  // trail records what ran, not what was asked for.
  model: string;
  usage: LlmUsage;
}

export interface LlmEmbedRequest {
  input: string[];
  signal?: AbortSignal;
}

export interface LlmEmbedding {
  vectors: number[][];
  model: string;
  usage: LlmUsage;
}

// --- Tool-calling conversation ---
//
// `complete()` answers one prompt in one turn. An agent instead runs a
// transcript: the model asks for a tool, the caller runs it, the result goes
// back, and the loop repeats until the model answers in prose. That needs a
// message list and a tool list, so it is a second operation rather than more
// options on the first — a mail summary must not grow a `messages` field it
// will never use.

export interface LlmToolDefinition {
  name: string;
  description: string;
  /**
   * JSON Schema for the tool's arguments, produced by
   * `z.toJSONSchema(schema, { io: "input" })`. Kept as plain JSON rather than a
   * zod type so src/lib/llm stays free of the caller's validation library.
   */
  inputSchema: Record<string, unknown>;
}

export interface LlmToolCall {
  /** Correlates the call with the `tool` message that answers it. */
  id: string;
  name: string;
  /**
   * Raw JSON text, deliberately not a parsed object: a model can emit invalid
   * JSON, and the caller has to be able to hand that back as a tool error
   * rather than have the driver throw mid-conversation.
   */
  arguments: string;
}

export type LlmMessage =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string; toolCalls?: LlmToolCall[] }
  | {
      role: "tool";
      toolCallId: string;
      toolName: string;
      content: string;
      isError?: boolean;
    };

export type LlmStopReason = "stop" | "tool_calls" | "max_tokens" | "other";

/**
 * One scripted answer for the MOCK driver. The domain builds the script from
 * the same input it builds the prompt from, exactly as `mockAnswer` works for
 * `complete()` — src/lib/llm must not know what a dashboard tool is.
 */
export interface LlmMockTurn {
  text?: string;
  toolCalls?: Array<{ name: string; arguments: Record<string, unknown> }>;
}

export interface LlmChatRequest {
  system?: string;
  messages: LlmMessage[];
  tools?: LlmToolDefinition[];
  maxTokens?: number;
  signal?: AbortSignal;
  mockTurns?: readonly LlmMockTurn[];
}

export interface LlmChatCompletion {
  /** Prose the model produced this turn; empty when it only asked for tools. */
  text: string;
  toolCalls: LlmToolCall[];
  stopReason: LlmStopReason;
  model: string;
  usage: LlmUsage;
}

export interface LlmProvider {
  // The ProviderCredential id this driver was built from.
  readonly id: string;
  readonly label: string;
  readonly model: string;
  readonly mode: "real" | "mock";
  complete(request: LlmCompletionRequest): Promise<LlmResult<LlmCompletion>>;
  embed(request: LlmEmbedRequest): Promise<LlmResult<LlmEmbedding>>;
  // Required rather than optional: three drivers implement it against a
  // handful of call sites, so making every caller null-check forever would buy
  // nothing.
  chat(request: LlmChatRequest): Promise<LlmResult<LlmChatCompletion>>;
}
