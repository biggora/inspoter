import type { LlmProvider } from "@/lib/llm/contract";
import { MockLlmProvider } from "@/lib/llm/mock";
import { OpenAiCompatibleLlmProvider } from "@/lib/llm/openai";
import * as credentialsService from "@/lib/services/credentials";

// The LLM driver is built exclusively from the active workspace's
// OPENAI_COMPATIBLE ProviderCredential (managed at /settings/providers),
// mirroring src/lib/providers/dns/index.ts. There is no env fallback and no
// default endpoint: a workspace without that credential gets null, and the
// whole LLM layer stays off — the same "no provider, empty state, no error"
// behavior the Domains and Hosting sections already have.
//
// Multiple credentials per provider type are allowed by the store, but a
// workspace has exactly one active model; the oldest credential wins, because
// getDecryptedCredentials orders by createdAt and an arbitrary winner would
// make the choice depend on row order.
export async function getLlmProviderForWorkspace(
  workspaceId: string,
): Promise<LlmProvider | null> {
  const credentials = await credentialsService.getDecryptedCredentials(
    workspaceId,
    "OPENAI_COMPATIBLE",
  );

  for (const credential of credentials) {
    if (credential.type !== "OPENAI_COMPATIBLE") continue;
    return credential.mode === "MOCK"
      ? new MockLlmProvider(credential.id, credential.label, credential.model)
      : new OpenAiCompatibleLlmProvider(
          credential.id,
          credential.label,
          credential.baseUrl,
          credential.model,
          credential.apiKey,
        );
  }

  return null;
}
