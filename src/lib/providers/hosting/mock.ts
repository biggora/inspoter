import type { ProviderResult } from "@/lib/providers/result";
import type { HostingAccount, HostingProvider } from "./types";

const mockAccounts: HostingAccount[] = [
  {
    id: "acme",
    domain: "acme.example.com",
    user: "acme",
    plan: "business",
    status: "active",
    ip: "203.0.113.10",
    diskUsedMb: 5120,
    diskLimitMb: 20480,
    bandwidthUsedMb: 81920,
    bandwidthLimitMb: 512000,
    databases: 4,
    emailAccounts: 12,
    expiresAt: null,
    supportsSuspend: true,
  },
  {
    id: "blogco",
    domain: "blog.example.net",
    user: "blogco",
    plan: "starter",
    status: "suspended",
    ip: "203.0.113.11",
    diskUsedMb: 900,
    diskLimitMb: 5120,
    bandwidthUsedMb: 12000,
    bandwidthLimitMb: 102400,
    databases: 1,
    emailAccounts: 3,
    expiresAt: null,
    supportsSuspend: true,
  },
];

const statusOverrides = new Map<string, HostingAccount["status"]>();

function resolve(account: HostingAccount): HostingAccount {
  const override = statusOverrides.get(account.id);
  return override ? { ...account, status: override } : account;
}

export class MockHostingProvider implements HostingProvider {
  readonly mode = "mock" as const;
  readonly id: string;
  readonly providerType: string;
  readonly label: string;

  constructor(id: string, providerType: string, label: string) {
    this.id = id;
    this.providerType = providerType;
    this.label = label;
  }

  async listAccounts(): Promise<ProviderResult<HostingAccount[]>> {
    return { ok: true, data: mockAccounts.map(resolve) };
  }

  async getAccount(id: string): Promise<ProviderResult<HostingAccount>> {
    const account = mockAccounts.find((a) => a.id === id);
    if (!account) {
      return { ok: false, kind: "error", message: "Account not found" };
    }
    return { ok: true, data: resolve(account) };
  }

  async setSuspended(
    id: string,
    suspended: boolean,
  ): Promise<ProviderResult<void>> {
    const account = mockAccounts.find((a) => a.id === id);
    if (!account) {
      return { ok: false, kind: "error", message: "Account not found" };
    }
    statusOverrides.set(id, suspended ? "suspended" : "active");
    return { ok: true, data: undefined };
  }
}
