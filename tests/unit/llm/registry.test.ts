import { afterEach, describe, expect, it, vi } from "vitest";
import { getLlmProviderForWorkspace } from "@/lib/llm/registry";
import { AnthropicCompatibleLlmProvider } from "@/lib/llm/anthropic";
import { MockLlmProvider } from "@/lib/llm/mock";
import { OpenAiCompatibleLlmProvider } from "@/lib/llm/openai";
import * as credentialsService from "@/lib/services/credentials";

// The LLM driver comes exclusively from the workspace's LLM credential: no env
// fallback, no default endpoint, and no driver at all when the workspace has
// not configured one. Which of several credentials answers is the operator's
// explicit choice, with the pre-flag oldest-wins rule as the fallback.

vi.mock("@/lib/services/credentials", () => ({
  getDecryptedCredentials: vi.fn(async () => []),
}));

const getDecryptedCredentials = vi.mocked(
  credentialsService.getDecryptedCredentials,
);

const WORKSPACE_ID = "test-workspace";

const OPENAI_CREDENTIAL = {
  id: "cred-llm",
  label: "Local Ollama",
  type: "OPENAI_COMPATIBLE" as const,
  baseUrl: "http://127.0.0.1:11434/v1",
  model: "llama3.1",
  apiKey: "secret",
  mode: "REAL" as const,
  isDefault: false,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
};

const ANTHROPIC_CREDENTIAL = {
  id: "cred-glm",
  label: "GLM",
  type: "ANTHROPIC_COMPATIBLE" as const,
  baseUrl: "https://api.z.ai/api/anthropic",
  model: "glm-4.6",
  apiKey: "secret",
  mode: "REAL" as const,
  isDefault: false,
  createdAt: new Date("2026-02-01T00:00:00.000Z"),
};

afterEach(() => {
  getDecryptedCredentials.mockReset();
  getDecryptedCredentials.mockResolvedValue([]);
});

describe("getLlmProviderForWorkspace()", () => {
  it("returns null when the workspace has no LLM credential", async () => {
    expect(await getLlmProviderForWorkspace(WORKSPACE_ID)).toBeNull();
    expect(getDecryptedCredentials).toHaveBeenCalledWith(WORKSPACE_ID, [
      "OPENAI_COMPATIBLE",
      "ANTHROPIC_COMPATIBLE",
    ]);
  });

  it("builds the OpenAI-compatible driver from the credential", async () => {
    getDecryptedCredentials.mockResolvedValue([OPENAI_CREDENTIAL]);

    const provider = await getLlmProviderForWorkspace(WORKSPACE_ID);

    expect(provider).toBeInstanceOf(OpenAiCompatibleLlmProvider);
    expect(provider).toMatchObject({
      id: "cred-llm",
      label: "Local Ollama",
      model: "llama3.1",
      mode: "real",
    });
  });

  it("builds the Anthropic-compatible driver from the credential", async () => {
    getDecryptedCredentials.mockResolvedValue([ANTHROPIC_CREDENTIAL]);

    const provider = await getLlmProviderForWorkspace(WORKSPACE_ID);

    expect(provider).toBeInstanceOf(AnthropicCompatibleLlmProvider);
    expect(provider).toMatchObject({
      id: "cred-glm",
      label: "GLM",
      model: "glm-4.6",
      mode: "real",
    });
  });

  it.each([
    ["OpenAI-compatible", OPENAI_CREDENTIAL],
    ["Anthropic-compatible", ANTHROPIC_CREDENTIAL],
  ])(
    "builds the deterministic mock driver for a MOCK %s credential",
    async (_name, credential) => {
      getDecryptedCredentials.mockResolvedValue([
        { ...credential, mode: "MOCK" },
      ]);

      const provider = await getLlmProviderForWorkspace(WORKSPACE_ID);

      expect(provider).toBeInstanceOf(MockLlmProvider);
      expect(provider?.mode).toBe("mock");
    },
  );

  it("uses the oldest credential when none is flagged as default", async () => {
    getDecryptedCredentials.mockResolvedValue([
      OPENAI_CREDENTIAL,
      ANTHROPIC_CREDENTIAL,
    ]);

    const provider = await getLlmProviderForWorkspace(WORKSPACE_ID);

    expect(provider?.id).toBe("cred-llm");
  });

  it("prefers the credential flagged as default over the oldest one", async () => {
    getDecryptedCredentials.mockResolvedValue([
      OPENAI_CREDENTIAL,
      { ...ANTHROPIC_CREDENTIAL, isDefault: true },
    ]);

    const provider = await getLlmProviderForWorkspace(WORKSPACE_ID);

    expect(provider).toBeInstanceOf(AnthropicCompatibleLlmProvider);
    expect(provider?.id).toBe("cred-glm");
  });

  it("ignores a default flag on a credential of another category", async () => {
    getDecryptedCredentials.mockResolvedValue([
      {
        id: "cred-dns",
        label: "Cloudflare",
        type: "CLOUDFLARE_DNS",
        apiToken: "secret",
        isDefault: true,
        createdAt: new Date("2025-01-01T00:00:00.000Z"),
      },
      OPENAI_CREDENTIAL,
    ]);

    const provider = await getLlmProviderForWorkspace(WORKSPACE_ID);

    expect(provider?.id).toBe("cred-llm");
  });
});
