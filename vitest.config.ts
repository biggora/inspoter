import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig } from "vitest/config";
import type { TestProjectInlineConfiguration as ProjectConfig } from "vitest/config";
import {
  createTestChildEnvironment,
  loadTestEnvironment,
} from "./scripts/test-env.mjs";
import { validateTestDatabaseTarget } from "./scripts/test-db.mjs";

// The test environment (DATABASE_URL, etc.) is loaded once at config time so
// that the integration project's globalSetup can read it from process.env.
// The *validation* (host/port/database shape) is a pure string check (no
// connection) and is applied unconditionally, matching prior behavior; only
// the integration project actually connects to Postgres.
const testEnvironment = createTestChildEnvironment(loadTestEnvironment());
Object.assign(process.env, testEnvironment);

// Shared, non-test config for every project: React + alias + the next-intl
// ESM workaround (next-intl imports Next's extensionless public entrypoints
// like `next/navigation`; Node's native Windows ESM resolver cannot load those
// directly, so let Vite transform the package instead of externalizing it).
const sharedResolve = {
  alias: {
    "@": path.resolve(__dirname, "./src"),
  },
};
const sharedTest = {
  server: { deps: { inline: ["next-intl"] } },
  globals: true,
  environment: "node",
  env: testEnvironment,
  allowOnly: false,
  retry: 0,
  reporters:
    process.env.GITHUB_ACTIONS === "true"
      ? ["default", "github-actions", "junit"]
      : ["default"],
  outputFile: {
    junit: "test-results/vitest/junit.xml",
  },
};

const unitProject: ProjectConfig = {
  plugins: [react()],
  resolve: sharedResolve,
  test: {
    ...sharedTest,
    // Pure unit tests — no database, no Docker. Run in parallel.
    name: "unit",
    include: ["tests/unit/**/*.test.ts", "tests/unit/**/*.test.tsx"],
    setupFiles: ["./tests/setup.unit.ts"],
    testTimeout: 5_000,
  },
};

const integrationProject: ProjectConfig = {
  plugins: [react()],
  resolve: sharedResolve,
  test: {
    ...sharedTest,
    // Real Postgres on 127.0.0.1:3833 via docker-compose.test.yml. Serialised
    // (Prisma client is cached on globalThis per worker); wide timeout for
    // dockerized-Postgres I/O variance on Windows. Fail fast via globalSetup
    // if the DB is down so a missing container surfaces as one clear error,
    // not 29 stacks or silent beforeAll skips.
    name: "integration",
    include: [
      "tests/integration/**/*.test.ts",
      "tests/integration/**/*.test.tsx",
    ],
    setupFiles: ["./tests/setup.integration.ts"],
    globalSetup: ["./tests/integration/db-global-setup.ts"],
    // DB-integration tests normally finish in <500ms, but the dockerized
    // Postgres on Windows occasionally stalls a query for several seconds
    // during I/O (e.g. checkpoints), which can trip the 5s default.
    testTimeout: 15_000,
    fileParallelism: false,
    maxWorkers: 1,
  },
};

export default defineConfig({
  test: {
    projects: [unitProject, integrationProject],
  },
});

validateTestDatabaseTarget(testEnvironment);
