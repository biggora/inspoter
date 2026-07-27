"use client";

import {
  getActiveWorkspaceId,
  WORKSPACE_HEADER_NAME,
} from "@/lib/client/active-workspace";

export interface HostingAccountDto {
  id: string;
  domain: string;
  user: string;
  plan: string;
  status: string;
  ip: string;
  diskUsedMb: number | null;
  diskLimitMb: number | null;
  bandwidthUsedMb: number | null;
  bandwidthLimitMb: number | null;
  databases: number | null;
  databaseDiskUsedMb: number | null;
  emailAccounts: number | null;
  emailAccountsLimit: number | null;
  phpVersion: string | null;
  wordpressVersion: string | null;
  expiresAt: string | null;
  supportsSuspend: boolean;
}

export interface AccountsByProviderDto {
  providerId: string;
  providerType: string;
  label: string;
  mode: string;
  accounts: HostingAccountDto[];
  error: string | null;
}

function workspaceHeaders(): Record<string, string> {
  return { [WORKSPACE_HEADER_NAME]: getActiveWorkspaceId() ?? "" };
}

export async function fetchAccounts(): Promise<AccountsByProviderDto[]> {
  const res = await fetch("/api/hosting", { headers: workspaceHeaders() });
  if (!res.ok) throw new Error("Failed to fetch hosting accounts");
  return res.json();
}

// GET /api/hosting serves the cached listing, so the Refresh button has to
// ask for a live fan-out explicitly or it would only re-render the same
// snapshot.
export async function refreshAccounts(): Promise<AccountsByProviderDto[]> {
  const res = await fetch("/api/hosting/refresh", {
    method: "POST",
    headers: workspaceHeaders(),
  });
  if (!res.ok) throw new Error("Failed to refresh hosting accounts");
  return res.json();
}

export async function getAccount(
  providerId: string,
  id: string,
): Promise<HostingAccountDto> {
  const res = await fetch(
    `/api/hosting/${providerId}/${encodeURIComponent(id)}`,
    { headers: workspaceHeaders() },
  );
  if (!res.ok) throw new Error("Failed to fetch hosting account");
  return res.json();
}

export async function setSuspended(
  providerId: string,
  id: string,
  suspended: boolean,
) {
  const res = await fetch(
    `/api/hosting/${providerId}/${encodeURIComponent(id)}/suspend`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", ...workspaceHeaders() },
      body: JSON.stringify({ suspended }),
    },
  );
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? "Suspend action failed");
  }
  return res.json();
}
