import type { ProviderResult } from "@/lib/providers/result";

export type HostingAccountStatus = "active" | "suspended" | "unknown";

// Normalized hosting account (website) across providers. Metric fields are
// nullable because not every provider exposes usage data (e.g. Hostinger's
// public API does not report disk/bandwidth for shared hosting).
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
  emailAccounts: number | null;
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
