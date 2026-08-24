import { afterEach, describe, expect, it, vi } from "vitest";
import * as llmService from "@/lib/services/llm";
import * as activityService from "@/lib/services/activity";
import * as credentialsService from "@/lib/services/credentials";

// The service is the only sanctioned entry point for a model call: it turns
// "no credential" into `unsupported`, enforces the per-workspace window, and
// journals every call that reached a model.

vi.mock("@/lib/services/credentials", () => ({
  getDecryptedCredentials: vi.fn(async () => []),
}));
vi.mock("@/lib/services/activity", () => ({
  recordActivity: vi.fn(async () => {}),
}));
vi.mock("@/lib/config/env", () => ({
  env: { LLM_CALL_RATE_LIMIT: 2, LLM_CALL_RATE_WINDOW_MS: 60_000 },
}));

const getDecryptedCredentials = vi.mocked(
  credentialsService.getDecryptedCredentials,
);
const recordActivity = vi.mocked(activityService.recordActivity);

const CALLER = { operatorId: "op-1", operatorName: "operator" };

// Each test uses its own workspace id: the rate-limit window is process-local
// module state that intentionally outlives a single test.
let workspaceCounter = 0;
function nextWorkspaceId(): string {
  workspaceCounter += 1;
  return `workspace-${workspaceCounter}`;
}

function useMockCredential() {
  getDecryptedCredentials.mockResolvedValue([
    {
      id: "cred-llm",
      label: "Local model",
      type: "OPENAI_COMPATIBLE",
      baseUrl: "http://127.0.0.1:11434/v1",
      model: "llama3.1",
      apiKey: "secret",
      mode: "MOCK",
      isDefault: false,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    },
  ]);
}

afterEach(() => {
  getDecryptedCredentials.mockReset();
  getDecryptedCredentials.mockResolvedValue([]);
  recordActivity.mockClear();
});

describe("llm service without a credential", () => {
  it("reports the operation as unsupported and journals nothing", async () => {
    const result = await llmService.complete(nextWorkspaceId(), CALLER, {
      prompt: "hi",
    });

    expect(result).toEqual({
      ok: false,
      kind: "unsupported",
      operation: "complete",
    });
    expect(recordActivity).not.toHaveBeenCalled();
  });
});

describe("llm service audit trail", () => {
  it("records the model, the token count and the driver mode", async () => {
    useMockCredential();
    const workspaceId = nextWorkspaceId();

    const result = await llmService.complete(workspaceId, CALLER, {
      prompt: "summarize this",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(recordActivity).toHaveBeenCalledTimes(1);

    const [auditedWorkspaceId, entry] = recordActivity.mock.calls[0];
    expect(auditedWorkspaceId).toBe(workspaceId);
    expect(entry).toMatchObject({
      operatorId: "op-1",
      action: "llm_complete",
      entityType: "llm_provider",
      entityId: "cred-llm",
      entityLabel: "Local model",
    });
    expect(JSON.parse(entry.details as string)).toEqual({
      mode: "mock",
      model: "llama3.1",
      tokens: result.data.usage.totalTokens,
    });
  });

  it("journals embed calls under their own action", async () => {
    useMockCredential();

    await llmService.embed(nextWorkspaceId(), CALLER, { input: ["alpha"] });

    expect(recordActivity.mock.calls[0][1].action).toBe("llm_embed");
  });
});

describe("llm service rate limit", () => {
  it("refuses further calls once the window is exhausted", async () => {
    useMockCredential();
    const workspaceId = nextWorkspaceId();

    await llmService.complete(workspaceId, CALLER, { prompt: "one" });
    await llmService.complete(workspaceId, CALLER, { prompt: "two" });
    const third = await llmService.complete(workspaceId, CALLER, {
      prompt: "three",
    });

    expect(third).toMatchObject({
      ok: false,
      kind: "error",
      category: "rate_limit",
    });
    // The refused call never reached a model, so it is not journaled.
    expect(recordActivity).toHaveBeenCalledTimes(2);
  });

  it("counts each workspace separately", async () => {
    useMockCredential();
    const first = nextWorkspaceId();
    const second = nextWorkspaceId();

    await llmService.complete(first, CALLER, { prompt: "one" });
    await llmService.complete(first, CALLER, { prompt: "two" });
    const other = await llmService.complete(second, CALLER, { prompt: "one" });

    expect(other.ok).toBe(true);
  });
});
