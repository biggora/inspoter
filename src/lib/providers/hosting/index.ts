import type { HostingProvider } from "./types";
import { HostingerProvider } from "./hostinger";
import { CpanelWhmProvider } from "./cpanel-whm";
import { CpanelUapiProvider } from "./cpanel-uapi";
import * as credentialsService from "@/lib/services/credentials";
import { HOSTING_PROVIDER_TYPES } from "@/lib/providers/registry";

// Providers are built exclusively from workspace ProviderCredential records
// (managed at /settings/providers). No env or mock fallback: a workspace
// without credentials gets an empty provider list. Mirrors
// src/lib/providers/servers/index.ts.

export async function getHostingProvidersForWorkspace(
  workspaceId: string,
): Promise<HostingProvider[]> {
  const providers: HostingProvider[] = [];

  for (const type of HOSTING_PROVIDER_TYPES) {
    // Skip Hetzner Cloud — it belongs to the Servers section, not Hosting.
    if (type === "HETZNER_CLOUD") continue;

    const creds = await credentialsService.getDecryptedCredentials(
      workspaceId,
      type,
    );

    for (const cred of creds) {
      if (cred.type === "HOSTINGER") {
        providers.push(
          new HostingerProvider(cred.id, cred.label, cred.apiToken),
        );
      } else if (cred.type === "CPANEL_WHM") {
        providers.push(
          new CpanelWhmProvider(
            cred.id,
            cred.label,
            cred.hostname,
            cred.username,
            cred.apiToken,
          ),
        );
      } else if (cred.type === "CPANEL_UAPI") {
        providers.push(
          new CpanelUapiProvider(
            cred.id,
            cred.label,
            cred.hostname,
            cred.username,
            cred.apiToken,
          ),
        );
      }
    }
  }

  return providers;
}
