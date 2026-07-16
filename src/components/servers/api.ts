"use client";

import {
  getActiveWorkspaceId,
  WORKSPACE_HEADER_NAME,
} from "@/lib/client/active-workspace";

export interface ServerDto {
  id: string;
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

export interface ServersByProviderDto {
  providerId: string;
  providerType: string;
  label: string;
  mode: string;
  servers: ServerDto[];
  error: string | null;
}

export async function fetchServers(): Promise<ServersByProviderDto[]> {
  const res = await fetch("/api/servers", {
    headers: { [WORKSPACE_HEADER_NAME]: getActiveWorkspaceId() ?? "" },
  });
  if (!res.ok) throw new Error("Failed to fetch servers");
  return res.json();
}

export async function getServer(
  providerId: string,
  id: string,
): Promise<ServerDto> {
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
