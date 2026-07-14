import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "dotenv";

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const TEST_ENV_KEYS = new Set([
  "NODE_ENV",
  "DATABASE_URL",
  "LIST_PAGE_SIZE",
  "WEBHOOK_RATE_LIMIT",
  "WEBHOOK_RATE_WINDOW_MS",
  "WEBHOOK_MAX_BODY_BYTES",
  "OPERATOR_USERNAME",
  "OPERATOR_PASSWORD_HASH",
  "OPERATOR_PASSWORD",
]);

const PROVIDER_CREDENTIAL_KEYS = [
  "CLOUDFLARE_API_TOKEN",
  "HETZNER_DNS_TOKEN",
  "GODADDY_API_KEY",
  "GODADDY_API_SECRET",
  "HCLOUD_TOKEN",
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
 * Provider variables are explicitly blanked in child processes so Prisma's
 * dotenv loading cannot import real provider credentials from developer .env.
 */
export function createTestChildEnvironment(environment) {
  const childEnvironment = { ...environment };
  for (const key of PROVIDER_CREDENTIAL_KEYS) {
    childEnvironment[key] = "";
  }
  return childEnvironment;
}
