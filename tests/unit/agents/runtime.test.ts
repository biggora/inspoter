import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CallToolResult } from "@modelcontextprotocol/server";
import type {
  LlmChatCompletion,
  LlmChatRequest,
  LlmResult,
} from "@/lib/llm/contract";

// The loop itself, with the model, the toolset and the run row all faked. What
// is being asserted is the branching: when the run stops, what it records, and
// which failures it survives.

vi.mock("@/lib/config/env", () => ({
  env: {
    AGENT_RUN_MAX_STEPS_CEILING: 24,
    AGENT_RUN_MAX_TOKENS_CEILING: 200_000,
    AGENT_RUN_MAX_TIMEOUT_SECONDS: 1_800,
    AGENT_TOOL_RESULT_MAX_CHARS: 6_000,
    AGENT_STEP_PAYLOAD_MAX_CHARS: 4_000,
  },
}));

// vi.hoisted so the doubles exist before the hoisted vi.mock factories run,
// and so each keeps its own argument types — a `(...args: unknown[])` shim
// would erase them and leave `mock.calls` untyped.
const { chat, invoke, runsService } = vi.hoisted(() => ({
  chat: vi.fn<(...args: unknown[]) => unknown>(),
  invoke: vi.fn<(args: unknown, ctx: unknown) => unknown>(),
  runsService: {
    loadRunState: vi.fn<(claim: unknown) => unknown>(),
    renewAgentRunLease: vi.fn<(claim: unknown) => Promise<boolean>>(),
    isCancelRequested: vi.fn<(claim: unknown) => Promise<boolean>>(),
    appendStep: vi.fn<
      (
        claim: unknown,
        step: {
          index: number;
          kind: string;
          isError?: boolean;
          resultText?: string | null;
        },
      ) => Promise<void>
    >(),
    completeRun: vi.fn<(claim: unknown, outcome: unknown) => Promise<void>>(),
    failRun: vi.fn<(claim: unknown, error: unknown) => Promise<void>>(),
    markCancelled: vi.fn<(claim: unknown) => Promise<void>>(),
    emitRunReport: vi.fn<(claim: unknown) => Promise<void>>(),
  },
}));

const finalizeExecutiveBriefGenerationForRun = vi.hoisted(() =>
  vi.fn<
    (
      workspaceId: string,
      sourceRunId: string,
      outcome: "FAILED" | "CANCELLED" | "UNPUBLISHED",
    ) => Promise<void>
  >(),
);

vi.mock("@/lib/services/llm", () => ({ chat }));

vi.mock("@/lib/services/executive-briefs", () => ({
  finalizeExecutiveBriefGenerationForRun,
}));

vi.mock("@/lib/agents/tools", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/agents/tools")>(
      "@/lib/agents/tools",
    );
  return {
    ...actual,
    buildAgentToolset: () => [
      {
        name: "logs_search",
        scope: "logs:read",
        readOnly: true,
        definition: {
          name: "logs_search",
          description: "Search logs",
          inputSchema: { type: "object" },
        },
        invoke,
      },
    ],
  };
});

vi.mock("@/lib/services/agent-runs", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/services/agent-runs")
  >("@/lib/services/agent-runs");
  return {
    AgentRunLeaseLostError: actual.AgentRunLeaseLostError,
    ...runsService,
  };
});

const { executeAgentRun } = await import("@/lib/agents/runtime");

const CLAIM = {
  id: "run-1",
  workspaceId: "workspace-1",
  leaseToken: "lease-1",
};

function state(overrides: Record<string, unknown> = {}) {
  return {
    input: "check the logs",
    agentName: "Night watch",
    instructions: "Summarize what broke overnight.",
    scopes: ["logs:read"],
    skills: [],
    maxSteps: 4,
    maxTokens: 20_000,
    timeoutSeconds: 60,
    stepCount: 0,
    totalTokens: 0,
    cancelRequestedAt: null,
    ...overrides,
  };
}

function answer(
  partial: Partial<LlmChatCompletion>,
): LlmResult<LlmChatCompletion> {
  return {
    ok: true,
    data: {
      text: "",
      toolCalls: [],
      stopReason: "stop",
      model: "mock",
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      ...partial,
    },
  };
}

function textResult(text: string): CallToolResult {
  return { content: [{ type: "text", text }] };
}

