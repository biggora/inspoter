import { expect, test } from "./fixtures/test";
import { login } from "./utils/auth";

// AC-SHELL-004 (design.md §3.2.1/§3.2.2, §7). Runs on both Playwright
// projects (desktop-1440 by default, mobile-375 via playwright.config.ts
// testMatch) — the two reference viewports named by the AC.

test("AC-SHELL-004: shell renders with no horizontal overflow", async ({
  page,
}) => {
  await login(page);
  await page.goto("/bookmarks");

  const hasHorizontalOverflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth >
      document.documentElement.clientWidth,
  );
  expect(hasHorizontalOverflow).toBe(false);
});
