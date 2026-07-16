import type { ServerProvider } from "./types";
import { HetznerServerProvider } from "./hetzner";
import { MockServerProvider } from "./mock";
import * as credentialsService from "@/lib/services/credentials";

// Real-vs-mock selection by workspace credentials (multiple allowed per
// provider type), then env fallback (only when no workspace credential
// exists), then a single mock as last resort.

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

  const envToken = process.env.HCLOUD_TOKEN || process.env.HETZNER_API_TOKEN;
  if (!allCreds.length && envToken) {
    providers.push(
      new HetznerServerProvider(
        "env-hetzner-cloud",
        "Hetzner Cloud (env)",
        envToken,
      ),
    );
  }

  if (!providers.length) {
    providers.push(
      new MockServerProvider(
        "mock-hetzner-cloud",
        "hetzner",
        "Hetzner Cloud Mock",
      ),
    );
  }

  return providers;
}
