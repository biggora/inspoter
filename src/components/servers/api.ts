"use client";

import {
  getActiveWorkspaceId,
  WORKSPACE_HEADER_NAME,
} from "@/lib/client/active-workspace";

// Metrics state for a server
export type MetricsState = "not_configured" | "live" | "stale";

export interface ServerMetricsDto {
  state: MetricsState;
  receivedAt: string | null;
  cpuUsagePercent: number | null;
  load1: number | null;
  load5: number | null;
  load15: number | null;
  memoryTotalBytes: string | null;
  memoryAvailableBytes: string | null;
  swapTotalBytes: string | null;
  swapFreeBytes: string | null;
  filesystemTotalBytes: string | null;
  filesystemAvailableBytes: string | null;
  uptimeSeconds: string | null;
}

export interface ProviderServerDto {
  localServerId: string;
  origin: "provider";
  providerCredentialId: string;
  providerId: string;
  remoteServerId: string;
  providerAvailability: "present" | "unavailable" | "missing";
  powerActionsAvailable: boolean;
  metrics: ServerMetricsDto;
  name: string;
  type: string;
  status: string;
  ip: string;
  cpu: string;
  ram: string;
  disk: string;
  os: string;
  location: string;
}

export interface AgentOnlyServerDto {
  localServerId: string;
  origin: "agent";
  providerCredentialId: null;
  providerId: null;
  remoteServerId: null;
  providerAvailability: "not_applicable";
  powerActionsAvailable: false;
  metrics: ServerMetricsDto;
  name: string;
  hostname: string | null;
}

export type ServerDto = ProviderServerDto | AgentOnlyServerDto;

export interface ComposedServersResponse {
  servers: ServerDto[];
  providerErrors: { providerId: string; label: string; error: string }[];
}

export async function fetchServers(): Promise<ComposedServersResponse> {
  const res = await fetch("/api/servers", {
    headers: { [WORKSPACE_HEADER_NAME]: getActiveWorkspaceId() ?? "" },
  });
  if (!res.ok) throw new Error("Failed to fetch servers");
  return res.json();
}

export async function getServer(
  providerId: string,
  id: string,
): Promise<ProviderServerDto> {
  const res = await fetch(`/api/servers/${providerId}/${id}`, {
    headers: { [WORKSPACE_HEADER_NAME]: getActiveWorkspaceId() ?? "" },
  });
  if (!res.ok) throw new Error("Failed to fetch server");
  return res.json();
}

export async function powerAction(
  providerId: string,
  id: string,
  action: "start" | "stop" | "restart",
) {
  const res = await fetch(`/api/servers/${providerId}/${id}/power`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      [WORKSPACE_HEADER_NAME]: getActiveWorkspaceId() ?? "",
    },
    body: JSON.stringify({ action }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? "Power action failed");
  }
  return res.json();
}

