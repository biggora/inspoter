import type { DnsProvider } from "@/lib/providers/dns/types";
import { MockDnsProvider } from "@/lib/providers/dns/mock";
import { CloudflareDnsProvider } from "@/lib/providers/dns/cloudflare";
import { HetznerDnsProvider } from "@/lib/providers/dns/hetzner";
import { GoDaddyDnsProvider } from "@/lib/providers/dns/godaddy";
import * as credentialsService from "@/lib/services/credentials";

// Real-vs-mock selection by workspace credentials (multiple allowed per
// provider type), then env fallback (only when no workspace credential
// exists for that provider type), then a single mock as last resort
// (AC-PROV-002, architecture.md §4.2).

export async function getDnsProvidersForWorkspace(
  workspaceId: string,
): Promise<DnsProvider[]> {
  const allCreds = await credentialsService.getDecryptedCredentials(workspaceId);
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
        new GoDaddyDnsProvider(cred.id, cred.label, cred.apiKey, cred.apiSecret),
      );
    }
  }

  const hasCloudflare = allCreds.some((c) => c.type === "CLOUDFLARE_DNS");
  if (!hasCloudflare && process.env.CLOUDFLARE_API_TOKEN) {
    providers.push(
      new CloudflareDnsProvider(
        "env-cloudflare",
        "Cloudflare (env)",
        process.env.CLOUDFLARE_API_TOKEN,
      ),
    );
  }

  const hasHetznerDns = allCreds.some((c) => c.type === "HETZNER_DNS");
  if (!hasHetznerDns && process.env.HETZNER_DNS_TOKEN) {
    providers.push(
      new HetznerDnsProvider(
        "env-hetzner",
        "Hetzner DNS (env)",
        process.env.HETZNER_DNS_TOKEN,
      ),
    );
  }

  const hasGoDaddy = allCreds.some((c) => c.type === "GODADDY_DNS");
  if (
    !hasGoDaddy &&
    process.env.GODADDY_API_KEY &&
    process.env.GODADDY_API_SECRET
  ) {
    providers.push(
      new GoDaddyDnsProvider(
        "env-godaddy",
        "GoDaddy (env)",
        process.env.GODADDY_API_KEY,
        process.env.GODADDY_API_SECRET,
      ),
    );
  }

  if (!providers.length) {
    providers.push(
      new MockDnsProvider("mock-cloudflare", "cloudflare", "Cloudflare Mock"),
      new MockDnsProvider("mock-hetzner", "hetzner", "Hetzner DNS Mock"),
      new MockDnsProvider("mock-godaddy", "godaddy", "GoDaddy Mock"),
    );
  }

  return providers;
}
