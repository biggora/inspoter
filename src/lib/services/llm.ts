import { env } from "@/lib/config/env";
import type {
  LlmChatCompletion,
  LlmChatRequest,
  LlmCompletion,
  LlmCompletionRequest,
  LlmEmbedRequest,
  LlmEmbedding,
  LlmProvider,
  LlmResult,
  LlmUsage,
} from "@/lib/llm/contract";
import {
  getEmbeddingProviderForWorkspace,
  getEmbeddingProviderForCredential,
  getLlmProviderForWorkspace,
} from "@/lib/llm/registry";
import { recordActivity } from "@/lib/services/activity";
import { BoundedFixedWindowLimiter } from "@/lib/rate-limit/fixed-window";

// The single sanctioned entry point for every model call. Feature code calls
// these functions, never a driver directly, so that the workspace rate limit
// and the Activity audit entry cannot be bypassed by a new caller.
//
// When the workspace has no LLM credential the layer is off and all three
// calls return `unsupported` — the caller renders an empty state, nothing is
// logged, and no request leaves the machine.

export interface LlmCaller {
  operatorId: string;
  operatorName: string;
}

type LlmOperation = "complete" | "embed" | "chat";

// In-process fixed-window limiter, copied from checkSendRateLimit in
// src/lib/services/mail-actions.ts (same single-process assumption). Limits are
// read at call time so tests can tighten them.
//
// The key is not simply the workspace id: an agent run spends one call per
// step, so it counts against its own window (see LLM_AGENT_CALL_RATE_LIMIT).
// A shared counter would make each workload an outage of the other.
const callLimiter = new BoundedFixedWindowLimiter();

function withinRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): boolean {
  return callLimiter.consume(key, limit, windowMs).allowed;
}

interface RateLimitPolicy {
  key: string;
  limit: number;
  windowMs: number;
}

function policyFor(
  workspaceId: string,
  operation: LlmOperation,
): RateLimitPolicy {
  return operation === "chat"
    ? {
        key: `agent:${workspaceId}`,
        limit: env.LLM_AGENT_CALL_RATE_LIMIT,
        windowMs: env.LLM_AGENT_CALL_RATE_WINDOW_MS,
      }
    : {
        key: workspaceId,
        limit: env.LLM_CALL_RATE_LIMIT,
        windowMs: env.LLM_CALL_RATE_WINDOW_MS,
      };
}

async function run<T extends { model: string; usage: LlmUsage }>(
  workspaceId: string,
  caller: LlmCaller,
  operation: LlmOperation,
  call: (provider: LlmProvider) => Promise<LlmResult<T>>,
  extraDetails?: (data: T) => Record<string, unknown>,
): Promise<LlmResult<T>> {
  const provider = await getLlmProviderForWorkspace(workspaceId);
  if (!provider) return { ok: false, kind: "unsupported", operation };

  const policy = policyFor(workspaceId, operation);
  if (!withinRateLimit(policy.key, policy.limit, policy.windowMs)) {
    return {
      ok: false,
      kind: "error",
      category: "rate_limit",
      message: `Model call rate limit reached (${policy.limit} per ${policy.windowMs} ms)`,
    };
  }

  const result = await call(provider);

  // Every call that reached a model is journaled, successful or not: the
  // token count is what an operator needs to explain a bill, and the failure
  // category is what they need to explain a gap. recordActivity swallows its
  // own failures, so this never breaks the call it audits.
  await recordActivity(workspaceId, {
    operatorId: caller.operatorId,
    operatorName: caller.operatorName,
    action: `llm_${operation}`,
    entityType: "llm_provider",
    entityId: provider.id,
    entityLabel: provider.label,
    details: JSON.stringify({
      mode: provider.mode,
      model: result.ok ? result.data.model : provider.model,
      tokens: result.ok ? result.data.usage.totalTokens : 0,
      ...(result.ok && extraDetails ? extraDetails(result.data) : {}),
      ...(result.ok
        ? {}
        : { error: result.kind === "error" ? result.category : result.kind }),
    }),
  });

  return result;
}

