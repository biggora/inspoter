import type { DnsProvider } from "@/lib/providers/dns/types";
import { MockDnsProvider } from "@/lib/providers/dns/mock";
import { CloudflareDnsProvider } from "@/lib/providers/dns/cloudflare";
import { HetznerDnsProvider } from "@/lib/providers/dns/hetzner";
import { GoDaddyDnsProvider } from "@/lib/providers/dns/godaddy";
import * as credentialsService from "@/lib/services/credentials";

// Real-vs-mock selection by workspace credential, then env presence, no code
// change to switch modes (AC-PROV-002, architecture.md §4.2).

export async function getDnsProvidersForWorkspace(
  workspaceId: string,
): Promise<DnsProvider[]> {
  let cfToken = process.env.CLOUDFLARE_API_TOKEN;
  const cfCred = await credentialsService.getDecryptedCredential(
    workspaceId,
    "CLOUDFLARE_DNS",
  );
  if (cfCred && cfCred.type === "CLOUDFLARE_DNS") cfToken = cfCred.apiToken;

  let hzToken = process.env.HETZNER_DNS_TOKEN;
  const hzCred = await credentialsService.getDecryptedCredential(
    workspaceId,
    "HETZNER_DNS",
  );
  if (hzCred && hzCred.type === "HETZNER_DNS") hzToken = hzCred.apiToken;

  let gdKey = process.env.GODADDY_API_KEY;
  let gdSecret = process.env.GODADDY_API_SECRET;
  const gdCred = await credentialsService.getDecryptedCredential(
    workspaceId,
    "GODADDY_DNS",
  );
  if (gdCred && gdCred.type === "GODADDY_DNS") {
    gdKey = gdCred.apiKey;
    gdSecret = gdCred.apiSecret;
  }

  return [
    cfToken ? new CloudflareDnsProvider(cfToken) : new MockDnsProvider("cloudflare"),
    hzToken ? new HetznerDnsProvider(hzToken) : new MockDnsProvider("hetzner"),
    gdKey && gdSecret
      ? new GoDaddyDnsProvider(gdKey, gdSecret)
      : new MockDnsProvider("godaddy"),
  ];
}
