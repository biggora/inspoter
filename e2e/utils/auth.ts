import type { Page } from "@playwright/test";

// Shared login helper for e2e specs. Reads the operator credentials from the
// same env the app boots with (.env — see the tester-added note there) so
// this goes green in Mode B without additional per-test setup.
export const OPERATOR_USERNAME = process.env.OPERATOR_USERNAME ?? "operator";
export const OPERATOR_PASSWORD = process.env.OPERATOR_PASSWORD ?? "Test1234!";

export async function login(
  page: Page,
  username: string = OPERATOR_USERNAME,
  password: string = OPERATOR_PASSWORD,
) {
  await page.goto("/login");
  await page.getByLabel(/^username$/i).fill(username);
  await page.getByLabel(/^password$/i).fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();

  // The `login` Server Action + client-side router.push/refresh (LoginForm)
  // are asynchronous and NOT awaited by this click() — a caller that
  // immediately does page.goto(...)/page.evaluate(...) right after login()
  // returns can abort the in-flight request (bug discovered in Mode B's
  // first e2e run: every test that navigated right after login() landed
  // back on /login because the browser cancelled the pending request).
  // Wait for the outcome to settle — either navigation away from /login
  // (success, AC-AUTH-002) or the error banner appearing (rejection,
  // AC-AUTH-003) — before returning, so every caller sees a stable state.
  await Promise.race([
    page.waitForURL((url) => !url.pathname.startsWith("/login"), {
      timeout: 10_000,
    }),
    page
      .getByText(/invalid username or password/i)
      .waitFor({ state: "visible", timeout: 10_000 }),
  ]);
}
