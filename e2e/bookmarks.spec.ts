import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures/test";
import { login } from "./utils/auth";

type RegisterCategory = (id: string) => void;

test.beforeEach(async ({ page }) => {
  await login(page);
});

function categorySection(page: Page, categoryName: string) {
  return page.getByRole("region", { name: categoryName, exact: true });
}

function bookmarkArticle(page: Page, bookmarkName: string) {
  return page.getByRole("article", { name: bookmarkName, exact: true });
}

async function createCategory(
  page: Page,
  name: string,
  registerCategory: RegisterCategory,
) {
  await page
    .getByRole("button", { name: "Новая категория", exact: true })
    .click();
  await page.getByLabel("Name", { exact: true }).fill(name);

  const responsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === "/api/categories" &&
      response.request().method() === "POST"
    );
  });
  await page.getByRole("button", { name: "Create", exact: true }).click();
  const response = await responsePromise;

  const body: unknown = await response.json();
  const categoryId =
    typeof body !== "object" ||
    body === null ||
    !("id" in body) ||
    typeof body.id !== "string" ||
    body.id.trim().length === 0
      ? null
      : body.id;
  if (categoryId) {
    registerCategory(categoryId);
  }

  expect(response.status()).toBe(201);
  expect(body).toEqual({
    id: expect.stringMatching(/\S/),
    name,
  });
  if (!categoryId) {
    throw new Error(
      "Category POST response must contain a non-empty string id.",
    );
  }

  await expect(categorySection(page, name)).toBeVisible();
  return categoryId;
}

async function createBookmark(
  page: Page,
  categoryName: string,
  fields: { name: string; url: string },
) {
  await categorySection(page, categoryName)
    .getByRole("button", { name: "Добавить", exact: true })
    .click();
  await page.getByLabel("Name", { exact: true }).fill(fields.name);
  await page.getByLabel("URL", { exact: true }).fill(fields.url);
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await expect(
    categorySection(page, categoryName).getByRole("article", {
      name: fields.name,
      exact: true,
    }),
  ).toBeVisible();
}

