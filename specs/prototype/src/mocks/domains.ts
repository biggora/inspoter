export type DomainProvider = 'Cloudflare' | 'Hetzner' | 'GoDaddy';
export type DomainStatus = 'active' | 'pending' | 'expired' | 'transferred';

export interface Domain {
  id: string;
  name: string;
  provider: DomainProvider;
  status: DomainStatus;
  registrar: string;
  expiresAt: string;
  createdAt: string;
  nameservers: string[];
  autoRenew: boolean;
}

export type DnsRecordType = 'A' | 'AAAA' | 'CNAME' | 'MX' | 'TXT' | 'NS' | 'SRV';

export interface DnsRecord {
  id: string;
  type: DnsRecordType;
  name: string;
  value: string;
  ttl: number;
  priority?: number;
}

export const mockDomains: Domain[] = [
  {
    id: 'dom-01',
    name: 'inspot.app',
    provider: 'Cloudflare',
    status: 'active',
    registrar: 'Cloudflare',
    expiresAt: '2027-04-15',
    createdAt: '2024-04-15',
    nameservers: ['alice.ns.cloudflare.com', 'bob.ns.cloudflare.com'],
    autoRenew: true,
  },
  {
    id: 'dom-02',
    name: 'inspot.io',
    provider: 'Cloudflare',
    status: 'active',
    registrar: 'Namecheap',
    expiresAt: '2027-01-22',
    createdAt: '2023-01-22',
    nameservers: ['alice.ns.cloudflare.com', 'bob.ns.cloudflare.com'],
    autoRenew: true,
  },
  {
    id: 'dom-03',
    name: 'inspot.dev',
    provider: 'Cloudflare',
    status: 'active',
    registrar: 'Cloudflare',
    expiresAt: '2026-11-03',
    createdAt: '2023-11-03',
    nameservers: ['alice.ns.cloudflare.com', 'bob.ns.cloudflare.com'],
    autoRenew: false,
  },
  {
    id: 'dom-04',
    name: 'monitoring-tool.com',
    provider: 'Cloudflare',
    status: 'pending',
    registrar: 'Namecheap',
    expiresAt: '2027-08-30',
    createdAt: '2025-08-30',
    nameservers: ['alice.ns.cloudflare.com', 'bob.ns.cloudflare.com'],
    autoRenew: true,
  },
  {
    id: 'dom-05',
    name: 'api-gateway.net',
    provider: 'Hetzner',
    status: 'active',
    registrar: 'Hetzner',
    expiresAt: '2027-06-10',
    createdAt: '2024-06-10',
    nameservers: ['helium.ns.hetzner.de', 'oxygen.ns.hetzner.com', 'hydrogen.ns.hetzner.de'],
    autoRenew: true,
  },
  {
    id: 'dom-06',
    name: 'cdn-delivery.net',
    provider: 'Hetzner',
    status: 'active',
    registrar: 'Hetzner',
    expiresAt: '2028-02-17',
    createdAt: '2025-02-17',
    nameservers: ['helium.ns.hetzner.de', 'oxygen.ns.hetzner.com', 'hydrogen.ns.hetzner.de'],
    autoRenew: true,
  },
  {
    id: 'dom-07',
    name: 'old-project.org',
    provider: 'Hetzner',
    status: 'expired',
    registrar: 'Hetzner',
    expiresAt: '2026-03-01',
    createdAt: '2020-03-01',
    nameservers: ['helium.ns.hetzner.de', 'oxygen.ns.hetzner.com', 'hydrogen.ns.hetzner.de'],
    autoRenew: false,
  },
  {
    id: 'dom-08',
    name: 'brand-site.com',
    provider: 'GoDaddy',
    status: 'active',
    registrar: 'GoDaddy',
    expiresAt: '2027-09-25',
    createdAt: '2019-09-25',
    nameservers: ['ns05.domaincontrol.com', 'ns06.domaincontrol.com'],
    autoRenew: true,
  },
  {
    id: 'dom-09',
    name: 'landing-pages.co',
    provider: 'GoDaddy',
    status: 'transferred',
    registrar: 'GoDaddy',
    expiresAt: '2027-05-08',
    createdAt: '2021-05-08',
    nameservers: ['ns05.domaincontrol.com', 'ns06.domaincontrol.com'],
    autoRenew: false,
  },
];

