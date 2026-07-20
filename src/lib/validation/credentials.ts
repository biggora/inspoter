import { z } from "zod";
import type { CredentialData } from "@/lib/crypto/credentials";

// Zod schemas for the provider credentials API — single source of input
// validation, shared by the /api/credentials route handlers.

export const upsertCredentialSchema = z.discriminatedUnion("provider", [
  z.object({
    provider: z.literal("CLOUDFLARE_DNS"),
    label: z.string().trim().min(1).max(100),
    apiToken: z.string().min(1),
  }),
  z.object({
    provider: z.literal("HETZNER_DNS"),
    label: z.string().trim().min(1).max(100),
    apiToken: z.string().min(1),
  }),
  z.object({
    provider: z.literal("HETZNER_CLOUD"),
    label: z.string().trim().min(1).max(100),
    apiToken: z.string().min(1),
  }),
  z.object({
    provider: z.literal("GODADDY_DNS"),
    label: z.string().trim().min(1).max(100),
    apiKey: z.string().min(1),
    apiSecret: z.string().min(1),
  }),
  z.object({
    provider: z.literal("HOSTINGER"),
    label: z.string().trim().min(1).max(100),
    apiToken: z.string().min(1),
  }),
  z.object({
    provider: z.literal("CPANEL_WHM"),
    label: z.string().trim().min(1).max(100),
    hostname: z.string().trim().min(1).max(255),
    username: z.string().trim().min(1).max(100),
    apiToken: z.string().min(1),
    allowInsecure: z.boolean().optional().default(false),
  }),
  z.object({
    provider: z.literal("CPANEL_UAPI"),
    label: z.string().trim().min(1).max(100),
    hostname: z.string().trim().min(1).max(255),
    username: z.string().trim().min(1).max(100),
    apiToken: z.string().min(1),
    allowInsecure: z.boolean().optional().default(false),
  }),
]);

export type UpsertCredentialInput = z.infer<typeof upsertCredentialSchema>;

export function toCredentialData(input: UpsertCredentialInput): CredentialData {
  switch (input.provider) {
    case "CLOUDFLARE_DNS":
      return { type: "CLOUDFLARE_DNS", apiToken: input.apiToken };
    case "HETZNER_DNS":
      return { type: "HETZNER_DNS", apiToken: input.apiToken };
    case "HETZNER_CLOUD":
      return { type: "HETZNER_CLOUD", apiToken: input.apiToken };
    case "GODADDY_DNS":
      return {
        type: "GODADDY_DNS",
        apiKey: input.apiKey,
        apiSecret: input.apiSecret,
      };
    case "HOSTINGER":
      return { type: "HOSTINGER", apiToken: input.apiToken };
    case "CPANEL_WHM":
      return {
        type: "CPANEL_WHM",
        hostname: input.hostname,
        username: input.username,
        apiToken: input.apiToken,
        allowInsecure: input.allowInsecure,
      };
    case "CPANEL_UAPI":
      return {
        type: "CPANEL_UAPI",
        hostname: input.hostname,
        username: input.username,
        apiToken: input.apiToken,
        allowInsecure: input.allowInsecure,
      };
  }
}
