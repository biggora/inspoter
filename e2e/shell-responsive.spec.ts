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

test("PageHeader keeps the alerts title and actions inside the viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  await page.goto("/alerts");

  const header = page.locator('[data-slot="page-header"]');
  const title = header.getByRole("heading", {
    name: "Оповещения",
    exact: true,
  });
  const actions = [
    header.getByRole("button", {
      name: "Управление категориями",
      exact: true,
    }),
    header.getByRole("button", { name: "Новая категория", exact: true }),
  ];

  await expect(title).toHaveText("Оповещения");
  await expect(title).toBeVisible();
  for (const action of actions) await expect(action).toBeVisible();

  const hasHorizontalOverflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth >
      document.documentElement.clientWidth,
  );
  expect(hasHorizontalOverflow).toBe(false);
  expect(
    await title.evaluate((element) => element.scrollWidth),
  ).toBeLessThanOrEqual(await title.evaluate((element) => element.clientWidth));

  for (const element of [title, ...actions]) {
    const bounds = await element.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
  }

  await page.setViewportSize({ width: 1440, height: 900 });

  const titleBounds = await title.boundingBox();
  const firstActionBounds = await actions[0].boundingBox();
  expect(titleBounds).not.toBeNull();
  expect(firstActionBounds).not.toBeNull();
  expect(
    Math.abs(
      titleBounds!.y +
        titleBounds!.height / 2 -
        (firstActionBounds!.y + firstActionBounds!.height / 2),
    ),
  ).toBeLessThanOrEqual(1);
  expect(titleBounds!.x + titleBounds!.width).toBeLessThan(
    firstActionBounds!.x,
  );
});