export const mockDnsRecords: Record<string, DnsRecord[]> = {
  'dom-01': [
    { id: 'dns-01-1', type: 'A', name: '@', value: '49.12.34.56', ttl: 300 },
    { id: 'dns-01-2', type: 'A', name: 'www', value: '49.12.34.56', ttl: 300 },
    { id: 'dns-01-3', type: 'AAAA', name: '@', value: '2a01:4f8:c17:1234::1', ttl: 300 },
    { id: 'dns-01-4', type: 'CNAME', name: 'mail', value: 'mail.inspot.app', ttl: 3600 },
    { id: 'dns-01-5', type: 'MX', name: '@', value: 'aspmx.l.google.com', ttl: 3600, priority: 1 },
    { id: 'dns-01-6', type: 'MX', name: '@', value: 'alt1.aspmx.l.google.com', ttl: 3600, priority: 5 },
    { id: 'dns-01-7', type: 'TXT', name: '@', value: 'v=spf1 include:_spf.google.com ~all', ttl: 3600 },
    { id: 'dns-01-8', type: 'TXT', name: '_dmarc', value: 'v=DMARC1; p=quarantine; rua=mailto:dmarc@inspot.app', ttl: 3600 },
    { id: 'dns-01-9', type: 'NS', name: '@', value: 'alice.ns.cloudflare.com', ttl: 86400 },
    { id: 'dns-01-10', type: 'NS', name: '@', value: 'bob.ns.cloudflare.com', ttl: 86400 },
  ],
  'dom-02': [
    { id: 'dns-02-1', type: 'A', name: '@', value: '49.12.34.78', ttl: 300 },
    { id: 'dns-02-2', type: 'A', name: 'www', value: '49.12.34.78', ttl: 300 },
    { id: 'dns-02-3', type: 'CNAME', name: 'docs', value: 'docs.inspot.io', ttl: 3600 },
    { id: 'dns-02-4', type: 'MX', name: '@', value: 'aspmx.l.google.com', ttl: 3600, priority: 1 },
    { id: 'dns-02-5', type: 'TXT', name: '@', value: 'v=spf1 include:_spf.google.com ~all', ttl: 3600 },
    { id: 'dns-02-6', type: 'TXT', name: 'google-site-verification', value: 'google-site-verification=abc123xyz', ttl: 3600 },
  ],
  'dom-03': [
    { id: 'dns-03-1', type: 'A', name: '@', value: '78.46.12.34', ttl: 300 },
    { id: 'dns-03-2', type: 'CNAME', name: 'api', value: 'api.inspot.dev', ttl: 3600 },
    { id: 'dns-03-3', type: 'TXT', name: '@', value: 'v=spf1 -all', ttl: 3600 },
  ],
  'dom-04': [
    { id: 'dns-04-1', type: 'A', name: '@', value: '116.203.45.67', ttl: 300 },
    { id: 'dns-04-2', type: 'CNAME', name: 'www', value: 'monitoring-tool.com', ttl: 3600 },
  ],
  'dom-05': [
    { id: 'dns-05-1', type: 'A', name: '@', value: '78.46.12.90', ttl: 300 },
    { id: 'dns-05-2', type: 'A', name: 'api', value: '78.46.12.91', ttl: 300 },
    { id: 'dns-05-3', type: 'AAAA', name: '@', value: '2a01:4f8:c17:5678::1', ttl: 300 },
    { id: 'dns-05-4', type: 'CNAME', name: 'lb', value: 'lb.api-gateway.net', ttl: 3600 },
    { id: 'dns-05-5', type: 'MX', name: '@', value: 'mail.api-gateway.net', ttl: 3600, priority: 10 },
    { id: 'dns-05-6', type: 'TXT', name: '@', value: 'v=spf1 mx ~all', ttl: 3600 },
    { id: 'dns-05-7', type: 'NS', name: '@', value: 'helium.ns.hetzner.de', ttl: 86400 },
    { id: 'dns-05-8', type: 'NS', name: '@', value: 'oxygen.ns.hetzner.com', ttl: 86400 },
  ],
  'dom-06': [
    { id: 'dns-06-1', type: 'A', name: '@', value: '116.203.45.10', ttl: 300 },
    { id: 'dns-06-2', type: 'A', name: 'edge', value: '116.203.45.11', ttl: 300 },
    { id: 'dns-06-3', type: 'CNAME', name: 'www', value: 'cdn-delivery.net', ttl: 3600 },
    { id: 'dns-06-4', type: 'TXT', name: '@', value: 'v=spf1 -all', ttl: 3600 },
  ],
  'dom-07': [
    { id: 'dns-07-1', type: 'A', name: '@', value: '49.12.99.10', ttl: 300 },
    { id: 'dns-07-2', type: 'MX', name: '@', value: 'mail.old-project.org', ttl: 3600, priority: 10 },
  ],
  'dom-08': [
    { id: 'dns-08-1', type: 'A', name: '@', value: '160.153.45.20', ttl: 600 },
    { id: 'dns-08-2', type: 'CNAME', name: 'www', value: 'brand-site.com', ttl: 3600 },
    { id: 'dns-08-3', type: 'CNAME', name: 'shop', value: 'shop.brand-site.com', ttl: 3600 },
    { id: 'dns-08-4', type: 'MX', name: '@', value: 'smtp.secureserver.net', ttl: 3600, priority: 0 },
    { id: 'dns-08-5', type: 'MX', name: '@', value: 'mailstore1.secureserver.net', ttl: 3600, priority: 10 },
    { id: 'dns-08-6', type: 'TXT', name: '@', value: 'v=spf1 include:secureserver.net ~all', ttl: 3600 },
  ],
  'dom-09': [
    { id: 'dns-09-1', type: 'A', name: '@', value: '160.153.45.30', ttl: 600 },
    { id: 'dns-09-2', type: 'CNAME', name: 'www', value: 'landing-pages.co', ttl: 3600 },
  ],
};