export function complete(
  workspaceId: string,
  caller: LlmCaller,
  request: LlmCompletionRequest,
): Promise<LlmResult<LlmCompletion>> {
  return run(workspaceId, caller, "complete", (provider) =>
    provider.complete(request),
  );
}

export function embed(
  workspaceId: string,
  caller: LlmCaller,
  request: LlmEmbedRequest,
): Promise<LlmResult<LlmEmbedding>> {
  return run(workspaceId, caller, "embed", (provider) =>
    provider.embed(request),
  );
}

export type EmbeddingWorkload = "query" | "index" | "probe";

export async function embedForRag(
  workspaceId: string,
  caller: LlmCaller,
  workload: EmbeddingWorkload,
  request: LlmEmbedRequest,
): Promise<LlmResult<LlmEmbedding>> {
  const provider = await getEmbeddingProviderForWorkspace(workspaceId);
  if (!provider) return { ok: false, kind: "unsupported", operation: "embed" };

  const isIndex = workload === "index";
  const limit = isIndex
    ? env.LLM_INDEX_EMBED_RATE_LIMIT
    : env.LLM_QUERY_EMBED_RATE_LIMIT;
  const policy = {
    key: `embedding:${workload}:${workspaceId}`,
    limit,
    windowMs: env.LLM_CALL_RATE_WINDOW_MS,
  };
  if (!withinRateLimit(policy.key, policy.limit, policy.windowMs)) {
    return {
      ok: false,
      kind: "error",
      category: "rate_limit",
      message: `Embedding rate limit reached (${policy.limit} per ${policy.windowMs} ms)`,
    };
  }

  const result = await provider.embed(request);
  await recordActivity(workspaceId, {
    operatorId: caller.operatorId,
    operatorName: caller.operatorName,
    action: "llm_embed",
    entityType: "llm_provider",
    entityId: provider.id,
    entityLabel: provider.label,
    details: JSON.stringify({
      mode: provider.mode,
      workload,
      model: result.ok ? result.data.model : provider.model,
      tokens: result.ok ? result.data.usage.totalTokens : 0,
      inputCount: request.input.length,
      ...(result.ok
        ? {}
        : { error: result.kind === "error" ? result.category : result.kind }),
    }),
  });
  return result;
}

export async function probeEmbeddingProvider(
  workspaceId: string,
  credentialId: string,
  model: string,
  caller: LlmCaller,
): Promise<LlmResult<LlmEmbedding>> {
  const provider = await getEmbeddingProviderForCredential(
    workspaceId,
    credentialId,
    model,
  );
  if (!provider) return { ok: false, kind: "unsupported", operation: "embed" };
  const policy = {
    key: `embedding:probe:${workspaceId}`,
    limit: env.LLM_QUERY_EMBED_RATE_LIMIT,
    windowMs: env.LLM_CALL_RATE_WINDOW_MS,
  };
  if (!withinRateLimit(policy.key, policy.limit, policy.windowMs)) {
    return {
      ok: false,
      kind: "error",
      category: "rate_limit",
      message: "Embedding probe rate limit reached.",
    };
  }
  const result = await provider.embed({ input: ["Inspoter embedding probe"] });
  await recordActivity(workspaceId, {
    operatorId: caller.operatorId,
    operatorName: caller.operatorName,
    action: "llm_embed",
    entityType: "llm_provider",
    entityId: provider.id,
    entityLabel: provider.label,
    details: JSON.stringify({
      workload: "probe",
      model: result.ok ? result.data.model : model,
      tokens: result.ok ? result.data.usage.totalTokens : 0,
      ...(result.ok
        ? {}
        : { error: result.kind === "error" ? result.category : result.kind }),
    }),
  });
  return result;
}

export function chat(
  workspaceId: string,
  caller: LlmCaller,
  request: LlmChatRequest,
): Promise<LlmResult<LlmChatCompletion>> {
  return run(
    workspaceId,
    caller,
    "chat",
    (provider) => provider.chat(request),
    // A run's Activity trail is a sequence of llm_chat rows; the stop reason
    // and the tool-call count are what make one row readable on its own.
    (data) => ({
      stopReason: data.stopReason,
      toolCalls: data.toolCalls.length,
    }),
  );
}
