"use client";

import {
  getActiveWorkspaceId,
  WORKSPACE_HEADER_NAME,
} from "@/lib/client/active-workspace";

export async function fetchServers() {
  const res = await fetch("/api/servers", {
    headers: { [WORKSPACE_HEADER_NAME]: getActiveWorkspaceId() ?? "" },
  });
  if (!res.ok) throw new Error("Failed to fetch servers");
  return res.json();
}

export async function getServer(id: string) {
  const res = await fetch(`/api/servers/${id}`, {
    headers: { [WORKSPACE_HEADER_NAME]: getActiveWorkspaceId() ?? "" },
  });
  if (!res.ok) throw new Error("Failed to fetch server");
  return res.json();
}

export async function powerAction(
  id: string,
  action: "start" | "stop" | "restart",
) {
  const res = await fetch(`/api/servers/${id}/power`, {
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
