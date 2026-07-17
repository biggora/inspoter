import type { ServerProvider } from "./types";
import { HetznerServerProvider } from "./hetzner";
import * as credentialsService from "@/lib/services/credentials";

// Providers are built exclusively from workspace ProviderCredential records
// (managed at /settings/providers). No env or mock fallback: a workspace
// without credentials gets an empty provider list.

export async function getServerProvidersForWorkspace(
  workspaceId: string,
): Promise<ServerProvider[]> {
  const allCreds = await credentialsService.getDecryptedCredentials(
    workspaceId,
    "HETZNER_CLOUD",
  );
  const providers: ServerProvider[] = [];

  for (const cred of allCreds) {
    if (cred.type === "HETZNER_CLOUD") {
      providers.push(
        new HetznerServerProvider(cred.id, cred.label, cred.apiToken),
      );
    }
  }

  return providers;
}
