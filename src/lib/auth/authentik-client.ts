import * as client from "openid-client";
import { authentikEnabled, env } from "@/lib/config/env";

// Authentik OIDC discovery cache — module-level lazy singleton (same pattern
// as src/lib/db.ts's Prisma client), so `.well-known/openid-configuration` is
// only fetched once per process lifetime instead of on every login/callback
// request. On discovery failure the cached promise is dropped so the next
// call retries rather than permanently caching a rejection.

let configPromise: Promise<client.Configuration> | null = null;

export function getAuthentikConfig(): Promise<client.Configuration> {
  if (!authentikEnabled) {
    throw new Error("Authentik is not configured");
  }

  if (!configPromise) {
    configPromise = client
      .discovery(
        new URL(env.AUTHENTIK_ISSUER!),
        env.AUTHENTIK_CLIENT_ID!,
        env.AUTHENTIK_CLIENT_SECRET!,
      )
      .catch((error: unknown) => {
        configPromise = null;
        throw error;
      });
  }

  return configPromise;
}
