import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import {
  createTestChildEnvironment,
  loadTestEnvironment,
} from "./test-env.mjs";
import { validateTestDatabaseTarget } from "./test-db.mjs";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const testEnvironment = createTestChildEnvironment(loadTestEnvironment());
validateTestDatabaseTarget(testEnvironment);
Object.assign(process.env, testEnvironment);

export default defineConfig({
  root: repositoryRoot,
  resolve: {
    alias: {
      "@": path.resolve(repositoryRoot, "src"),
    },
  },
  test: {
    globals: true,
    environment: "node",
    include: ["scripts/mail-label-phase5-performance.test.mjs"],
    env: testEnvironment,
    fileParallelism: false,
    maxWorkers: 1,
    retry: 0,
    testTimeout: 180_000,
    hookTimeout: 180_000,
  },
});
