import { z } from "zod";
import { ProviderType } from "@/generated/prisma/client";
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
  }
}

export const providerParamSchema = z.nativeEnum(ProviderType);
