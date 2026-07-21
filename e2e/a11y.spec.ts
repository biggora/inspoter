import type { Page } from "@playwright/test";

import { expect, test } from "./fixtures/test";
import AxeBuilder from "@axe-core/playwright";
import { login } from "./utils/auth";

// NFR-A11Y-001 / M-8 (design.md §8): automated axe pass, zero serious or
// critical violations. Each test first asserts the screen actually rendered
// (heading/landmark visible) before running axe —
// so a missing page fails on that assertion, not by silently running axe
// against an unrelated 404/error page.

async function expectNoBlockingAxeViolations(page: Page, include?: string) {
  const builder = new AxeBuilder({ page });
  if (include) builder.include(include);
  const results = await builder.analyze();
  const blocking = results.violations.filter(
    (violation) =>
      violation.impact === "critical" || violation.impact === "serious",
  );
  expect(blocking).toEqual([]);
}

test("Login screen has zero serious or critical accessibility violations", async ({
  page,
}) => {
  await page.goto("/login");
  await expect(
    page.getByRole("heading", { name: "Войти", exact: true }),
  ).toBeVisible();

  await expectNoBlockingAxeViolations(page);
});

test("Shell + Bookmarks screen has one main landmark, one named primary navigation, and zero serious or critical accessibility violations", async ({
  page,
}) => {
  await login(page);
  await page.goto("/bookmarks");

  const main = page.getByRole("main");
  await expect(main).toHaveCount(1);
  await expect(main).toBeVisible();

  const primaryNavigation = page.getByRole("navigation", {
    name: "Основная навигация",
    exact: true,
  });
  await expect(primaryNavigation).toHaveCount(1);
  await expect(primaryNavigation).toBeVisible();

  await expectNoBlockingAxeViolations(page);
});

test("Bookmark dialog with the color picker open has zero serious or critical accessibility violations", async ({
  page,
  testData,
}) => {
  await login(page);
  await page.goto("/bookmarks");
  await expect(page.getByRole("navigation")).toBeVisible();

  const categoryName = testData.name("A11y Color Cat");
  await page
    .getByRole("button", { name: "Новая категория", exact: true })
    .click();
  await page.getByLabel("Название", { exact: true }).fill(categoryName);
  const responsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === "/api/categories" &&
      response.request().method() === "POST"
    );
  });
  await page.getByRole("button", { name: "Создать", exact: true }).click();
  const response = await responsePromise;
  const body: unknown = await response.json();
  if (
    typeof body === "object" &&
    body !== null &&
    "id" in body &&
    typeof body.id === "string"
  ) {
    testData.registerCategory(body.id);
  }

  const category = page.getByRole("region", {
    name: categoryName,
    exact: true,
  });
  await expect(category).toBeVisible();
  await category.getByRole("button", { name: "Добавить", exact: true }).click();
  await expect(
    page.getByRole("group", { name: "Цвет", exact: true }),
  ).toBeVisible();

  await expectNoBlockingAxeViolations(page, '[data-slot="dialog-content"]');
});

test("Bookmarks search input and no-results state have zero serious or critical accessibility violations", async ({
  page,
  testData,
}) => {
  await login(page);
  await page.goto("/bookmarks");
  await expect(page.getByRole("navigation")).toBeVisible();

  const categoryName = testData.name("A11y Search Cat");
  await page
    .getByRole("button", { name: "Новая категория", exact: true })
    .click();
  await page.getByLabel("Название", { exact: true }).fill(categoryName);
  const responsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === "/api/categories" &&
      response.request().method() === "POST"
    );
  });
  await page.getByRole("button", { name: "Создать", exact: true }).click();
  const response = await responsePromise;
  const body: unknown = await response.json();
  if (
    typeof body === "object" &&
    body !== null &&
    "id" in body &&
    typeof body.id === "string"
  ) {
    testData.registerCategory(body.id);
  }

  const search = page.getByLabel("Поиск закладок", { exact: true });
  await expect(search).toBeVisible();

  // Labeled search input, no results yet — no-results state is showing.
  await search.fill("nothing-matches-this-query");
  await expect(
    page.getByRole("heading", { name: "Ничего не найдено", exact: true }),
  ).toBeVisible();

  await expectNoBlockingAxeViolations(page);
});

