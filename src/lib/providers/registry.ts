import type { ProviderType } from "@/generated/prisma/client";

export type ProviderCategory = "DNS" | "HOSTING" | "LLM";

export interface ProviderMeta {
  label: string;
  category: ProviderCategory;
  fields: readonly string[];
  booleanFields?: readonly string[];
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
    booleanFields: ["allowInsecure"],
  },
  CPANEL_UAPI: {
    label: "cPanel (UAPI)",
    category: "HOSTING",
    fields: ["hostname", "username", "apiToken"],
    booleanFields: ["allowInsecure"],
  },
  // The two LLM entries differ only in the wire format their driver speaks,
  // so the operator picks the transport here and types the same three fields
  // either way. Order matters: PROVIDER_OPTIONS in
  // provider-credential-dialog.tsx is built from Object.keys(), so the
  // OpenAI-compatible transport stays first and is what an operator reaches
  // for by default.
  OPENAI_COMPATIBLE: {
    label: "OpenAI-compatible",
    category: "LLM",
    fields: ["baseUrl", "model", "apiKey"],
  },
  ANTHROPIC_COMPATIBLE: {
    label: "Anthropic-compatible",
    category: "LLM",
    fields: ["baseUrl", "model", "apiKey"],
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

// Read by src/lib/llm/registry.ts to find the workspace's model credential.
// Order is the tie-breaker only in theory: the registry picks the credential
// flagged as default and falls back to the oldest one, never to this order.
export const LLM_PROVIDER_TYPES: ProviderType[] = [
  "OPENAI_COMPATIBLE",
  "ANTHROPIC_COMPATIBLE",
];
