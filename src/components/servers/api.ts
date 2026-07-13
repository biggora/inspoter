"use client";

export async function fetchServers() {
  const res = await fetch("/api/servers");
  if (!res.ok) throw new Error("Failed to fetch servers");
  return res.json();
}

export async function getServer(id: string) {
  const res = await fetch(`/api/servers/${id}`);
  if (!res.ok) throw new Error("Failed to fetch server");
  return res.json();
}

export async function powerAction(
  id: string,
  action: "start" | "stop" | "restart",
) {
  const res = await fetch(`/api/servers/${id}/power`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? "Power action failed");
  }
  return res.json();
}
