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

export interface LlmProvider {
  // The ProviderCredential id this driver was built from.
  readonly id: string;
  readonly label: string;
  readonly model: string;
  readonly mode: "real" | "mock";
  complete(request: LlmCompletionRequest): Promise<LlmResult<LlmCompletion>>;
  embed(request: LlmEmbedRequest): Promise<LlmResult<LlmEmbedding>>;
}
