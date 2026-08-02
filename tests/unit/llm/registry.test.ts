import { afterEach, describe, expect, it, vi } from "vitest";
import { getLlmProviderForWorkspace } from "@/lib/llm/registry";
import { MockLlmProvider } from "@/lib/llm/mock";
import { OpenAiCompatibleLlmProvider } from "@/lib/llm/openai";
import * as credentialsService from "@/lib/services/credentials";

// The LLM driver comes exclusively from the workspace's OPENAI_COMPATIBLE
// credential: no env fallback, no default endpoint, and no driver at all when
// the workspace has not configured one.

vi.mock("@/lib/services/credentials", () => ({
  getDecryptedCredentials: vi.fn(async () => []),
}));

const getDecryptedCredentials = vi.mocked(
  credentialsService.getDecryptedCredentials,
);

const WORKSPACE_ID = "test-workspace";

const REAL_CREDENTIAL = {
  id: "cred-llm",
  label: "Local Ollama",
  type: "OPENAI_COMPATIBLE" as const,
  baseUrl: "http://127.0.0.1:11434/v1",
  model: "llama3.1",
  apiKey: "secret",
  mode: "REAL" as const,
};

afterEach(() => {
  getDecryptedCredentials.mockReset();
  getDecryptedCredentials.mockResolvedValue([]);
});

describe("getLlmProviderForWorkspace()", () => {
  it("returns null when the workspace has no LLM credential", async () => {
    expect(await getLlmProviderForWorkspace(WORKSPACE_ID)).toBeNull();
    expect(getDecryptedCredentials).toHaveBeenCalledWith(
      WORKSPACE_ID,
      "OPENAI_COMPATIBLE",
    );
  });

  it("builds the real driver from the credential", async () => {
    getDecryptedCredentials.mockResolvedValue([REAL_CREDENTIAL]);

    const provider = await getLlmProviderForWorkspace(WORKSPACE_ID);

    expect(provider).toBeInstanceOf(OpenAiCompatibleLlmProvider);
    expect(provider).toMatchObject({
      id: "cred-llm",
      label: "Local Ollama",
      model: "llama3.1",
      mode: "real",
    });
  });

  it("builds the deterministic mock driver for a MOCK credential", async () => {
    getDecryptedCredentials.mockResolvedValue([
      { ...REAL_CREDENTIAL, mode: "MOCK" },
    ]);

    const provider = await getLlmProviderForWorkspace(WORKSPACE_ID);

    expect(provider).toBeInstanceOf(MockLlmProvider);
    expect(provider?.mode).toBe("mock");
  });

  it("uses the oldest credential when several are configured", async () => {
    getDecryptedCredentials.mockResolvedValue([
      REAL_CREDENTIAL,
      { ...REAL_CREDENTIAL, id: "cred-llm-2", label: "OpenRouter" },
    ]);

    const provider = await getLlmProviderForWorkspace(WORKSPACE_ID);

    expect(provider?.id).toBe("cred-llm");
  });
});
