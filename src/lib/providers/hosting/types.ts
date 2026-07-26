import type { ProviderResult } from "@/lib/providers/result";

export type HostingAccountStatus = "active" | "suspended" | "unknown";

// Normalized hosting account (website) across providers. Metric fields are
// nullable because not every provider exposes usage data: Hostinger's public
// API has no filesystem quota, no bandwidth, and no account IP for shared
// hosting anywhere in its specification, while cPanel reports those but not
// the plan's expiry, PHP version, or WordPress core.
export interface HostingAccount {
  id: string; // cPanel username | Hostinger domain/subscription id
  domain: string; // primary domain / account name
  user: string; // cPanel username, "" for Hostinger
  plan: string; // package / plan / subscription name
  status: HostingAccountStatus;
  ip: string;
  diskUsedMb: number | null;
  diskLimitMb: number | null; // null = unlimited / unknown
  bandwidthUsedMb: number | null;
  bandwidthLimitMb: number | null;
  databases: number | null;
  databaseDiskUsedMb: number | null; // sum of the account's database sizes
  emailAccounts: number | null;
  emailAccountsLimit: number | null; // mailbox seats the plan pays for
  phpVersion: string | null;
  wordpressVersion: string | null;
  expiresAt: string | null; // ISO date, Hostinger subscription/domain
  supportsSuspend: boolean; // true only where the provider can suspend
}

export interface HostingProvider {
  readonly id: string;
  readonly providerType: string;
  readonly label: string;
  readonly mode: "real" | "mock";
  listAccounts(): Promise<ProviderResult<HostingAccount[]>>;
  getAccount(id: string): Promise<ProviderResult<HostingAccount>>;
  // Providers that cannot suspend return { ok:false, kind:"unsupported" }.
  setSuspended(id: string, suspended: boolean): Promise<ProviderResult<void>>;
}
