import { createProviderHttpClient } from "@/lib/providers/http";
import type { ProviderResult } from "@/lib/providers/result";
import type {
  HostingAccount,
  HostingAccountStatus,
  HostingProvider,
} from "./types";

const BASE_URL = "https://developers.hostinger.com";

interface HostingerWebsite {
  domain?: string;
  vhost_type?: string;
  is_enabled?: boolean;
  username?: string;
  client_id?: number;
  order_id?: number;
  created_at?: string;
  root_directory?: string;
  parent_domain?: string;
}

interface HostingerWebsitesResponse {
  data?: HostingerWebsite[];
}

function toStatus(isEnabled: boolean | undefined): HostingAccountStatus {
  if (isEnabled === true) return "active";
  if (isEnabled === false) return "suspended";
  return "unknown";
}

function toAccount(item: HostingerWebsite): HostingAccount {
  const domain = item.domain ?? "";
  return {
    id: domain,
    domain,
    user: item.username ?? "",
    plan: item.vhost_type ?? "",
    status: toStatus(item.is_enabled),
    ip: "",
    diskUsedMb: null,
    diskLimitMb: null,
    bandwidthUsedMb: null,
    bandwidthLimitMb: null,
    databases: null,
    emailAccounts: null,
    expiresAt: null,
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
    const result = await this.client.request<HostingerWebsitesResponse>({
      path: "/api/hosting/v1/websites?per_page=100",
    });
    if (!result.ok) return result;
    const items = Array.isArray(result.data?.data) ? result.data.data : [];
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
