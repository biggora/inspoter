import { expect, test } from "./fixtures/test";
import { login } from "./utils/auth";

test.use({ trace: "off", screenshot: "off", video: "off" });

test("unmatched routes return an accessible global 404", async ({ page }) => {
  await login(page);
  const response = await page.goto("/does-not-exist-audit-check");

  expect(response?.status()).toBe(404);
  await expect(
    page.getByRole("heading", { name: "Page not found", level: 1 }),
  ).toBeVisible();
  await expect(page.getByRole("main")).toHaveCount(1);
  await expect(page.getByRole("link", { name: "Go to sign in" })).toBeVisible();
});

test("unknown dashboard and help resources return HTTP 404", async ({
  page,
}) => {
  await login(page);

  for (const path of [
    "/dashboards/does-not-exist-audit-check",
    "/help/does-not-exist-audit-check",
  ]) {
    const response = await page.goto(path);
    expect(response?.status(), path).toBe(404);
    await expect(
      page.getByRole("heading", { name: "Page not found", level: 1 }),
    ).toBeVisible();
    await expect(page.getByRole("main")).toHaveCount(1);
    await expect(
      page.getByRole("link", { name: "Back to dashboards" }),
    ).toBeVisible();
  }
});

test("Russian marketing home fits a 390px viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/ru/");

  const viewport = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(viewport.scrollWidth).toBeLessThanOrEqual(viewport.clientWidth);
});
