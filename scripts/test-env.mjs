import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "dotenv";
import REPOSITORY_ROOT from "./repository-root.cjs";

const TEST_ENV_KEYS = new Set([
  "NODE_ENV",
  "DATABASE_URL",
  "LIST_PAGE_SIZE",
  "WEBHOOK_RATE_LIMIT",
  "WEBHOOK_RATE_WINDOW_MS",
  "WEBHOOK_MAX_BODY_BYTES",
  "MAIL_LABELS_ENABLED",
  "OPERATOR_USERNAME",
  "OPERATOR_PASSWORD_HASH",
  "OPERATOR_PASSWORD",
  // Local-test-only AES key from .env.test.example — the e2e app server needs
  // it so mail-account creation (encrypted app passwords) works in Playwright
  // runs; unit tests stub their own value (see mail-accounts.test.ts).
  "CREDENTIAL_ENCRYPTION_KEY",
  "SERVER_METRICS_RATE_LIMIT",
  "SERVER_METRICS_RATE_WINDOW_MS",
]);

const PROVIDER_CREDENTIAL_KEYS = [
  "CLOUDFLARE_API_TOKEN",
  "HETZNER_DNS_TOKEN",
  "HETZNER_API_TOKEN",
  "GODADDY_API_KEY",
  "GODADDY_API_SECRET",
  "HCLOUD_TOKEN",
];

// .env.test.example intentionally omits OPERATOR_PASSWORD_HASH (tests seed
// via OPERATOR_PASSWORD instead), so unlike the other TEST_ENV_KEYS it is
// never "already set" by the time prisma.config.ts's dotenv import runs
// inside the seed child process — leaving it open to being silently filled
// from the developer's real .env (see .env.example's OPERATOR_PASSWORD_HASH).
const DOTENV_LEAK_GUARD_KEYS = [
  ...PROVIDER_CREDENTIAL_KEYS,
  "OPERATOR_PASSWORD_HASH",
];

function readKnownValues(path) {
  if (!existsSync(path)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(parse(readFileSync(path))).filter(([key]) =>
      TEST_ENV_KEYS.has(key),
    ),
  );
}

/**
 * Loads committed test defaults, then optional local test overrides, while
 * preserving every value already present in the caller's process environment.
 * It never reads the developer .env file.
 */
export function loadTestEnvironment({
  baseEnvironment = process.env,
  repositoryRoot = REPOSITORY_ROOT,
} = {}) {
  const defaults = readKnownValues(
    resolve(repositoryRoot, ".env.test.example"),
  );
  const local = readKnownValues(resolve(repositoryRoot, ".env.test.local"));
  const explicit = Object.fromEntries(
    Object.entries(baseEnvironment).filter(([, value]) => value !== undefined),
  );

  return { ...defaults, ...local, ...explicit };
}

/**
 * These variables are explicitly blanked in child processes so Prisma's
 * dotenv loading (prisma.config.ts's unconditional `import "dotenv/config"`)
 * cannot import real provider credentials or the developer's operator
 * password hash from their local .env.
 */
export function createTestChildEnvironment(environment) {
  const childEnvironment = { ...environment };
  for (const key of DOTENV_LEAK_GUARD_KEYS) {
    childEnvironment[key] = "";
  }
  return childEnvironment;
}