// The single TOOL_CALL step a test appended, asserted to exist so the
// assertions below read as claims rather than optional chains.
function toolCallStep() {
  const step = runsService.appendStep.mock.calls
    .map(([, appended]) => appended)
    .find((appended) => appended.kind === "TOOL_CALL");
  if (!step) throw new Error("No TOOL_CALL step was appended.");
  return step;
}

beforeEach(() => {
  vi.clearAllMocks();
  finalizeExecutiveBriefGenerationForRun.mockResolvedValue(undefined);
  runsService.loadRunState.mockResolvedValue(state());
  runsService.renewAgentRunLease.mockResolvedValue(true);
  runsService.isCancelRequested.mockResolvedValue(false);
});

describe("executeAgentRun", () => {
  it("runs a tool, feeds the result back, and completes on the prose turn", async () => {
    chat
      .mockResolvedValueOnce(
        answer({
          stopReason: "tool_calls",
          toolCalls: [
            { id: "c1", name: "logs_search", arguments: '{"limit":5}' },
          ],
        }),
      )
      .mockResolvedValueOnce(
        answer({ text: "Nothing broke.", stopReason: "stop" }),
      );
    invoke.mockResolvedValue(textResult("[]"));

    const outcome = await executeAgentRun(CLAIM);

    expect(outcome).toEqual({
      status: "SUCCEEDED",
      summary: "Nothing broke.",
      stopReason: "stop",
    });
    expect(invoke).toHaveBeenCalledWith(
      { limit: 5 },
      expect.objectContaining({
        workspaceId: "workspace-1",
        tokenId: "agent:run-1",
        tokenName: "Night watch",
      }),
    );
    expect(runsService.completeRun).toHaveBeenCalledWith(CLAIM, {
      summary: "Nothing broke.",
      stopReason: "stop",
    });
    expect(finalizeExecutiveBriefGenerationForRun).toHaveBeenCalledWith(
      "workspace-1",
      "run-1",
      "UNPUBLISHED",
    );

    // Steps are MODEL_CALL, TOOL_CALL, MODEL_CALL, numbered from zero.
    const kinds = runsService.appendStep.mock.calls.map(
      ([, step]) => `${step.index}:${step.kind}`,
    );
    expect(kinds).toEqual(["0:MODEL_CALL", "1:TOOL_CALL", "2:MODEL_CALL"]);

    // The tool answer went back framed as untrusted data.
    const second = chat.mock.calls[1][2] as LlmChatRequest;
    const toolMessage = second.messages.find((m) => m.role === "tool");
    expect(toolMessage?.content).toContain("<<<TOOL_RESULT name=logs_search");
  });

  it("hands a malformed argument object back as a tool error instead of throwing", async () => {
    chat
      .mockResolvedValueOnce(
        answer({
          stopReason: "tool_calls",
          toolCalls: [
            { id: "c1", name: "logs_search", arguments: "{not json" },
          ],
        }),
      )
      .mockResolvedValueOnce(
        answer({ text: "Recovered.", stopReason: "stop" }),
      );

    const outcome = await executeAgentRun(CLAIM);

    expect(outcome.status).toBe("SUCCEEDED");
    expect(invoke).not.toHaveBeenCalled();
    const toolStep = toolCallStep();
    expect(toolStep).toMatchObject({ isError: true });
    expect(toolStep.resultText).toContain("not valid JSON");
  });

  it("hands an unknown tool name back as a tool error", async () => {
    chat
      .mockResolvedValueOnce(
        answer({
          stopReason: "tool_calls",
          toolCalls: [{ id: "c1", name: "mail_send", arguments: "{}" }],
        }),
      )
      .mockResolvedValueOnce(
        answer({ text: "Recovered.", stopReason: "stop" }),
      );

    await executeAgentRun(CLAIM);

    const toolStep = toolCallStep();
    expect(toolStep.resultText).toContain("No tool named mail_send");
  });

  it("survives a tool that throws", async () => {
    chat
      .mockResolvedValueOnce(
        answer({
          stopReason: "tool_calls",
          toolCalls: [{ id: "c1", name: "logs_search", arguments: "{}" }],
        }),
      )
      .mockResolvedValueOnce(
        answer({ text: "Recovered.", stopReason: "stop" }),
      );
    invoke.mockRejectedValue(new Error("database on fire"));

    const outcome = await executeAgentRun(CLAIM);

    expect(outcome.status).toBe("SUCCEEDED");
    const toolStep = toolCallStep();
    expect(toolStep).toMatchObject({ isError: true });
    expect(toolStep.resultText).toContain("database on fire");
  });

  it("fails the run when the step ceiling is reached", async () => {
    runsService.loadRunState.mockResolvedValue(state({ maxSteps: 2 }));
    chat.mockResolvedValue(
      answer({
        stopReason: "tool_calls",
        toolCalls: [{ id: "c1", name: "logs_search", arguments: "{}" }],
      }),
    );
    invoke.mockResolvedValue(textResult("[]"));

    const outcome = await executeAgentRun(CLAIM);

    expect(outcome).toMatchObject({ status: "FAILED", stopReason: "limit" });
    expect(chat).toHaveBeenCalledTimes(2);
    expect(runsService.failRun).toHaveBeenCalledWith(CLAIM, {
      message: expect.stringContaining("Step limit reached (2)"),
      retryable: false,
    });
    expect(finalizeExecutiveBriefGenerationForRun).toHaveBeenCalledWith(
      "workspace-1",
      "run-1",
      "FAILED",
    );
  });

  it("fails the run when the token ceiling is reached", async () => {
    runsService.loadRunState.mockResolvedValue(state({ maxTokens: 1_000 }));
    chat.mockResolvedValue(
      answer({
        stopReason: "tool_calls",
        toolCalls: [{ id: "c1", name: "logs_search", arguments: "{}" }],
        usage: { promptTokens: 900, completionTokens: 200, totalTokens: 1_100 },
      }),
    );
    invoke.mockResolvedValue(textResult("[]"));

    const outcome = await executeAgentRun(CLAIM);

    expect(outcome).toMatchObject({ status: "FAILED" });
    expect(runsService.failRun).toHaveBeenCalledWith(CLAIM, {
      message: expect.stringContaining("Token limit"),
      retryable: false,
    });
    expect(finalizeExecutiveBriefGenerationForRun).toHaveBeenCalledWith(
      "workspace-1",
      "run-1",
      "FAILED",
    );
  });

  it("retries a rate-limited run instead of failing it outright", async () => {
    chat.mockResolvedValue({
      ok: false,
      kind: "error",
      category: "rate_limit",
      message: "too many calls",
    });

    const outcome = await executeAgentRun(CLAIM);

    expect(outcome).toMatchObject({
      status: "FAILED",
      stopReason: "rate_limit",
    });
    expect(runsService.failRun).toHaveBeenCalledWith(CLAIM, {
      message: expect.stringContaining("rate_limit"),
      retryable: true,
    });
    expect(finalizeExecutiveBriefGenerationForRun).not.toHaveBeenCalled();
  });

  it("does not retry a run whose workspace has no provider", async () => {
    chat.mockResolvedValue({
      ok: false,
      kind: "unsupported",
      operation: "chat",
    });

    await executeAgentRun(CLAIM);

    expect(runsService.failRun).toHaveBeenCalledWith(CLAIM, {
      message: "No AI provider is configured for this workspace.",
      retryable: false,
    });
    expect(finalizeExecutiveBriefGenerationForRun).toHaveBeenCalledWith(
      "workspace-1",
      "run-1",
      "FAILED",
    );
  });

  it("stops at the step boundary when the operator cancelled it", async () => {
    runsService.isCancelRequested.mockResolvedValue(true);

    const outcome = await executeAgentRun(CLAIM);

    expect(outcome.status).toBe("CANCELLED");
    expect(chat).not.toHaveBeenCalled();
    expect(runsService.markCancelled).toHaveBeenCalledWith(CLAIM);
    expect(finalizeExecutiveBriefGenerationForRun).toHaveBeenCalledWith(
      "workspace-1",
      "run-1",
      "CANCELLED",
    );
  });

  it("aborts when another worker took the lease", async () => {
    runsService.renewAgentRunLease.mockResolvedValue(false);

    await expect(executeAgentRun(CLAIM)).rejects.toThrow("lease lost");
    expect(chat).not.toHaveBeenCalled();
    expect(finalizeExecutiveBriefGenerationForRun).not.toHaveBeenCalled();
  });
});