test("Bookmark drag handle, focused, has zero serious or critical accessibility violations", async ({
  page,
  testData,
}) => {
  // Kept as its own test (rather than folded into "Shell + Bookmarks
  // screen" above) because it needs a real bookmark to focus a drag
  // handle on, and isolating that setup keeps the base Shell/Bookmarks
  // scan free of extra fixture data.
  await login(page);
  await page.goto("/bookmarks");
  await expect(page.getByRole("navigation")).toBeVisible();

  const categoryName = testData.name("A11y Drag Handle Cat");
  await page
    .getByRole("button", { name: "Новая категория", exact: true })
    .click();
  await page.getByLabel("Название", { exact: true }).fill(categoryName);
  const categoryResponsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === "/api/categories" &&
      response.request().method() === "POST"
    );
  });
  await page.getByRole("button", { name: "Создать", exact: true }).click();
  const categoryResponse = await categoryResponsePromise;
  const categoryBody: unknown = await categoryResponse.json();
  if (
    typeof categoryBody === "object" &&
    categoryBody !== null &&
    "id" in categoryBody &&
    typeof categoryBody.id === "string"
  ) {
    testData.registerCategory(categoryBody.id);
  }

  const category = page.getByRole("region", {
    name: categoryName,
    exact: true,
  });
  await expect(category).toBeVisible();

  const bookmarkName = testData.name("A11y Drag Handle Bookmark");
  await category.getByRole("button", { name: "Добавить", exact: true }).click();
  await page.getByLabel("Название", { exact: true }).fill(bookmarkName);
  await page
    .getByLabel("URL", { exact: true })
    .fill(new URL("/settings", page.url()).toString());
  await page.getByRole("button", { name: "Создать", exact: true }).click();

  const bookmarkArticle = category.getByRole("article", {
    name: bookmarkName,
    exact: true,
  });
  await expect(bookmarkArticle).toBeVisible();

  const dragHandle = bookmarkArticle.getByRole("button", {
    name: `Изменить порядок: «${bookmarkName}»`,
    exact: true,
  });
  await dragHandle.focus();
  await expect(dragHandle).toBeFocused();

  await expectNoBlockingAxeViolations(page);
});

test("Bookmarks screen with a subcategory has correct heading levels (h2 parent / h3 subcategory, no skipped level) and zero serious or critical accessibility violations", async ({
  page,
  testData,
}) => {
  // Phase 4 (one level of category nesting): a top-level category renders
  // its own `<h2>`, and each of its subcategories renders its own nested
  // `<h3>` (category-section.tsx) — this asserts that structural contract
  // directly, in addition to the usual critical-violations axe scan.
  await login(page);
  await page.goto("/bookmarks");
  await expect(page.getByRole("navigation")).toBeVisible();

  const categoryName = testData.name("A11y Heading Parent");
  const subcategoryName = testData.name("A11y Heading Subcategory");

  await page
    .getByRole("button", { name: "Новая категория", exact: true })
    .click();
  await page.getByLabel("Название", { exact: true }).fill(categoryName);
  const categoryResponsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === "/api/categories" &&
      response.request().method() === "POST"
    );
  });
  await page.getByRole("button", { name: "Создать", exact: true }).click();
  const categoryResponse = await categoryResponsePromise;
  const categoryBody: unknown = await categoryResponse.json();
  if (
    typeof categoryBody === "object" &&
    categoryBody !== null &&
    "id" in categoryBody &&
    typeof categoryBody.id === "string"
  ) {
    testData.registerCategory(categoryBody.id);
  }

  const category = page.getByRole("region", {
    name: categoryName,
    exact: true,
  });
  await expect(category).toBeVisible();

  await page
    .getByRole("button", { name: "Новая категория", exact: true })
    .click();
  await page.getByLabel("Название", { exact: true }).fill(subcategoryName);
  await page
    .getByLabel("Родительская категория", { exact: true })
    .selectOption({ label: categoryName });
  const subcategoryResponsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === "/api/categories" &&
      response.request().method() === "POST"
    );
  });
  await page.getByRole("button", { name: "Создать", exact: true }).click();
  const subcategoryResponse = await subcategoryResponsePromise;
  const subcategoryBody: unknown = await subcategoryResponse.json();
  if (
    typeof subcategoryBody === "object" &&
    subcategoryBody !== null &&
    "id" in subcategoryBody &&
    typeof subcategoryBody.id === "string"
  ) {
    testData.registerCategory(subcategoryBody.id);
  }

  await expect(
    page.getByRole("heading", { name: categoryName, level: 2 }),
  ).toBeVisible();
  await expect(
    category.getByRole("heading", { name: subcategoryName, level: 3 }),
  ).toBeVisible();

  // Heading-level order check across the whole main region: consecutive
  // headings must never jump more than one level at a time (e.g. h2 -> h4),
  // which is how a skipped/orphan heading level would show up here.
  const headingLevels = await page
    .locator("main h1, main h2, main h3, main h4, main h5, main h6")
    .evaluateAll((elements) =>
      elements.map((element) => Number(element.tagName.slice(1))),
    );
  for (let i = 1; i < headingLevels.length; i += 1) {
    expect(headingLevels[i] - headingLevels[i - 1]).toBeLessThanOrEqual(1);
  }

  await expectNoBlockingAxeViolations(page);
});

