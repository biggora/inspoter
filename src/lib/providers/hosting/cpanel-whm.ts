import { createProviderHttpClient } from "@/lib/providers/http";
import type { ProviderResult } from "@/lib/providers/result";
import type {
  HostingAccount,
  HostingAccountStatus,
  HostingProvider,
} from "./types";
import { buildCpanelBaseUrl, parseCpanelMb } from "./cpanel";

const WHM_PORT = 2087;

interface WhmAccount {
  user: string;
  domain: string;
  plan?: string;
  ip?: string;
  suspended?: number | string | boolean;
  disklimit?: string | number;
  diskused?: string | number;
}

interface WhmResponse<T> {
  metadata?: { result?: number; reason?: string };
  data?: T;
}

function toStatus(suspended: WhmAccount["suspended"]): HostingAccountStatus {
  if (suspended === undefined) return "unknown";
  return suspended === 1 || suspended === "1" || suspended === true
    ? "suspended"
    : "active";
}

function toAccount(acct: WhmAccount): HostingAccount {
  return {
    id: acct.user,
    domain: acct.domain,
    user: acct.user,
    plan: acct.plan ?? "",
    status: toStatus(acct.suspended),
    ip: acct.ip ?? "",
    diskUsedMb: parseCpanelMb(acct.diskused),
    diskLimitMb: parseCpanelMb(acct.disklimit),
    bandwidthUsedMb: null,
    bandwidthLimitMb: null,
    // listaccts exposes plan limits, not current DB/email counts, so these
    // stay null to avoid presenting a quota as a usage count.
    databases: null,
    emailAccounts: null,
    expiresAt: null,
    supportsSuspend: true,
  };
}

// Server-wide cPanel monitoring via WHM API 1 (root/reseller token).
export class CpanelWhmProvider implements HostingProvider {
  readonly id: string;
  readonly providerType = "cpanel-whm";
  readonly label: string;
  readonly mode = "real" as const;
  private readonly client;

  constructor(
    id: string,
    label: string,
    hostname: string,
    username: string,
    apiToken: string,
  ) {
    this.id = id;
    this.label = label;
    this.client = createProviderHttpClient({
      baseUrl: buildCpanelBaseUrl(hostname, WHM_PORT),
      headers: { Authorization: `whm ${username}:${apiToken}` },
    });
  }

  async listAccounts(): Promise<ProviderResult<HostingAccount[]>> {
    const result = await this.client.request<
      WhmResponse<{ acct?: WhmAccount[] }>
    >({
      path: "/json-api/listaccts?api.version=1",
    });
    if (!result.ok) return result;
    if (result.data.metadata?.result === 0) {
      return {
        ok: false,
        kind: "error",
        message: result.data.metadata.reason ?? "Provider error",
      };
    }
    const accounts = result.data.data?.acct ?? [];
    return { ok: true, data: accounts.map(toAccount) };
  }

  async getAccount(id: string): Promise<ProviderResult<HostingAccount>> {
    const result = await this.client.request<
      WhmResponse<{ acct?: WhmAccount[] }>
    >({
      path: `/json-api/accountsummary?api.version=1&user=${encodeURIComponent(id)}`,
    });
    if (!result.ok) return result;
    const account = result.data.data?.acct?.[0];
    if (!account) {
      return { ok: false, kind: "error", message: "Account not found" };
    }
    return { ok: true, data: toAccount(account) };
  }

  async setSuspended(
    id: string,
    suspended: boolean,
  ): Promise<ProviderResult<void>> {
    const command = suspended ? "suspendacct" : "unsuspendacct";
    const result = await this.client.request<WhmResponse<unknown>>({
      method: "POST",
      path: `/json-api/${command}?api.version=1&user=${encodeURIComponent(id)}`,
    });
    if (!result.ok) return result;
    if (result.data.metadata?.result === 0) {
      return {
        ok: false,
        kind: "error",
        message: result.data.metadata.reason ?? "Provider error",
      };
    }
    return { ok: true, data: undefined };
  }
}
