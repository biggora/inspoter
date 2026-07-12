import { test, expect } from "@playwright/test";
import { login, OPERATOR_USERNAME, OPERATOR_PASSWORD } from "./utils/auth";

// AC-AUTH-001..005, M-3 (design.md §3.1, §1.1; plan.md §5.2). Mode B:
// src/app/login/**, src/middleware.ts, and src/app/(dashboard)/** are
// implemented — these exercise the real login/logout/redirect flow end to
// end in a real browser against the real app + Postgres.

const DASHBOARD_ROUTES = [
  "/bookmarks",
  "/domains",
  "/servers",
  "/mail",
  "/messages",
  "/logs",
  "/alerts",
  "/settings",
];

test.describe("AC-AUTH-001 / M-3: unauthenticated visitor is redirected from every dashboard route", () => {
  for (const route of DASHBOARD_ROUTES) {
    test(`${route} redirects to /login when unauthenticated`, async ({ page }) => {
      await page.goto(route);
      await expect(page).toHaveURL(/\/login/);
    });
  }
});

test("AC-AUTH-002: valid env-seeded credentials establish a session and reach the dashboard", async ({
  page,
}) => {
  await login(page);
  await expect(page).toHaveURL(/\/bookmarks/);
});

test("AC-AUTH-003: invalid credentials are rejected with a generic error and no session", async ({
  page,
}) => {
  await login(page, "not-the-operator", "wrong-password");
  await expect(page.getByText(/invalid username or password/i)).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
});

test("AC-AUTH-004: logout invalidates the session and subsequent requests redirect to login", async ({
  page,
}) => {
  await login(page);
  await expect(page).toHaveURL(/\/bookmarks/);

  await page.getByRole("button", { name: /log ?out/i }).click();
  await expect(page).toHaveURL(/\/login/);

  await page.goto("/bookmarks");
  await expect(page).toHaveURL(/\/login/);
});

test("AC-AUTH-005: operator env bootstrap — the seeded credentials authenticate on first boot", async ({
  page,
}) => {
  // Same assertion surface as AC-AUTH-002, from the bootstrap angle: the
  // operator account provisioned from OPERATOR_USERNAME/OPERATOR_PASSWORD at
  // startup (env, N-8b) must be the one that authenticates — no separate
  // registration step exists.
  expect(OPERATOR_USERNAME).toBeTruthy();
  expect(OPERATOR_PASSWORD).toBeTruthy();
  await login(page);
  await expect(page).toHaveURL(/\/bookmarks/);
});