test("NativeSelect in the category form has zero serious or critical accessibility violations", async ({
  page,
}) => {
  await login(page);
  await page.goto("/bookmarks");
  await page
    .getByRole("button", { name: "Новая категория", exact: true })
    .click();

  await expect(
    page.getByLabel("Родительская категория", { exact: true }),
  ).toBeVisible();
  await expectNoBlockingAxeViolations(page, '[data-slot="dialog-content"]');
});

test("Service form and active checkbox have zero serious or critical accessibility violations", async ({
  page,
}) => {
  await login(page);
  await page.goto("/services");
  await page.getByRole("button", { name: "Новый сервис", exact: true }).click();

  await expect(
    page.getByRole("checkbox", {
      name: "Активен (проверять по расписанию)",
      exact: true,
    }),
  ).toBeVisible();
  await expectNoBlockingAxeViolations(page, '[data-slot="dialog-content"]');
});

test("Server power AlertDialog has zero serious or critical accessibility violations", async ({
  page,
}) => {
  await login(page);
  await page.route("**/api/servers", async (route) => {
    if (new URL(route.request().url()).pathname !== "/api/servers") {
      await route.continue();
      return;
    }
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        servers: [
          {
            localServerId: "a11y-server",
            origin: "provider",
            providerCredentialId: "a11y-cred",
            providerId: "a11y-provider",
            remoteServerId: "a11y-server",
            providerAvailability: "present",
            powerActionsAvailable: true,
            metrics: {
              state: "not_configured",
              receivedAt: null,
              cpuUsagePercent: null,
              load1: null,
              load5: null,
              load15: null,
              memoryTotalBytes: null,
              memoryAvailableBytes: null,
              swapTotalBytes: null,
              swapFreeBytes: null,
              filesystemTotalBytes: null,
              filesystemAvailableBytes: null,
              uptimeSeconds: null,
            },
            name: "a11y-server",
            type: "cx22",
            status: "running",
            ip: "192.0.2.10",
            cpu: "2 vCPU",
            ram: "4 GB",
            disk: "40 GB",
            os: "Linux",
            location: "Test Region",
          },
        ],
        providerErrors: [],
      }),
    });
  });
  await page.goto("/servers");

  const card = page.getByRole("group", { name: "Сервер «a11y-server»" });
  await expect(card).toBeVisible();
  await card.getByRole("button", { name: "Остановить", exact: true }).click();
  await expect(
    page.getByRole("alertdialog", { name: "Остановить «a11y-server»?" }),
  ).toBeVisible();
  await expectNoBlockingAxeViolations(
    page,
    '[data-slot="alert-dialog-content"]',
  );
});

test("Expanded log row has zero serious or critical accessibility violations", async ({
  page,
}) => {
  await login(page);
  await page.route("**/api/logs?*", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        items: [
          {
            id: "a11y-log",
            level: "warning",
            source: "a11y-test",
            message: "Deterministic expanded log details",
            timestamp: "2026-07-17T10:00:00.000Z",
          },
        ],
        nextCursor: null,
      }),
    });
  });
  await page.goto("/logs");

  const expand = page.locator('button[aria-controls="a11y-log-detail"]');
  await expect(expand).toBeVisible();
  await expect(expand).toHaveAccessibleName("Показать детали записи журнала");
  await expand.click();
  await expect(expand).toHaveAttribute("aria-expanded", "true");
  await expect(expand).toHaveAccessibleName("Скрыть детали записи журнала");
  await expect(
    page.getByText("Deterministic expanded log details").last(),
  ).toBeVisible();
  await expectNoBlockingAxeViolations(page, "main");
});

test.describe("mobile migrated controls", () => {
  test.use({ viewport: { width: 375, height: 800 } });

  test("Messages composer and open channel Sheet have zero serious or critical accessibility violations", async ({
    page,
  }) => {
    await login(page);
    await page.route("**/api/message-categories", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify([
          {
            id: "a11y-category",
            name: "A11y category",
            channels: [
              {
                id: "a11y-channel",
                messageCategoryId: "a11y-category",
                name: "a11y-channel",
              },
            ],
          },
        ]),
      });
    });
    await page.route(
      "**/api/channels/a11y-channel/messages?*",
      async (route) => {
        await route.fulfill({
          contentType: "application/json",
          body: JSON.stringify({ items: [], nextCursor: null }),
        });
      },
    );
    await page.goto("/messages");

    const openChannels = page.getByRole("button", {
      name: "Открыть каналы",
      exact: true,
    });
    await expect(openChannels).toBeVisible();
    await openChannels.click();
    const sheet = page.locator('[data-slot="sheet-content"]');
    await expect(sheet).toBeVisible();
    await expectNoBlockingAxeViolations(page, '[data-slot="sheet-content"]');

    await sheet
      .getByRole("button", { name: "a11y-channel", exact: true })
      .click();
    const composer = page.getByPlaceholder("Написать в #a11y-channel...");
    await expect(composer).toBeVisible();
    await expectNoBlockingAxeViolations(page);
  });
});
