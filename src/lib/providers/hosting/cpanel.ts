// Shared helpers for the cPanel WHM and UAPI hosting providers.

// Builds a base URL from a user-supplied hostname. Accepts a bare host, a
// host:port, or a full URL and normalizes to https://<host>:<port>.
export function buildCpanelBaseUrl(hostname: string, port: number): string {
  let host = hostname
    .trim()
    .replace(/\/+$/, "")
    .replace(/^https?:\/\//i, "");
  host = host.split("/")[0];
  if (!/:\d+$/.test(host)) host = `${host}:${port}`;
  return `https://${host}`;
}

// Parses cPanel size values ("1024", "1024M", "unlimited", "∞") to MB.
// Returns null for unlimited/unknown so the UI can render "—".
export function parseCpanelMb(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const raw = String(value).trim();
  if (raw === "" || /unlimited|∞|unknown/i.test(raw)) return null;
  const num = Number.parseFloat(raw.replace(/[^\d.]/g, ""));
  return Number.isFinite(num) ? num : null;
}

export function parseCpanelCount(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const raw = String(value).trim();
  if (raw === "" || /unlimited|∞/i.test(raw)) return null;
  const num = Number.parseInt(raw, 10);
  return Number.isFinite(num) ? num : null;
}
