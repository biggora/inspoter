import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { login } from "./utils/auth";

// NFR-A11Y-001 / M-8 (design.md §8): automated axe pass, zero critical
// violations on Login, Shell, and Bookmarks. Each test first asserts the
// screen actually rendered (heading/landmark visible) before running axe —
// so a missing page fails on that assertion, not by silently running axe
// against an unrelated 404/error page.

test("Login screen has zero critical accessibility violations", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: /sign in/i })).toBeVisible();

  const results = await new AxeBuilder({ page }).analyze();
  const critical = results.violations.filter((v) => v.impact === "critical");
  expect(critical).toEqual([]);
});

test("Shell + Bookmarks screen has zero critical accessibility violations", async ({ page }) => {
  await login(page);
  await page.goto("/bookmarks");
  await expect(page.getByRole("navigation")).toBeVisible();

  const results = await new AxeBuilder({ page }).analyze();
  const critical = results.violations.filter((v) => v.impact === "critical");
  expect(critical).toEqual([]);
});
