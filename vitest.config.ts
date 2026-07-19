import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig } from "vitest/config";
import {
  createTestChildEnvironment,
  loadTestEnvironment,
} from "./scripts/test-env.mjs";
import { validateTestDatabaseTarget } from "./scripts/test-db.mjs";

const testEnvironment = createTestChildEnvironment(loadTestEnvironment());
validateTestDatabaseTarget(testEnvironment);
Object.assign(process.env, testEnvironment);

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    globals: true,
    environment: "node",
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    env: testEnvironment,
    // DB-integration tests normally finish in <500ms, but the dockerized
    // Postgres on Windows occasionally stalls a query for several seconds
    // during I/O (e.g. checkpoints), which can trip the 5s default. Widen the
    // margin so rare host-level variance does not fail an otherwise-green run.
    testTimeout: 15000,
    fileParallelism: false,
    maxWorkers: 1,
    allowOnly: false,
    retry: 0,
    reporters:
      process.env.GITHUB_ACTIONS === "true"
        ? ["default", "github-actions", "junit"]
        : ["default"],
    outputFile: {
      junit: "test-results/vitest/junit.xml",
    },
  },
});
