import { createProviderHttpClient } from "@/lib/providers/http";
import type { ProviderResult } from "@/lib/providers/result";
import type { HostingAccount, HostingProvider } from "./types";
import { buildCpanelBaseUrl, parseCpanelCount, parseCpanelMb } from "./cpanel";

const UAPI_PORT = 2083;

interface UapiResponse<T> {
  status?: number;
  errors?: string[] | null;
  data?: T;
}

interface UsageItem {
  id?: string;
  usage?: string | number | null;
  maximum?: string | number | null;
}

interface ListDomainsData {
  main_domain?: string;
  sub_domains?: string[];
  addon_domains?: string[];
  parked_domains?: string[];
}

function findUsage(items: UsageItem[], id: string): UsageItem | undefined {
  return items.find((item) => item.id === id);
}

// Per-account cPanel monitoring via UAPI (account-scoped token). Read-only:
// suspend is a WHM privilege, so setSuspended returns "unsupported".
export class CpanelUapiProvider implements HostingProvider {
  readonly id: string;
  readonly providerType = "cpanel-uapi";
  readonly label: string;
  readonly mode = "real" as const;
  private readonly username: string;
  private readonly client;

  constructor(
    id: string,
    label: string,
    hostname: string,
    username: string,
    apiToken: string,
    allowInsecure: boolean = false,
  ) {
    this.id = id;
    this.label = label;
    this.username = username;
    this.client = createProviderHttpClient({
      baseUrl: buildCpanelBaseUrl(hostname, UAPI_PORT),
      headers: { Authorization: `cpanel ${username}:${apiToken}` },
      allowInsecure,
    });
  }

  async listAccounts(): Promise<ProviderResult<HostingAccount[]>> {
    const account = await this.getAccount();
    if (!account.ok) return account;
    return { ok: true, data: [account.data] };
  }

  async getAccount(): Promise<ProviderResult<HostingAccount>> {
    const usageResult = await this.client.request<UapiResponse<UsageItem[]>>({
      path: "/execute/ResourceUsage/get_usages",
    });
    if (!usageResult.ok) return usageResult;
    if (usageResult.data.status === 0) {
      return {
        ok: false,
        kind: "error",
        message: usageResult.data.errors?.[0] ?? "Provider error",
      };
    }

    const domainsResult = await this.client.request<
      UapiResponse<ListDomainsData>
    >({ path: "/execute/DomainInfo/list_domains" });
    const domainData = domainsResult.ok ? domainsResult.data.data : undefined;

    const usages = usageResult.data.data ?? [];
    const disk = findUsage(usages, "disk_usage");
    const bandwidth = findUsage(usages, "bandwidth");
    const databases = findUsage(usages, "mysql_databases");
    const email = findUsage(usages, "email_accounts");

    const account: HostingAccount = {
      id: this.username,
      domain: domainData?.main_domain ?? this.username,
      user: this.username,
      plan: "",
      status: "active",
      ip: "",
      diskUsedMb: parseCpanelMb(disk?.usage),
      diskLimitMb: parseCpanelMb(disk?.maximum),
      bandwidthUsedMb: parseCpanelMb(bandwidth?.usage),
      bandwidthLimitMb: parseCpanelMb(bandwidth?.maximum),
      databases: parseCpanelCount(databases?.usage),
      emailAccounts: parseCpanelCount(email?.usage),
      expiresAt: null,
      supportsSuspend: false,
    };

    return { ok: true, data: account };
  }

  async setSuspended(): Promise<ProviderResult<void>> {
    return { ok: false, kind: "unsupported", operation: "setSuspended" };
  }
}
