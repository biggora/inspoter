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

// GET /api/servers serves the cached inventory, so the Refresh button has to
// ask for a live fan-out explicitly or it would only re-render the same
// snapshot.
export async function refreshServers(): Promise<ComposedServersResponse> {
  const res = await fetch("/api/servers/refresh", {
    method: "POST",
    headers: { [WORKSPACE_HEADER_NAME]: getActiveWorkspaceId() ?? "" },
  });
  if (!res.ok) throw new Error("Failed to refresh servers");
  return res.json();
}

export type HistoryRangeKey = "24h" | "48h" | "5d" | "7d" | "30d";

export interface MetricsHistoryPointDto {
  t: string;
  cpuAvg: number;
  cpuMax: number;
  load1: number;
  load5: number;
  load15: number;
  memoryUsedBytes: number;
  memoryTotalBytes: number;
  memoryPercent: number;
  swapUsedBytes: number;
  swapTotalBytes: number;
  swapPercent: number | null;
  diskUsedBytes: number;
  diskTotalBytes: number;
  diskPercent: number;
  uptimeSeconds: number;
}

export interface MetricsHistoryDto {
  range: HistoryRangeKey;
  from: string;
  to: string;
  bucketSeconds: number;
  points: MetricsHistoryPointDto[];
  reboots: string[];
}

// "This server is gone" is a different answer from "the request failed", and
// the detail page states them differently — a missing server offers the way
// back to the list, a failed request offers Retry.
export class ServerNotFoundError extends Error {
  constructor() {
    super("Server not found");
    this.name = "ServerNotFoundError";
  }
}

// Keyed by local server id — the detail page addresses one machine, and an
// agent-only server has no provider/remote id pair to address it by.
export async function getServerByLocalId(
  localServerId: string,
): Promise<ServerDto> {
  const res = await fetch(`/api/servers/local/${localServerId}`, {
    headers: { [WORKSPACE_HEADER_NAME]: getActiveWorkspaceId() ?? "" },
  });
  if (res.status === 404) throw new ServerNotFoundError();
  if (!res.ok) throw new Error("Failed to fetch server");
  return res.json();
}

export async function getServerMetricsHistory(
  localServerId: string,
  range: HistoryRangeKey,
): Promise<MetricsHistoryDto> {
  const res = await fetch(
    `/api/servers/local/${localServerId}/metrics?range=${range}`,
    { headers: { [WORKSPACE_HEADER_NAME]: getActiveWorkspaceId() ?? "" } },
  );
  if (!res.ok) throw new Error("Failed to fetch server metrics history");
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
