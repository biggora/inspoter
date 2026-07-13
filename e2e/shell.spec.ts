import { test, expect } from "@playwright/test";
import { login } from "./utils/auth";

// AC-SHELL-001..003 (design.md §3.2). The dashboard shell
// (src/app/(dashboard)/layout.tsx, src/components/shell/**) has not been
// built yet, so every test below is expected to fail at the login step
// (no /login form to reach the shell through) or at the assertion — both
// are real "missing implementation" symptoms, not harness bugs.

const SECTIONS = [
  "Bookmarks",
  "Domains",
  "Servers",
  "Mail",
  "Messages",
  "Logs",
  "Alerts",
];

test("AC-SHELL-001: navigation lists all seven sections", async ({ page }) => {
  await login(page);
  const nav = page.getByRole("navigation");
  for (const section of SECTIONS) {
    await expect(
      nav.getByRole("link", { name: section, exact: true }),
    ).toBeVisible();
  }
});

test("AC-SHELL-002: clicking a nav link routes client-side (no full page reload)", async ({
  page,
}) => {
  await login(page);
  await page.evaluate(() => {
    (
      window as unknown as { __modeANoReloadMarker?: boolean }
    ).__modeANoReloadMarker = true;
  });

  await page
    .getByRole("navigation")
    .getByRole("link", { name: "Domains", exact: true })
    .click();
  await expect(page).toHaveURL(/\/domains/);

  const markerSurvived = await page.evaluate(
    () =>
      (window as unknown as { __modeANoReloadMarker?: boolean })
        .__modeANoReloadMarker === true,
  );
  expect(markerSurvived).toBe(true);
});

const PLACEHOLDER_SECTIONS: Array<[path: string, label: string]> = [
  ["domains", "Domains"],
  ["servers", "Servers"],
  ["mail", "Mail"],
  ["messages", "Messages"],
  ["logs", "Logs"],
  ["alerts", "Alerts"],
];

test.describe("AC-SHELL-003: not-yet-implemented sections show a coming-soon placeholder", () => {
  for (const [path, label] of PLACEHOLDER_SECTIONS) {
    test(`${label} renders a placeholder, not an error or blank screen`, async ({
      page,
    }) => {
      await login(page);
      const response = await page.goto(`/${path}`);
      expect(
        response?.status(),
        `${path} should resolve (not 404/500)`,
      ).toBeLessThan(400);
      await expect(
        page.getByText(new RegExp(`${label}\\s*(—|-)\\s*coming soon`, "i")),
      ).toBeVisible();
    });
  }
});

test("Settings placeholder renders (smoke check per plan.md §5.4 note — not an AC-SHELL-003 assertion)", async ({
  page,
}) => {
  await login(page);
  const response = await page.goto("/settings");
  expect(response?.status()).toBe(200);
});
