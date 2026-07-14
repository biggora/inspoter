import { defineConfig, devices } from "@playwright/test";
import {
  createTestChildEnvironment,
  loadTestEnvironment,
} from "./scripts/test-env.mjs";
import { validateTestDatabaseTarget } from "./scripts/test-db.mjs";

const testEnvironment = createTestChildEnvironment(loadTestEnvironment());
validateTestDatabaseTarget(testEnvironment);
Object.assign(process.env, testEnvironment);

const serverEnvironment = {
  ...testEnvironment,
  NODE_ENV: "production",
  PORT: "3900",
};

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  timeout: 20_000,
  expect: { timeout: 5_000 },
  forbidOnly: true,
  retries: 0,
  workers: 1,
  outputDir: "test-results/playwright",
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "playwright-report" }],
    ["junit", { outputFile: "test-results/playwright/junit.xml" }],
  ],
  use: {
    baseURL: "http://127.0.0.1:3900",
    actionTimeout: 5_000,
    navigationTimeout: 15_000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: {
    command: "pnpm exec next start -p 3900 -H 127.0.0.1",
    url: "http://127.0.0.1:3900",
    reuseExistingServer: false,
    timeout: 180_000,
    stdout: "pipe",
    stderr: "pipe",
    env: serverEnvironment,
  },
  projects: [
    {
      name: "desktop-1440",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: "mobile-375",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 375, height: 800 },
      },
      testMatch: /shell-responsive\.spec\.ts/,
    },
  ],
});
