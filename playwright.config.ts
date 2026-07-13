import { defineConfig, devices } from "@playwright/test";

// Playwright config (plan.md §4.2 item 13 / T-1). Two projects cover the
// AC-SHELL-004 viewport requirement (375px mobile, 1440px desktop); the
// mobile project only re-runs the viewport-sensitive shell-responsive spec
// to keep the suite's run time bounded (functional specs run once, on
// desktop-1440).
export default defineConfig({
  testDir: "./e2e",
  timeout: 20_000,
  expect: { timeout: 5_000 },
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3000",
    actionTimeout: 5_000,
    navigationTimeout: 15_000,
    trace: "on-first-retry",
  },
  webServer: {
    // Mode B switch: production build+start rather than `next dev`. Observed
    // in Mode B's first full run — under `next dev --turbopack`'s on-demand
    // per-route compilation, 6 parallel workers cold-hitting distinct routes
    // caused hydration races (React controlled inputs not yet listening when
    // Playwright's `.fill()`/`.click()` landed), producing flaky failures
    // unrelated to any AC (e.g. the Sign in button observed still disabled
    // after a correct fill()). A prebuilt production server serves already
    // -compiled, already-hydrating bundles, removing that race deterministically.
    command: "npm run build && npm run start",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
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
