import type { LlmProvider } from "@/lib/llm/contract";
import { AnthropicCompatibleLlmProvider } from "@/lib/llm/anthropic";
import { MockLlmProvider } from "@/lib/llm/mock";
import { OpenAiCompatibleLlmProvider } from "@/lib/llm/openai";
import { LLM_PROVIDER_TYPES } from "@/lib/providers/registry";
import * as credentialsService from "@/lib/services/credentials";
import type { DecryptedCredential } from "@/lib/services/credentials";

// The LLM driver is built exclusively from the active workspace's LLM
// ProviderCredential (managed at /settings/providers), mirroring
// src/lib/providers/dns/index.ts. There is no env fallback and no default
// endpoint: a workspace without such a credential gets null, and the whole
// LLM layer stays off — the same "no provider, empty state, no error"
// behavior the Domains and Hosting sections already have.

type LlmCredential = Extract<
  DecryptedCredential,
  { type: "OPENAI_COMPATIBLE" | "ANTHROPIC_COMPATIBLE" }
>;

function isLlmCredential(
  credential: DecryptedCredential,
): credential is LlmCredential {
  return (
    credential.type === "OPENAI_COMPATIBLE" ||
    credential.type === "ANTHROPIC_COMPATIBLE"
  );
}

export async function getLlmProviderForWorkspace(
  workspaceId: string,
): Promise<LlmProvider | null> {
  const credentials = await credentialsService.getDecryptedCredentials(
    workspaceId,
    LLM_PROVIDER_TYPES,
  );
  const llmCredentials = credentials.filter(isLlmCredential);

  // A workspace has exactly one active model. The operator picks it with the
  // "default" flag at /settings/providers; with no flag set the oldest
  // credential wins, because getDecryptedCredentials orders by createdAt and
  // that was the behavior before the flag existed.
  const chosen =
    llmCredentials.find((credential) => credential.isDefault) ??
    llmCredentials[0];
  if (!chosen) return null;

  // MOCK is checked before the transport: the deterministic driver is a hard
  // requirement for the Playwright suite (architecture.md §7F.1) regardless of
  // which endpoint the credential names.
  if (chosen.mode === "MOCK") {
    return new MockLlmProvider(chosen.id, chosen.label, chosen.model);
  }

  return chosen.type === "ANTHROPIC_COMPATIBLE"
    ? new AnthropicCompatibleLlmProvider(
        chosen.id,
        chosen.label,
        chosen.baseUrl,
        chosen.model,
        chosen.apiKey,
      )
    : new OpenAiCompatibleLlmProvider(
        chosen.id,
        chosen.label,
        chosen.baseUrl,
        chosen.model,
        chosen.apiKey,
      );
}
