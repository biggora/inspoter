import { createProviderHttpClient } from "@/lib/providers/http";
import type { ProviderResult } from "@/lib/providers/result";
import type {
  HostingAccount,
  HostingAccountStatus,
  HostingProvider,
} from "./types";

const BASE_URL = "https://developers.hostinger.com";

interface HostingerDomain {
  id?: number | string;
  domain?: string;
  name?: string;
  status?: string;
  type?: string;
  expires_at?: string | null;
}

function toStatus(status: string | undefined): HostingAccountStatus {
  const value = (status ?? "").toLowerCase();
  if (value === "active") return "active";
  if (value === "suspended" || value === "expired") return "suspended";
  return "unknown";
}

function toAccount(item: HostingerDomain): HostingAccount {
  const domain = item.domain ?? item.name ?? "";
  return {
    id: String(item.id ?? domain),
    domain,
    user: "",
    plan: item.type ?? "",
    status: toStatus(item.status),
    ip: "",
    diskUsedMb: null,
    diskLimitMb: null,
    bandwidthUsedMb: null,
    bandwidthLimitMb: null,
    databases: null,
    emailAccounts: null,
    expiresAt: item.expires_at ?? null,
    supportsSuspend: false,
  };
}

// Hostinger hosting accounts (websites) via the public API. The public API
// does not expose disk/bandwidth usage for shared hosting, so those metrics
// stay null. Read-only: suspend is not exposed, so setSuspended is
// "unsupported".
export class HostingerProvider implements HostingProvider {
  readonly id: string;
  readonly providerType = "hostinger";
  readonly label: string;
  readonly mode = "real" as const;
  private readonly client;

  constructor(id: string, label: string, apiToken: string) {
    this.id = id;
    this.label = label;
    this.client = createProviderHttpClient({
      baseUrl: BASE_URL,
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": "application/json",
      },
    });
  }

  async listAccounts(): Promise<ProviderResult<HostingAccount[]>> {
    const result = await this.client.request<HostingerDomain[]>({
      path: "/api/domains/v1/portfolio",
    });
    if (!result.ok) return result;
    const items = Array.isArray(result.data) ? result.data : [];
    return { ok: true, data: items.map(toAccount) };
  }

  async getAccount(id: string): Promise<ProviderResult<HostingAccount>> {
    const result = await this.listAccounts();
    if (!result.ok) return result;
    const account = result.data.find((item) => item.id === id);
    if (!account) {
      return { ok: false, kind: "error", message: "Account not found" };
    }
    return { ok: true, data: account };
  }

  async setSuspended(): Promise<ProviderResult<void>> {
    return { ok: false, kind: "unsupported", operation: "setSuspended" };
  }
}
