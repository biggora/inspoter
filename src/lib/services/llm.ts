import { env } from "@/lib/config/env";
import type {
  LlmCompletion,
  LlmCompletionRequest,
  LlmEmbedRequest,
  LlmEmbedding,
  LlmProvider,
  LlmResult,
  LlmUsage,
} from "@/lib/llm/contract";
import { getLlmProviderForWorkspace } from "@/lib/llm/registry";
import { recordActivity } from "@/lib/services/activity";

// The single sanctioned entry point for every model call. Feature code calls
// these functions, never a driver directly, so that the workspace rate limit
// and the Activity audit entry cannot be bypassed by a new caller.
//
// When the workspace has no LLM credential the layer is off and both calls
// return `unsupported` — the caller renders an empty state, nothing is
// logged, and no request leaves the machine.

export interface LlmCaller {
  operatorId: string;
  operatorName: string;
}

// In-process fixed-window limiter per workspace, copied from
// checkSendRateLimit in src/lib/services/mail-actions.ts (same single-process
// assumption). Limits are read at call time so tests can tighten them.
interface CallWindowState {
  count: number;
  windowStart: number;
}

const callWindows = new Map<string, CallWindowState>();

function withinRateLimit(workspaceId: string): boolean {
  const now = Date.now();
  const state = callWindows.get(workspaceId);
  if (!state || now - state.windowStart >= env.LLM_CALL_RATE_WINDOW_MS) {
    callWindows.set(workspaceId, { count: 1, windowStart: now });
    return true;
  }
  if (state.count < env.LLM_CALL_RATE_LIMIT) {
    state.count += 1;
    return true;
  }
  return false;
}

async function run<T extends { model: string; usage: LlmUsage }>(
  workspaceId: string,
  caller: LlmCaller,
  operation: "complete" | "embed",
  call: (provider: LlmProvider) => Promise<LlmResult<T>>,
): Promise<LlmResult<T>> {
  const provider = await getLlmProviderForWorkspace(workspaceId);
  if (!provider) return { ok: false, kind: "unsupported", operation };

  if (!withinRateLimit(workspaceId)) {
    return {
      ok: false,
      kind: "error",
      category: "rate_limit",
      message: `Model call rate limit reached (${env.LLM_CALL_RATE_LIMIT} per ${env.LLM_CALL_RATE_WINDOW_MS} ms)`,
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
