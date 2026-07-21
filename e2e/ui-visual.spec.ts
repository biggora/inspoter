import { expect, test } from "./fixtures/test";
import { login } from "./utils/auth";

async function expectNoHorizontalOverflow(page: Parameters<typeof login>[0]) {
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true);
}

async function selectTheme(
  page: Parameters<typeof login>[0],
  theme: "light" | "dark",
) {
  await page.evaluate((value) => localStorage.setItem("theme", value), theme);
  await page.reload();
  await expect(page.locator("html")).toHaveClass(
    new RegExp(`(^| )${theme}( |$)`),
  );
}

test("migrated workspace controls render responsive light, dark, focus, disabled, loading, and reduced-motion states", async ({
  page,
}, testInfo) => {
  const expectedViewport = testInfo.project.name.startsWith("mobile")
    ? { width: 375, height: 800 }
    : { width: 1440, height: 900 };
  expect(page.viewportSize()).toEqual(expectedViewport);

  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
  await login(page);
  await page.goto("/settings/workspace");
  await selectTheme(page, "light");
  expect(
    await page.evaluate(
      () => matchMedia("(prefers-reduced-motion: reduce)").matches,
    ),
  ).toBe(true);

  const renameForm = page
    .locator("form")
    .filter({ has: page.getByLabel("Название рабочего пространства", { exact: true }) });
  const name = renameForm.getByLabel("Название рабочего пространства", {
    exact: true,
  });
  await name.focus();
  await expect(name).toBeFocused();
  const focusStyle = await name.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      outlineStyle: style.outlineStyle,
      outlineWidth: Number.parseFloat(style.outlineWidth),
    };
  });
  expect(focusStyle.outlineStyle).not.toBe("none");
  expect(focusStyle.outlineWidth).toBeGreaterThan(0);

  const save = renameForm.getByRole("button", {
    name: "Сохранить изменения",
    exact: true,
  });
  await expect(save).toBeDisabled();
  expect(
    await save.evaluate((element) =>
      Number.parseFloat(getComputedStyle(element).opacity),
    ),
  ).toBeLessThan(1);
  await expectNoHorizontalOverflow(page);
  await testInfo.attach(`${testInfo.project.name}-light-reduced`, {
    body: await page.screenshot(),
    contentType: "image/png",
  });

  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await selectTheme(page, "dark");
  const darkName = page.getByLabel("Название рабочего пространства", {
    exact: true,
  });
  await darkName.focus();
  await expect(darkName).toBeFocused();
  await expectNoHorizontalOverflow(page);
  await testInfo.attach(`${testInfo.project.name}-dark-reduced`, {
    body: await page.screenshot(),
    contentType: "image/png",
  });

  let releaseRequest = () => {};
  let observeRequest = () => {};
  const requestObserved = new Promise<void>((resolve) => {
    observeRequest = resolve;
  });
  await page.route("**/api/workspaces/*", async (route) => {
    const url = new URL(route.request().url());
    if (
      route.request().method() !== "PATCH" ||
      !/^\/api\/workspaces\/[^/]+$/.test(url.pathname)
    ) {
      await route.continue();
      return;
    }
    observeRequest();
    await new Promise<void>((resolve) => {
      releaseRequest = resolve;
    });
    await route.abort("failed");
  });

  try {
    await darkName.fill(`Visual pending ${testInfo.project.name}`);
    await renameForm
      .getByRole("button", { name: "Сохранить изменения", exact: true })
      .click();
    await requestObserved;

    const pending = page.getByRole("button", {
      name: "Сохранение…",
      exact: true,
    });
    await expect(pending).toBeDisabled();
    const spinner = pending.locator('[data-slot="spinner"]');
    await expect(spinner).toBeVisible();
    const reducedMotionStyle = await spinner.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        animationDurationMs: Number.parseFloat(style.animationDuration) * 1000,
        animationIterationCount: style.animationIterationCount,
      };
    });
    expect(reducedMotionStyle.animationDurationMs).toBeLessThanOrEqual(0.001);
    expect(reducedMotionStyle.animationIterationCount).toBe("1");
    await expectNoHorizontalOverflow(page);
    await testInfo.attach(`${testInfo.project.name}-dark-loading-reduced`, {
      body: await page.screenshot(),
      contentType: "image/png",
    });
  } finally {
    releaseRequest();
  }
});
