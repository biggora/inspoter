import type { DnsProvider } from "@/lib/providers/dns/types";
import { CloudflareDnsProvider } from "@/lib/providers/dns/cloudflare";
import { HetznerDnsProvider } from "@/lib/providers/dns/hetzner";
import { GoDaddyDnsProvider } from "@/lib/providers/dns/godaddy";
import * as credentialsService from "@/lib/services/credentials";

// Providers are built exclusively from workspace ProviderCredential records
// (managed at /settings/providers). No env or mock fallback: a workspace
// without credentials gets an empty provider list.

export async function getDnsProvidersForWorkspace(
  workspaceId: string,
): Promise<DnsProvider[]> {
  const allCreds =
    await credentialsService.getDecryptedCredentials(workspaceId);
  const providers: DnsProvider[] = [];

  for (const cred of allCreds) {
    if (cred.type === "CLOUDFLARE_DNS") {
      providers.push(
        new CloudflareDnsProvider(cred.id, cred.label, cred.apiToken),
      );
    } else if (cred.type === "HETZNER_DNS") {
      providers.push(
        new HetznerDnsProvider(cred.id, cred.label, cred.apiToken),
      );
    } else if (cred.type === "GODADDY_DNS") {
      providers.push(
        new GoDaddyDnsProvider(
          cred.id,
          cred.label,
          cred.apiKey,
          cred.apiSecret,
        ),
      );
    }
  }

  return providers;
}