test("AC-BM-014: empty state prompts to create the first category (no error)", async ({
  page,
}) => {
  await expect(
    page.getByRole("heading", { name: "Нет закладок" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Создать категорию", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("region")).toHaveCount(0);
});

test("AC-BM-001: creating a category persists it and it appears without a full reload", async ({
  page,
  testData,
}) => {
  const categoryName = testData.name("Infrastructure");
  await createCategory(page, categoryName, testData.registerCategory);
  await expect(categorySection(page, categoryName)).toBeVisible();
});

test("AC-BM-005: submitting an empty category name shows a validation error and creates nothing", async ({
  page,
}) => {
  await page
    .getByRole("button", { name: "Новая категория", exact: true })
    .click();
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await expect(page.getByText("Category name is required.")).toBeVisible();
  await expect(page.getByRole("region")).toHaveCount(0);
});

test("AC-BM-002: renaming a category persists and displays the new name", async ({
  page,
  testData,
}) => {
  const oldName = testData.name("Old Name");
  const newName = testData.name("New Name");
  await createCategory(page, oldName, testData.registerCategory);

  await categorySection(page, oldName)
    .getByRole("button", {
      name: `Действия категории «${oldName}»`,
      exact: true,
    })
    .click();
  await page
    .getByRole("menuitem", { name: "Переименовать категорию", exact: true })
    .click();
  await page.getByLabel("Name", { exact: true }).fill(newName);
  await page.getByRole("button", { name: "Save", exact: true }).click();

  await expect(categorySection(page, newName)).toBeVisible();
  await expect(categorySection(page, oldName)).toHaveCount(0);
});

test("AC-BM-006: creating a bookmark shows it in its category without a full reload", async ({
  page,
  testData,
}) => {
  const categoryName = testData.name("Dev Tools");
  const bookmarkName = testData.name("Grafana");
  await createCategory(page, categoryName, testData.registerCategory);
  await createBookmark(page, categoryName, {
    name: bookmarkName,
    url: testData.localUrl(`/settings?bookmark=${testData.suffix}`),
  });

  await expect(bookmarkArticle(page, bookmarkName)).toBeVisible();
});

test("AC-BM-007: bookmark create without name/url shows a validation error, nothing created", async ({
  page,
  testData,
}) => {
  const categoryName = testData.name("Validation Cat");
  await createCategory(page, categoryName, testData.registerCategory);

  const category = categorySection(page, categoryName);
  await category.getByRole("button", { name: "Добавить", exact: true }).click();
  await page.getByRole("button", { name: "Create", exact: true }).click();

  await expect(page.getByText("Bookmark name is required.")).toBeVisible();
  await expect(page.getByText("URL is required.")).toBeVisible();
  await expect(category.getByRole("article")).toHaveCount(0);

  await page.goto("/bookmarks");
  const reloadedCategory = categorySection(page, categoryName);
  await expect(reloadedCategory).toBeVisible();
  await expect(reloadedCategory.getByRole("article")).toHaveCount(0);
});

test("AC-BM-008: an invalid (non-http/https) URL shows a validation error and is not persisted", async ({
  page,
  testData,
}) => {
  const categoryName = testData.name("URL Validation Cat");
  const bookmarkName = testData.name("Bad Link");
  await createCategory(page, categoryName, testData.registerCategory);

  const category = categorySection(page, categoryName);
  await category.getByRole("button", { name: "Добавить", exact: true }).click();
  await page.getByLabel("Name", { exact: true }).fill(bookmarkName);
  await page.getByLabel("URL", { exact: true }).fill("not-a-url");
  await page.getByRole("button", { name: "Create", exact: true }).click();

  await expect(
    page.getByText("Enter a valid http:// or https:// URL."),
  ).toBeVisible();
  await expect(
    category.getByRole("article", { name: bookmarkName, exact: true }),
  ).toHaveCount(0);

  await page.goto("/bookmarks");
  const reloadedCategory = categorySection(page, categoryName);
  await expect(reloadedCategory).toBeVisible();
  await expect(
    reloadedCategory.getByRole("article", { name: bookmarkName, exact: true }),
  ).toHaveCount(0);
});

test("AC-BM-009: editing a bookmark persists name/url/category changes", async ({
  page,
  testData,
}) => {
  const sourceCategory = testData.name("Source Cat");
  const targetCategory = testData.name("Target Cat");
  const originalName = testData.name("GitHub");
  const editedName = testData.name("GitHub Work");
  const originalUrl = testData.localUrl(
    `/settings?bookmark=original-${testData.suffix}`,
  );
  const editedUrl = testData.localUrl(
    `/settings?bookmark=edited-${testData.suffix}`,
  );

  await createCategory(page, sourceCategory, testData.registerCategory);
  await createCategory(page, targetCategory, testData.registerCategory);
  await createBookmark(page, sourceCategory, {
    name: originalName,
    url: originalUrl,
  });

  await bookmarkArticle(page, originalName)
    .getByRole("button", {
      name: `Действия закладки «${originalName}»`,
      exact: true,
    })
    .click();
  await page.getByRole("menuitem", { name: "Изменить", exact: true }).click();
  await page.getByLabel("Name", { exact: true }).fill(editedName);
  await page.getByLabel("URL", { exact: true }).fill(editedUrl);
  await page
    .getByLabel("Category", { exact: true })
    .selectOption({ label: targetCategory });
  await page.getByRole("button", { name: "Save changes", exact: true }).click();

  const editedArticle = categorySection(page, targetCategory).getByRole(
    "article",
    { name: editedName, exact: true },
  );
  await expect(editedArticle).toBeVisible();
  await expect(
    editedArticle.getByRole("link", { name: editedName, exact: true }),
  ).toHaveAttribute("href", editedUrl);
  await expect(
    categorySection(page, sourceCategory).getByRole("article", {
      name: originalName,
      exact: true,
    }),
  ).toHaveCount(0);
});

test("AC-BM-010: deleting a bookmark removes it from the list without a full reload", async ({
  page,
  testData,
}) => {
  const categoryName = testData.name("Deletable Cat");
  const bookmarkName = testData.name("Temp Link");
  await createCategory(page, categoryName, testData.registerCategory);
  await createBookmark(page, categoryName, {
    name: bookmarkName,
    url: testData.localUrl(`/settings?bookmark=${testData.suffix}`),
  });

  await bookmarkArticle(page, bookmarkName)
    .getByRole("button", {
      name: `Действия закладки «${bookmarkName}»`,
      exact: true,
    })
    .click();
  await page.getByRole("menuitem", { name: "Удалить", exact: true }).click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();

  await expect(bookmarkArticle(page, bookmarkName)).toHaveCount(0);
});

test("AC-BM-011: a bookmark without an icon shows a deterministic fallback, never a broken image", async ({
  page,
  testData,
}) => {
  const categoryName = testData.name("Icon Fallback Cat");
  const bookmarkName = testData.name("No Icon Bookmark");
  await createCategory(page, categoryName, testData.registerCategory);
  await createBookmark(page, categoryName, {
    name: bookmarkName,
    url: testData.localUrl(`/settings?bookmark=${testData.suffix}`),
  });

  const article = bookmarkArticle(page, bookmarkName);
  await expect(article.locator("img")).toHaveCount(0);
  await expect(article.getByText("NI", { exact: true })).toBeVisible();
});

test("AC-BM-012: bookmarks are displayed grouped under their category", async ({
  page,
  testData,
}) => {
  const categoryA = testData.name("Grouped Cat A");
  const categoryB = testData.name("Grouped Cat B");
  const bookmarkA = testData.name("Bookmark A");
  const bookmarkB = testData.name("Bookmark B");

  await createCategory(page, categoryA, testData.registerCategory);
  await createBookmark(page, categoryA, {
    name: bookmarkA,
    url: testData.localUrl(`/settings?bookmark=a-${testData.suffix}`),
  });
  await createCategory(page, categoryB, testData.registerCategory);
  await createBookmark(page, categoryB, {
    name: bookmarkB,
    url: testData.localUrl(`/settings?bookmark=b-${testData.suffix}`),
  });

  await expect(
    categorySection(page, categoryA).getByRole("article", {
      name: bookmarkA,
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    categorySection(page, categoryB).getByRole("article", {
      name: bookmarkB,
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    categorySection(page, categoryB).getByRole("article", {
      name: bookmarkA,
      exact: true,
    }),
  ).toHaveCount(0);
});

test("AC-BM-013: activating a bookmark opens its same-origin URL in a new tab", async ({
  page,
  testData,
}) => {
  const categoryName = testData.name("New Tab Cat");
  const bookmarkName = testData.name("Open Me");
  const targetUrl = testData.localUrl(
    `/settings?from-bookmark=${testData.suffix}`,
  );
  await createCategory(page, categoryName, testData.registerCategory);
  await createBookmark(page, categoryName, {
    name: bookmarkName,
    url: targetUrl,
  });

  const popupPromise = page.waitForEvent("popup");
  await bookmarkArticle(page, bookmarkName)
    .getByRole("link", { name: bookmarkName, exact: true })
    .click();
  const popup = await popupPromise;

  await popup.waitForURL(targetUrl);
  expect(popup.url()).toBe(targetUrl);
});

test("AC-BM-003/004: deleting a category with bookmarks warns, then cascades on confirm", async ({
  page,
  testData,
}) => {
  const categoryName = testData.name("Cascade Cat");
  const bookmarkName = testData.name("Cascade Bookmark");
  await createCategory(page, categoryName, testData.registerCategory);
  await createBookmark(page, categoryName, {
    name: bookmarkName,
    url: testData.localUrl(`/settings?bookmark=${testData.suffix}`),
  });

  await categorySection(page, categoryName)
    .getByRole("button", {
      name: `Действия категории «${categoryName}»`,
      exact: true,
    })
    .click();
  await page
    .getByRole("menuitem", { name: "Удалить категорию", exact: true })
    .click();
  await expect(page.getByText(/contains 1 bookmark/i)).toBeVisible();
  await page
    .getByRole("button", { name: "Delete category", exact: true })
    .click();

  await expect(categorySection(page, categoryName)).toHaveCount(0);
  await expect(bookmarkArticle(page, bookmarkName)).toHaveCount(0);
});
