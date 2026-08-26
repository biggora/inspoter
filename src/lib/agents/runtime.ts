import { env } from "@/lib/config/env";
import type { LlmMessage, LlmResult, LlmToolCall } from "@/lib/llm/contract";
import type { McpToolContext } from "@/lib/mcp/tool";
import * as llmService from "@/lib/services/llm";
import {
  appendStep,
  completeRun,
  emitRunReport,
  failRun,
  isCancelRequested,
  loadRunState,
  markCancelled,
  renewAgentRunLease,
  AgentRunLeaseLostError,
  saveRunRagSnapshot,
  type ClaimedAgentRun,
} from "@/lib/services/agent-runs";
import { buildChatHistory } from "@/lib/agents/chat-context";
import { retrieveNoteContext } from "@/lib/services/note-rag";
import { hasScope } from "@/lib/mcp/scopes";
import { Prisma } from "@/generated/prisma/client";
import {
  buildAgentMockTurns,
  buildAgentSystemPrompt,
  buildAgentUserPrompt,
} from "@/lib/agents/prompt";
import {
  buildAgentToolset,
  frameToolResult,
  toolResultToText,
  type AgentToolBinding,
} from "@/lib/agents/tools";

// The agent loop. One run = build the prompt and the toolset from the run's own
// snapshot, then alternate model call and tool calls until the model answers in
// prose or a ceiling stops it.
//
// Nothing here decides what an agent may touch: `buildAgentToolset` already
// returned only the tools the snapshot's scopes cover, so an out-of-scope call
// is impossible rather than refused.

export interface AgentRunOutcome {
  status: "SUCCEEDED" | "FAILED" | "CANCELLED";
  summary: string;
  stopReason: string;
}

function callerFor(agentName: string, agentId: string) {
  // The Activity trail records the agent, not a person: nobody was at the
  // keyboard. The id prefix keeps it distinguishable from an operator id.
  return { operatorId: `agent:${agentId}`, operatorName: agentName };
}

/** Only a rate limit is worth trying again; the rest are the run's own fault. */
function isRetryable(
  result: Extract<LlmResult<never>, { ok: false }>,
): boolean {
  return result.kind === "error" && result.category === "rate_limit";
}

function describe(result: Extract<LlmResult<never>, { ok: false }>): string {
  return result.kind === "unsupported"
    ? "No AI provider is configured for this workspace."
    : `${result.category}: ${result.message}`;
}

/**
 * Executes one claimed run to completion. Never throws for an ordinary failure
 * — the run row records what happened — but does propagate
 * AgentRunLeaseLostError so the caller stops working on a run it no longer owns.
 */
