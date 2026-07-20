import type { ProviderType } from "@/generated/prisma/client";

export interface ProviderMeta {
  label: string;
  category: "DNS" | "HOSTING";
  fields: readonly string[];
}

export const PROVIDER_REGISTRY: Record<ProviderType, ProviderMeta> = {
  CLOUDFLARE_DNS: {
    label: "Cloudflare",
    category: "DNS",
    fields: ["apiToken"],
  },
  HETZNER_DNS: { label: "Hetzner DNS", category: "DNS", fields: ["apiToken"] },
  HETZNER_CLOUD: {
    label: "Hetzner Cloud",
    category: "HOSTING",
    fields: ["apiToken"],
  },
  GODADDY_DNS: {
    label: "GoDaddy",
    category: "DNS",
    fields: ["apiKey", "apiSecret"],
  },
  HOSTINGER: {
    label: "Hostinger",
    category: "HOSTING",
    fields: ["apiToken"],
  },
  CPANEL_WHM: {
    label: "cPanel (WHM)",
    category: "HOSTING",
    fields: ["hostname", "username", "apiToken"],
  },
  CPANEL_UAPI: {
    label: "cPanel (UAPI)",
    category: "HOSTING",
    fields: ["hostname", "username", "apiToken"],
  },
} as const;

export const DNS_PROVIDER_TYPES: ProviderType[] = [
  "CLOUDFLARE_DNS",
  "HETZNER_DNS",
  "GODADDY_DNS",
];

export const HOSTING_PROVIDER_TYPES: ProviderType[] = [
  "HETZNER_CLOUD",
  "HOSTINGER",
  "CPANEL_WHM",
  "CPANEL_UAPI",
];
