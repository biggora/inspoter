import { expect, test } from "./fixtures/test";
import AxeBuilder from "@axe-core/playwright";
import { login } from "./utils/auth";

// NFR-A11Y-001 / M-8 (design.md §8): automated axe pass, zero critical
// violations on Login, Shell, and Bookmarks. Each test first asserts the
// screen actually rendered (heading/landmark visible) before running axe —
// so a missing page fails on that assertion, not by silently running axe
// against an unrelated 404/error page.

test("Login screen has zero critical accessibility violations", async ({
  page,
}) => {
  await page.goto("/login");
  await expect(
    page.getByRole("heading", { name: "Войти", exact: true }),
  ).toBeVisible();

  const results = await new AxeBuilder({ page }).analyze();
  const critical = results.violations.filter((v) => v.impact === "critical");
  expect(critical).toEqual([]);
});

test("Shell + Bookmarks screen has zero critical accessibility violations", async ({
  page,
}) => {
  await login(page);
  await page.goto("/bookmarks");
  await expect(page.getByRole("navigation")).toBeVisible();

  const results = await new AxeBuilder({ page }).analyze();
  const critical = results.violations.filter((v) => v.impact === "critical");
  expect(critical).toEqual([]);
});

test("Bookmark dialog with the color picker open has zero critical accessibility violations", async ({
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
    page.getByRole("radiogroup", { name: "Цвет", exact: true }),
  ).toBeVisible();

  const results = await new AxeBuilder({ page })
    .include('[data-slot="dialog-content"]')
    .analyze();
  const critical = results.violations.filter((v) => v.impact === "critical");
  expect(critical).toEqual([]);
});

test("Bookmarks search input and no-results state have zero critical accessibility violations", async ({
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

  const results = await new AxeBuilder({ page }).analyze();
  const critical = results.violations.filter((v) => v.impact === "critical");
  expect(critical).toEqual([]);
});

test("Bookmark drag handle, focused, has zero critical accessibility violations", async ({
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

  const results = await new AxeBuilder({ page }).analyze();
  const critical = results.violations.filter((v) => v.impact === "critical");
  expect(critical).toEqual([]);
});

test("Bookmarks screen with a subcategory has correct heading levels (h2 parent / h3 subcategory, no skipped level) and zero critical accessibility violations", async ({
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

  const results = await new AxeBuilder({ page }).analyze();
  const critical = results.violations.filter((v) => v.impact === "critical");
  expect(critical).toEqual([]);
});