export async function executeAgentRun(
  claim: ClaimedAgentRun,
): Promise<AgentRunOutcome> {
  const state = await loadRunState(claim);

  const maxSteps = Math.min(state.maxSteps, env.AGENT_RUN_MAX_STEPS_CEILING);
  const maxTokens = Math.min(state.maxTokens, env.AGENT_RUN_MAX_TOKENS_CEILING);
  const timeoutSeconds = Math.min(
    state.timeoutSeconds,
    env.AGENT_RUN_MAX_TIMEOUT_SECONDS,
  );

  // A skill narrows the toolset only when it says so; several skills union
  // their lists, and a skill with no list means "no opinion".
  const allowNames = state.skills.flatMap((skill) => skill.toolNames);
  const toolset = buildAgentToolset(state.scopes, allowNames);
  const toolsByName = new Map<string, AgentToolBinding>(
    toolset.map((tool) => [tool.name, tool]),
  );

  const system = buildAgentSystemPrompt({
    agentName: state.agentName,
    instructions: state.instructions,
    skills: state.skills,
    toolNames: toolset.map((tool) => tool.name),
  });

  const toolContext: McpToolContext = {
    workspaceId: claim.workspaceId,
    scopes: state.scopes,
    // Not an operator id: the columns this reaches (KanbanComment.author*) are
    // plain strings, so an agent can sign its own work.
    tokenId: `agent:${claim.id}`,
    tokenName: state.agentName,
  };

  const messages: LlmMessage[] = [];
  if (
    state.trigger === "CHAT" &&
    state.conversationId &&
    state.conversationSequence != null
  ) {
    messages.push(
      ...(await buildChatHistory({
        workspaceId: claim.workspaceId,
        conversationId: state.conversationId,
        currentSequence: state.conversationSequence,
        agentName: state.agentName,
        runId: claim.id,
      })),
    );
  }
  let currentPrompt = buildAgentUserPrompt(state.input ?? "");
  if (state.trigger === "CHAT" && hasScope(state.scopes, "notes:read")) {
    const rag = await retrieveNoteContext(
      claim.workspaceId,
      state.input ?? "",
      claim.id,
    );
    await saveRunRagSnapshot(
      claim,
      rag.mode,
      rag.sources as unknown as Prisma.InputJsonValue,
    );
    if (rag.context) currentPrompt = `${rag.context}\n\n${currentPrompt}`;
  }
  messages.push({ role: "user", content: currentPrompt });
  const mockTurns = buildAgentMockTurns({
    agentName: state.agentName,
    toolNames: toolset.map((tool) => tool.name),
  });

  const caller = callerFor(state.agentName, claim.id);
  const deadline = new AbortController();
  const timer = setTimeout(
    () => deadline.abort(),
    timeoutSeconds * 1_000,
  ) as unknown as NodeJS.Timeout;
  // Node keeps the process alive for a pending timer; a run's deadline should
  // not be a reason to stay up.
  timer.unref?.();

  let stepIndex = state.stepCount;
  let tokensSpent = state.totalTokens;
  let lastText = "";

  try {
    for (let step = 0; step < maxSteps; step++) {
      if (!(await renewAgentRunLease(claim)))
        throw new AgentRunLeaseLostError();
      if (await isCancelRequested(claim)) {
        await markCancelled(claim);
        await emitRunReport(claim);
        return {
          status: "CANCELLED",
          summary: lastText,
          stopReason: "cancelled",
        };
      }
      if (tokensSpent >= maxTokens) {
        return finishFailed(
          claim,
          "Token limit reached before the agent answered.",
        );
      }

      const startedAt = Date.now();
      const result = await llmService.chat(claim.workspaceId, caller, {
        system: system.text,
        messages,
        tools: toolset.map((tool) => tool.definition),
        maxTokens: Math.max(maxTokens - tokensSpent, 256),
        signal: deadline.signal,
        mockTurns,
      });

      if (!result.ok) {
        const retryable = isRetryable(result);
        await failRun(claim, { message: describe(result), retryable });
        // A retryable failure leaves the run PENDING, so there is nothing
        // final to report yet.
        if (!retryable) await emitRunReport(claim);
        return {
          status: "FAILED",
          summary: lastText,
          stopReason: retryable ? "rate_limit" : "error",
        };
      }

      const answer = result.data;
      tokensSpent += answer.usage.totalTokens;
      if (answer.text) lastText = answer.text;

      await appendStep(claim, {
        index: stepIndex++,
        kind: "MODEL_CALL",
        modelText: answer.text || null,
        stopReason: answer.stopReason,
        promptTokens: answer.usage.promptTokens,
        completionTokens: answer.usage.completionTokens,
        durationMs: Date.now() - startedAt,
      });

      if (answer.stopReason !== "tool_calls" || answer.toolCalls.length === 0) {
        await completeRun(claim, {
          summary: lastText,
          stopReason: answer.stopReason,
        });
        await emitRunReport(claim);
        return {
          status: "SUCCEEDED",
          summary: lastText,
          stopReason: answer.stopReason,
        };
      }

      messages.push({
        role: "assistant",
        content: answer.text,
        toolCalls: answer.toolCalls,
      });

      for (const call of answer.toolCalls) {
        const answered = await runToolCall(
          claim,
          call,
          toolsByName,
          toolContext,
          stepIndex++,
        );
        messages.push(answered);
      }
    }

    return finishFailed(
      claim,
      `Step limit reached (${maxSteps}) before the agent answered.`,
    );
  } finally {
    clearTimeout(timer);
  }
}

async function finishFailed(
  claim: ClaimedAgentRun,
  message: string,
): Promise<AgentRunOutcome> {
  // A ceiling is not transient: retrying spends the same budget to hit the same
  // wall, so this fails outright and stays visible.
  await failRun(claim, { message, retryable: false });
  await emitRunReport(claim);
  return { status: "FAILED", summary: "", stopReason: "limit" };
}

/**
 * Runs one tool call and returns the `tool` message that answers it. A bad
 * argument object or an unknown name comes back as an error message rather than
 * an exception: the model can correct itself on the next step, and killing the
 * whole run over one malformed call would waste everything before it.
 */
async function runToolCall(
  claim: ClaimedAgentRun,
  call: LlmToolCall,
  toolsByName: ReadonlyMap<string, AgentToolBinding>,
  toolContext: McpToolContext,
  index: number,
): Promise<LlmMessage> {
  const startedAt = Date.now();
  const tool = toolsByName.get(call.name);

  let args: unknown;
  let failure: string | null = null;
  try {
    args = call.arguments.trim() ? JSON.parse(call.arguments) : {};
  } catch {
    failure = `Arguments for ${call.name} are not valid JSON.`;
  }
  if (!tool && failure === null) {
    failure = `No tool named ${call.name} is available to this agent.`;
  }

  if (failure !== null || !tool) {
    const text = failure ?? "Tool unavailable.";
    await appendStep(claim, {
      index,
      kind: "TOOL_CALL",
      toolName: call.name,
      resultText: text,
      isError: true,
      durationMs: Date.now() - startedAt,
    });
    return {
      role: "tool",
      toolCallId: call.id,
      toolName: call.name,
      content: frameToolResult(call.name, text),
      isError: true,
    };
  }

  // `invoke` maps its own domain errors into an error result, so anything that
  // escapes it is genuinely unexpected — and still must not kill the run.
  let text: string;
  let isError: boolean;
  try {
    const result = await tool.invoke(args, toolContext);
    ({ text, isError } = toolResultToText(result));
  } catch (error) {
    text = error instanceof Error ? error.message : String(error);
    isError = true;
  }

  await appendStep(claim, {
    index,
    kind: "TOOL_CALL",
    toolName: tool.name,
    toolScope: tool.scope,
    argsJson: (args ?? {}) as never,
    resultText: text,
    isError,
    durationMs: Date.now() - startedAt,
  });

  return {
    role: "tool",
    toolCallId: call.id,
    toolName: tool.name,
    content: frameToolResult(tool.name, text),
    isError,
  };
}
