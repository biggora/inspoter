import type { DnsProvider } from "@/lib/providers/dns/types";
import { MockDnsProvider } from "@/lib/providers/dns/mock";
import { CloudflareDnsProvider } from "@/lib/providers/dns/cloudflare";
import { HetznerDnsProvider } from "@/lib/providers/dns/hetzner";
import { GoDaddyDnsProvider } from "@/lib/providers/dns/godaddy";

// Real-vs-mock selection by env presence, no code change to switch modes
// (AC-PROV-002, architecture.md §4.2).

export function getDnsProviders(): DnsProvider[] {
  return [
    process.env.CLOUDFLARE_API_TOKEN
      ? new CloudflareDnsProvider(process.env.CLOUDFLARE_API_TOKEN)
      : new MockDnsProvider("cloudflare"),
    process.env.HETZNER_DNS_TOKEN
      ? new HetznerDnsProvider()
      : new MockDnsProvider("hetzner"),
    process.env.GODADDY_API_KEY
      ? new GoDaddyDnsProvider()
      : new MockDnsProvider("godaddy"),
  ];
}
