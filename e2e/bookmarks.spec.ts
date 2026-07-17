import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./fixtures/test";
import { login } from "./utils/auth";

type RegisterCategory = (id: string) => void;

test.beforeEach(async ({ page }) => {
  await login(page);
});

function categorySection(page: Page, categoryName: string) {
  return page.getByRole("region", { name: categoryName, exact: true });
}

function categoryRegions(page: Page) {
  return page.locator("main section[aria-labelledby]");
}

function bookmarkArticle(page: Page, bookmarkName: string) {
  return page.getByRole("article", { name: bookmarkName, exact: true });
}

// DOM order of bookmark `<article aria-label>`s within a category section —
// used by the reorder tests below to assert the post-drag/keyboard order,
// since CSS grid placement never reorders the underlying DOM.
function articleAriaLabels(section: Locator) {
  return section
    .getByRole("article")
    .evaluateAll((elements) =>
      elements.map((el) => el.getAttribute("aria-label")),
    );
}

// DOM order of top-level category `<section aria-labelledby>` headings.
function categoryHeadingNames(page: Page) {
  return categoryRegions(page).evaluateAll((elements) =>
    elements.map((el) => {
      const headingId = el.getAttribute("aria-labelledby");
      const heading = headingId ? document.getElementById(headingId) : null;
      return heading?.textContent ?? null;
    }),
  );
}

// dnd-kit's `KeyboardSensor.attach()` defers registering its directional
// keydown listener via a bare `setTimeout(fn)` (0ms) issued from inside the
// pickup (Space) keydown handler itself. A direction key sent immediately
// after pickup can race that timer and be silently dropped, which resolves
// the whole pick-up/drop cycle as a same-id no-op (no reorder API call) —
// this has been observed empirically to be timing-sensitive in headless CI.
// Retrying the whole pick-up/move/drop cycle (each attempt is a fresh,
// independent keyboard interaction; a no-op attempt leaves the DOM
// unchanged) is the deterministic way to assert on the eventual, real
// user-observable outcome without coupling the test to an exact delay.
async function keyboardReorderRight(page: Page, handle: Locator) {
  const attempts = 8;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const responsePromise = page
      .waitForResponse(
        (response) => {
          const url = new URL(response.url());
          return (
            url.pathname === "/api/bookmarks/reorder" &&
            response.request().method() === "PATCH"
          );
        },
        { timeout: 1000 },
      )
      .catch(() => null);

    await handle.focus();
    await page.keyboard.press("Space");
    // Give the deferred `setTimeout(fn)` (0ms) listener-attachment (above)
    // a real head start before sending the direction key — empirically,
    // sending it with no pause loses this race with very high probability
    // in headless CI, where a `page.keyboard.press` round-trip can be
    // faster than the browser's own next macrotask.
    await page.waitForTimeout(250);
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("Space");

    const response = await responsePromise;
    if (response) return response;
  }
  throw new Error(
    `Keyboard reorder never triggered PATCH /api/bookmarks/reorder after ${attempts} attempts.`,
  );
}

// Mirrors `keyboardReorderRight` above: dnd-kit's `PointerSensor` has not
// shown the same listener-attachment race, but the raw `page.mouse`
// gesture that stands in for a real drag has still been observed to be
// intermittently timing-sensitive in headless CI (an under-threshold or
// mis-timed move can resolve as a same-id no-op). Retrying the whole
// press/move/release gesture asserts on the real, eventual outcome.
async function mouseReorderCategory(
  page: Page,
  start: { x: number; y: number },
  target: { x: number; y: number },
) {
  const attempts = 5;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const responsePromise = page
      .waitForResponse(
        (response) => {
          const url = new URL(response.url());
          return (
            url.pathname === "/api/categories/reorder" &&
            response.request().method() === "PATCH"
          );
        },
        { timeout: 2000 },
      )
      .catch(() => null);

    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.waitForTimeout(50);
    await page.mouse.move(start.x, start.y - 20, { steps: 5 });
    await page.waitForTimeout(50);
    await page.mouse.move(target.x, target.y, { steps: 10 });
    await page.waitForTimeout(50);
    await page.mouse.up();

    const response = await responsePromise;
    if (response) return response;
  }
  throw new Error(
    `Mouse reorder never triggered PATCH /api/categories/reorder after ${attempts} attempts.`,
  );
}

async function createCategory(
  page: Page,
  name: string,
  registerCategory: RegisterCategory,
) {
  await page
    .getByRole("button", { name: "Новая категория", exact: true })
    .click();
  await page.getByLabel("Название", { exact: true }).fill(name);

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
  await page.getByLabel("Название", { exact: true }).fill(fields.name);
  await page.getByLabel("URL", { exact: true }).fill(fields.url);
  await page.getByRole("button", { name: "Создать", exact: true }).click();
  await expect(
    categorySection(page, categoryName).getByRole("article", {
      name: fields.name,
      exact: true,
    }),
  ).toBeVisible();
}

test("AC-BM-014/021: empty state prompts to create the first category (no error), and no search input is rendered", async ({
  page,
}) => {
  await expect(
    page.getByRole("heading", { name: "Нет закладок" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Создать категорию", exact: true }),
  ).toBeVisible();
  await expect(categoryRegions(page)).toHaveCount(0);
  await expect(page.getByLabel("Поиск закладок")).toHaveCount(0);
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
  await page.getByRole("button", { name: "Создать", exact: true }).click();
  await expect(page.getByText("Название категории обязательно.")).toBeVisible();
  await expect(categoryRegions(page)).toHaveCount(0);
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
  await page.getByLabel("Название", { exact: true }).fill(newName);
  await page.getByRole("button", { name: "Сохранить", exact: true }).click();

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
  await page.getByRole("button", { name: "Создать", exact: true }).click();

  await expect(page.getByText("Название закладки обязательно.")).toBeVisible();
  await expect(page.getByText("URL обязателен.")).toBeVisible();
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
  await page.getByLabel("Название", { exact: true }).fill(bookmarkName);
  await page.getByLabel("URL", { exact: true }).fill("not-a-url");
  await page.getByRole("button", { name: "Создать", exact: true }).click();

  await expect(
    page.getByText(
      "Введите корректный URL, начинающийся с http:// или https://.",
    ),
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
  await page.getByLabel("Название", { exact: true }).fill(editedName);
  await page.getByLabel("URL", { exact: true }).fill(editedUrl);
  await page
    .getByLabel("Категория", { exact: true })
    .selectOption({ label: targetCategory });
  await page
    .getByRole("button", { name: "Сохранить изменения", exact: true })
    .click();

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
  await page.getByRole("button", { name: "Удалить", exact: true }).click();

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

test("AC-BM-015/016/017: choosing a color renders its tone on the icon tile, and clearing it reverts to the deterministic fallback", async ({
  page,
  testData,
}) => {
  const categoryName = testData.name("Color Cat");
  const bookmarkName = testData.name("Colored Bookmark");
  await createCategory(page, categoryName, testData.registerCategory);
  await createBookmark(page, categoryName, {
    name: bookmarkName,
    url: testData.localUrl(`/settings?bookmark=${testData.suffix}`),
  });

  const article = bookmarkArticle(page, bookmarkName);
  const tile = article.locator("span[aria-hidden]").first();
  const defaultClass = await tile.getAttribute("class");
  expect(defaultClass).not.toBeNull();

  async function openEditDialog() {
    await article
      .getByRole("button", {
        name: `Действия закладки «${bookmarkName}»`,
        exact: true,
      })
      .click();
    await page.getByRole("menuitem", { name: "Изменить", exact: true }).click();
  }

  // AC-BM-016: choosing a color renders that color's tone classes.
  await openEditDialog();
  await page.getByRole("button", { name: "Бирюзовый", exact: true }).click();
  await page
    .getByRole("button", { name: "Сохранить изменения", exact: true })
    .click();

  await expect(tile).toHaveClass(/bg-accent-100/);
  await expect(tile).toHaveClass(/text-accent-700/);

  // AC-BM-017: clearing the color reverts to the deterministic hash-based
  // fallback tone captured before any color was ever set.
  await openEditDialog();
  await page.getByRole("button", { name: "Без цвета", exact: true }).click();
  await page
    .getByRole("button", { name: "Сохранить изменения", exact: true })
    .click();

  await expect(tile).toHaveClass(defaultClass ?? "");
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
  await expect(page.getByText(/в этой категории 1 закладка/i)).toBeVisible();
  await page
    .getByRole("button", { name: "Удалить категорию", exact: true })
    .click();

  await expect(categorySection(page, categoryName)).toHaveCount(0);
  await expect(bookmarkArticle(page, bookmarkName)).toHaveCount(0);
});

test("AC-BM-019: typing a query filters visible bookmark cards immediately, case-insensitively", async ({
  page,
  testData,
}) => {
  const categoryName = testData.name("Search Cat");
  const matchName = testData.name("Grafana Dashboard");
  const otherName = testData.name("Portainer");
  await createCategory(page, categoryName, testData.registerCategory);
  await createBookmark(page, categoryName, {
    name: matchName,
    url: testData.localUrl(`/settings?bookmark=match-${testData.suffix}`),
  });
  await createBookmark(page, categoryName, {
    name: otherName,
    url: testData.localUrl(`/settings?bookmark=other-${testData.suffix}`),
  });

  await page
    .getByLabel("Поиск закладок", { exact: true })
    .fill(matchName.toLowerCase());

  await expect(bookmarkArticle(page, matchName)).toBeVisible();
  await expect(bookmarkArticle(page, otherName)).toHaveCount(0);
});

test("AC-BM-020: a query matching nothing shows the no-results state, and clearing it restores the full list", async ({
  page,
  testData,
}) => {
  const categoryName = testData.name("No Match Cat");
  const bookmarkName = testData.name("Existing Bookmark");
  await createCategory(page, categoryName, testData.registerCategory);
  await createBookmark(page, categoryName, {
    name: bookmarkName,
    url: testData.localUrl(`/settings?bookmark=${testData.suffix}`),
  });

  const search = page.getByLabel("Поиск закладок", { exact: true });
  await search.fill("no-such-bookmark-anywhere");

  await expect(
    page.getByRole("heading", { name: "Ничего не найдено", exact: true }),
  ).toBeVisible();
  await expect(bookmarkArticle(page, bookmarkName)).toHaveCount(0);
  await expect(categorySection(page, categoryName)).toHaveCount(0);

  await page
    .getByRole("button", { name: "Сбросить поиск", exact: true })
    .click();

  await expect(search).toHaveValue("");
  await expect(
    page.getByRole("heading", { name: "Ничего не найдено" }),
  ).toHaveCount(0);
  await expect(bookmarkArticle(page, bookmarkName)).toBeVisible();
});

test("AC-BM-019: a query matches on a URL substring, not just name/description", async ({
  page,
  testData,
}) => {
  const categoryName = testData.name("URL Match Cat");
  const bookmarkName = testData.name("Internal Tool");
  const urlToken = `url-token-${testData.suffix}`;
  await createCategory(page, categoryName, testData.registerCategory);
  await createBookmark(page, categoryName, {
    name: bookmarkName,
    url: testData.localUrl(`/settings?${urlToken}=1`),
  });

  await page.getByLabel("Поиск закладок", { exact: true }).fill(urlToken);

  await expect(bookmarkArticle(page, bookmarkName)).toBeVisible();
});

test("AC-BM-022..025: keyboard-only reorder moves a bookmark within a category and persists after reload", async ({
  page,
  testData,
}) => {
  // `keyboardReorderRight` retries a timing-sensitive dnd-kit keyboard
  // interaction (see its definition above) up to 8 times; give this test
  // enough headroom beyond the project's default 20s so a slow run isn't
  // cut off mid-retry.
  test.setTimeout(45_000);
  const categoryName = testData.name("Keyboard Reorder Cat");
  const firstName = testData.name("First Bookmark");
  const secondName = testData.name("Second Bookmark");
  await createCategory(page, categoryName, testData.registerCategory);
  await createBookmark(page, categoryName, {
    name: firstName,
    url: testData.localUrl(`/settings?bookmark=first-${testData.suffix}`),
  });
  await createBookmark(page, categoryName, {
    name: secondName,
    url: testData.localUrl(`/settings?bookmark=second-${testData.suffix}`),
  });

  const category = categorySection(page, categoryName);
  await expect(category.getByRole("article")).toHaveCount(2);
  await expect
    .poll(() => articleAriaLabels(category))
    .toEqual([firstName, secondName]);

  const firstHandle = page.getByRole("button", {
    name: `Изменить порядок: «${firstName}»`,
    exact: true,
  });
  await firstHandle.focus();
  await expect(firstHandle).toBeFocused();

  // This category's bookmark grid is `grid-cols-1 sm:grid-cols-2`, and at
  // the desktop-1440 project's viewport two bookmarks render side by side
  // in a single row. dnd-kit's `sortableKeyboardCoordinates` only offers a
  // Down-direction candidate when a droppable's rect top is strictly below
  // the active rect's top (@dnd-kit/sortable: `rect.top > collisionRect.top`
  // for KeyboardCode.Down) — with both cards sharing the same row, ArrowDown
  // finds no candidate. ArrowRight (`rect.left > collisionRect.left`) is the
  // direction that actually moves the active card onto its same-row sibling
  // — see `keyboardReorderRight` above for why this retries.
  const reorderResponse = await keyboardReorderRight(page, firstHandle);
  expect(reorderResponse.status()).toBe(204);

  await expect
    .poll(() => articleAriaLabels(category))
    .toEqual([secondName, firstName]);

  await page.reload();
  const reloadedCategory = categorySection(page, categoryName);
  await expect(reloadedCategory.getByRole("article")).toHaveCount(2);
  await expect
    .poll(() => articleAriaLabels(reloadedCategory))
    .toEqual([secondName, firstName]);
});

test("AC-BM-022..025: mouse-based reorder moves a category above its sibling and persists after reload", async ({
  page,
  testData,
}) => {
  const categoryA = testData.name("Mouse Reorder Cat A");
  const categoryB = testData.name("Mouse Reorder Cat B");
  await createCategory(page, categoryA, testData.registerCategory);
  await createCategory(page, categoryB, testData.registerCategory);

  await expect
    .poll(() => categoryHeadingNames(page))
    .toEqual([categoryA, categoryB]);

  const sectionA = categorySection(page, categoryA);
  const handleB = categorySection(page, categoryB).getByRole("button", {
    name: `Изменить порядок категории «${categoryB}»`,
    exact: true,
  });

  const sectionABox = await sectionA.boundingBox();
  const handleBBox = await handleB.boundingBox();
  if (!sectionABox || !handleBBox) {
    throw new Error(
      "Expected both category A's section and category B's drag handle to have a bounding box.",
    );
  }

  const startX = handleBBox.x + handleBBox.width / 2;
  const startY = handleBBox.y + handleBBox.height / 2;
  const targetX = sectionABox.x + sectionABox.width / 2;
  const targetY = sectionABox.y + sectionABox.height / 2;

  // dnd-kit's `PointerSensor` requires the pointer to move more than the
  // 4px `activationConstraint.distance` before a drag is armed (see
  // bookmarks-board.tsx sensors config) — `dragTo()` uses native HTML5 DnD
  // and does not work with dnd-kit's pointer-event-based sensors, so this
  // drives raw `page.mouse` events with intermediate steps instead — see
  // `mouseReorderCategory` above for why this retries.
  const reorderResponse = await mouseReorderCategory(
    page,
    { x: startX, y: startY },
    { x: targetX, y: targetY },
  );
  expect(reorderResponse.status()).toBe(204);

  await expect
    .poll(() => categoryHeadingNames(page))
    .toEqual([categoryB, categoryA]);

  await page.reload();
  await expect
    .poll(() => categoryHeadingNames(page))
    .toEqual([categoryB, categoryA]);
});

test("AC-BM-022..025: an active search query disables the bookmark drag handle", async ({
  page,
  testData,
}) => {
  const categoryName = testData.name("Search Disables Drag Cat");
  const bookmarkName = testData.name("Undraggable Bookmark");
  await createCategory(page, categoryName, testData.registerCategory);
  await createBookmark(page, categoryName, {
    name: bookmarkName,
    url: testData.localUrl(`/settings?bookmark=${testData.suffix}`),
  });

  const handle = page.getByRole("button", {
    name: `Изменить порядок: «${bookmarkName}»`,
    exact: true,
  });
  await expect(handle).toBeVisible();
  // Before searching, dnd-kit's `useSortable({ disabled: false })` renders
  // an explicit `aria-disabled="false"` (React always stringifies aria-*
  // attributes rather than omitting them for falsy values).
  await expect(handle).toHaveAttribute("aria-disabled", "false");

  await page.getByLabel("Поиск закладок", { exact: true }).fill(bookmarkName);
  await expect(bookmarkArticle(page, bookmarkName)).toBeVisible();

  // `dragDisabled` (driven by the active search query) flips
  // `useSortable({ disabled: true })`. dnd-kit's `useDraggable` never
  // unmounts the handle button for `disabled: true` — it keeps
  // `role`/`tabIndex` but sets `aria-disabled="true"` and drops the
  // pointer/keyboard `listeners` spread onto the button, making it
  // present-but-inert rather than absent (@dnd-kit/core useDraggable:
  // `'aria-disabled': disabled`, `listeners: disabled ? undefined : listeners`).
  await expect(handle).toHaveAttribute("aria-disabled", "true");
});

// Opens the create-bookmark dialog for `categoryName` and fills
// Название/URL/Иконка, mirroring `createBookmark`'s internal flow but
// additionally setting the icon field (which `createBookmark` doesn't
// support) — a local helper rather than modifying the shared one, since
// other passing tests depend on `createBookmark`'s exact signature.
async function createBookmarkWithIcon(
  page: Page,
  categoryName: string,
  fields: { name: string; url: string; icon: string },
) {
  await categorySection(page, categoryName)
    .getByRole("button", { name: "Добавить", exact: true })
    .click();
  await page.getByLabel("Название", { exact: true }).fill(fields.name);
  await page.getByLabel("URL", { exact: true }).fill(fields.url);
  await page
    .getByLabel("Иконка (необязательно)", { exact: true })
    .fill(fields.icon);
  await page.getByRole("button", { name: "Создать", exact: true }).click();
  await expect(
    categorySection(page, categoryName).getByRole("article", {
      name: fields.name,
      exact: true,
    }),
  ).toBeVisible();
}

test("AC-BM-026: clicking «Подобрать» with a valid URL populates the icon field, and the button is disabled until a valid URL is entered", async ({
  page,
  testData,
}) => {
  const categoryName = testData.name("Favicon Suggest Cat");
  const bookmarkName = testData.name("Suggest Target");
  await createCategory(page, categoryName, testData.registerCategory);

  await categorySection(page, categoryName)
    .getByRole("button", { name: "Добавить", exact: true })
    .click();
  await page.getByLabel("Название", { exact: true }).fill(bookmarkName);

  const urlInput = page.getByLabel("URL", { exact: true });
  const iconInput = page.getByLabel("Иконка (необязательно)", { exact: true });
  // Matched by a name regex (rather than the exact idle-state label) so the
  // locator keeps resolving to the same button once its accessible name
  // switches to the loading label ("Подбор…") — a `name: "Подобрать", exact:
  // true` locator would stop matching anything during that state.
  const suggestButton = page.getByRole("button", {
    name: /^(Подобрать|Подбор…)$/,
  });

  // AC-BM-026: no URL yet — disabled.
  await expect(suggestButton).toBeDisabled();
  // An invalid (non-http/https) URL — still disabled.
  await urlInput.fill("not-a-url");
  await expect(suggestButton).toBeDisabled();

  const suggestedIcon =
    "https://www.google.com/s2/favicons?sz=64&domain=example.com";
  let routeCallCount = 0;
  await page.route("**/api/bookmarks/favicon-suggest**", async (route) => {
    routeCallCount += 1;
    // A11y check: while the request is in flight, the button must still
    // expose a non-empty accessible name ("Подбор…"), never a blank/absent
    // one, so assistive tech announces the busy state.
    await expect(suggestButton).toHaveText("Подбор…");
    // `suggesting` also disables the button while the request is in
    // flight (bookmark-dialog.tsx), but it keeps a non-empty accessible
    // name throughout — that's the a11y property under test here.
    await expect(suggestButton).toBeDisabled();
    await new Promise((resolve) => setTimeout(resolve, 300));
    await route.fulfill({ json: { icon: suggestedIcon } });
  });

  const validUrl = testData.localUrl(
    `/settings?bookmark=suggest-${testData.suffix}`,
  );
  await urlInput.fill(validUrl);
  await expect(suggestButton).toBeEnabled();
  await expect(suggestButton).toHaveText("Подобрать");

  await suggestButton.click();
  await expect(iconInput).toHaveValue(suggestedIcon);
  await expect(suggestButton).toHaveText("Подобрать");
  expect(routeCallCount).toBe(1);
});

test("AC-BM-027: a no-suggestion favicon-suggest response leaves the icon field unchanged and shows a non-blocking notice", async ({
  page,
  testData,
}) => {
  const categoryName = testData.name("Favicon No Suggest Cat");
  const bookmarkName = testData.name("No Suggest Target");
  await createCategory(page, categoryName, testData.registerCategory);

  await categorySection(page, categoryName)
    .getByRole("button", { name: "Добавить", exact: true })
    .click();
  await page.getByLabel("Название", { exact: true }).fill(bookmarkName);

  const urlInput = page.getByLabel("URL", { exact: true });
  const iconInput = page.getByLabel("Иконка (необязательно)", { exact: true });
  const suggestButton = page.getByRole("button", {
    name: "Подобрать",
    exact: true,
  });

  const existingIconValue = "📎";
  await iconInput.fill(existingIconValue);

  await page.route("**/api/bookmarks/favicon-suggest**", async (route) => {
    await route.fulfill({ json: { icon: null } });
  });

  const validUrl = testData.localUrl(
    `/settings?bookmark=no-suggest-${testData.suffix}`,
  );
  await urlInput.fill(validUrl);
  await expect(suggestButton).toBeEnabled();
  await suggestButton.click();

  await expect(
    page.getByText("Не удалось подобрать значок для этого URL.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(iconInput).toHaveValue(existingIconValue);
});

test("AC-BM-028: a bookmark whose icon URL fails to load renders the fallback tile, not a broken image", async ({
  page,
  testData,
}) => {
  const categoryName = testData.name("Icon Load Failure Cat");
  const bookmarkName = testData.name("Broken Icon Bookmark");
  const brokenIconUrl =
    "https://example-nonexistent-favicon-test.invalid/favicon.png";

  await page.route(brokenIconUrl, async (route) => {
    await route.fulfill({ status: 404 });
  });

  await createCategory(page, categoryName, testData.registerCategory);
  await createBookmarkWithIcon(page, categoryName, {
    name: bookmarkName,
    url: testData.localUrl(`/settings?bookmark=${testData.suffix}`),
    icon: brokenIconUrl,
  });

  const article = bookmarkArticle(page, bookmarkName);
  await expect(article.locator("img")).toHaveCount(0);
  await expect(article.getByText("BI", { exact: true })).toBeVisible();
});

// Phase 4 (one level of category nesting): shared low-level "submit the
// open create/rename dialog and register the resulting id" step, factored
// out of `createCategory` above (left untouched, since other passing tests
// depend on its exact behavior) so `createSubcategory` and the "still a
// valid parent" test below don't duplicate the response/registration
// bookkeeping.
async function submitCategoryFormAndRegister(
  page: Page,
  expectedName: string,
  registerCategory: RegisterCategory,
): Promise<string> {
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
    name: expectedName,
  });
  if (!categoryId) {
    throw new Error(
      "Category POST response must contain a non-empty string id.",
    );
  }
  return categoryId;
}

// Opens "Новая категория", picks `parentCategoryName` in the "Родительская
// категория" select, and asserts the resulting subcategory's own
// `<h3>`-headed section renders nested inside its parent's section.
async function createSubcategory(
  page: Page,
  parentCategoryName: string,
  name: string,
  registerCategory: RegisterCategory,
): Promise<string> {
  await page
    .getByRole("button", { name: "Новая категория", exact: true })
    .click();
  await page.getByLabel("Название", { exact: true }).fill(name);
  await page
    .getByLabel("Родительская категория", { exact: true })
    .selectOption({ label: parentCategoryName });

  const categoryId = await submitCategoryFormAndRegister(
    page,
    name,
    registerCategory,
  );

  await expect(
    categorySection(page, parentCategoryName).getByRole("heading", {
      name,
      level: 3,
    }),
  ).toBeVisible();
  return categoryId;
}

test("Phase 4: creating a subcategory nests it inside its parent top-level category's section", async ({
  page,
  testData,
}) => {
  const categoryA = testData.name("Parent Group A");
  const subcategoryName = testData.name("Nested Subcategory");
  await createCategory(page, categoryA, testData.registerCategory);
  await createSubcategory(
    page,
    categoryA,
    subcategoryName,
    testData.registerCategory,
  );

  await expect(
    page.getByRole("heading", { name: subcategoryName, level: 3 }),
  ).toBeVisible();
  await expect(
    categorySection(page, categoryA).getByRole("heading", {
      name: subcategoryName,
      level: 3,
    }),
  ).toBeVisible();
});

test("Phase 4: a subcategory is never offered as a parent option when creating another category", async ({
  page,
  testData,
}) => {
  const categoryA = testData.name("Parent For Filter Test");
  const subcategoryB = testData.name("Subcategory Never A Parent");
  await createCategory(page, categoryA, testData.registerCategory);
  await createSubcategory(
    page,
    categoryA,
    subcategoryB,
    testData.registerCategory,
  );

  await page
    .getByRole("button", { name: "Новая категория", exact: true })
    .click();
  const optionTexts = await page
    .getByLabel("Родительская категория", { exact: true })
    .locator("option")
    .allTextContents();

  expect(optionTexts).not.toContain(subcategoryB);
  expect(optionTexts).toContain(categoryA);
});

test("Phase 4: a top-level category that already has a subcategory is still offered as a parent for another new subcategory", async ({
  page,
  testData,
}) => {
  const categoryA = testData.name("Reusable Parent");
  const subcategoryB = testData.name("First Subcategory");
  const subcategoryC = testData.name("Second Subcategory");
  await createCategory(page, categoryA, testData.registerCategory);
  await createSubcategory(
    page,
    categoryA,
    subcategoryB,
    testData.registerCategory,
  );

  await page
    .getByRole("button", { name: "Новая категория", exact: true })
    .click();
  const parentSelect = page.getByLabel("Родительская категория", {
    exact: true,
  });
  await expect(parentSelect).toBeEnabled();
  const optionTexts = await parentSelect.locator("option").allTextContents();
  expect(optionTexts).toContain(categoryA);

  await page.getByLabel("Название", { exact: true }).fill(subcategoryC);
  await parentSelect.selectOption({ label: categoryA });
  await submitCategoryFormAndRegister(
    page,
    subcategoryC,
    testData.registerCategory,
  );

  const parentSection = categorySection(page, categoryA);
  await expect(
    parentSection.getByRole("heading", { name: subcategoryB, level: 3 }),
  ).toBeVisible();
  await expect(
    parentSection.getByRole("heading", { name: subcategoryC, level: 3 }),
  ).toBeVisible();
});

test("Phase 4: a category with an existing subcategory cannot itself become a subcategory (its own parent field is disabled when editing it)", async ({
  page,
  testData,
}) => {
  const categoryA = testData.name("Cannot Become Child");
  const subcategoryB = testData.name("Existing Child");
  await createCategory(page, categoryA, testData.registerCategory);
  await createSubcategory(
    page,
    categoryA,
    subcategoryB,
    testData.registerCategory,
  );

  await categorySection(page, categoryA)
    .getByRole("button", {
      name: `Действия категории «${categoryA}»`,
      exact: true,
    })
    .click();
  await page
    .getByRole("menuitem", { name: "Переименовать категорию", exact: true })
    .click();

  const parentSelect = page.getByLabel("Родительская категория", {
    exact: true,
  });
  await expect(parentSelect).toBeDisabled();
  await expect(
    page.getByText(/У этой категории есть подкатегории/i),
  ).toBeVisible();
});

test("Phase 4: deleting a top-level category with a subcategory warns of the cascade counts, then removes both levels' bookmarks", async ({
  page,
  testData,
}) => {
  const categoryA = testData.name("Cascade Parent");
  const subcategoryB = testData.name("Cascade Subcategory");
  const bookmarkA = testData.name("Cascade Direct Bookmark");
  const bookmarkB = testData.name("Cascade Nested Bookmark");

  await createCategory(page, categoryA, testData.registerCategory);
  await createBookmark(page, categoryA, {
    name: bookmarkA,
    url: testData.localUrl(`/settings?bookmark=direct-${testData.suffix}`),
  });
  await createSubcategory(
    page,
    categoryA,
    subcategoryB,
    testData.registerCategory,
  );
  await createBookmark(page, subcategoryB, {
    name: bookmarkB,
    url: testData.localUrl(`/settings?bookmark=nested-${testData.suffix}`),
  });

  await categorySection(page, categoryA)
    .getByRole("button", {
      name: `Действия категории «${categoryA}»`,
      exact: true,
    })
    .click();
  await page
    .getByRole("menuitem", { name: "Удалить категорию", exact: true })
    .click();
  await expect(
    page.getByText(
      /в этой категории 1 закладка и 1 подкатегория \(в них ещё 1 закладка\)/i,
    ),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Удалить категорию", exact: true })
    .click();

  await expect(categorySection(page, categoryA)).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: subcategoryB, level: 3 }),
  ).toHaveCount(0);
  await expect(bookmarkArticle(page, bookmarkA)).toHaveCount(0);
  await expect(bookmarkArticle(page, bookmarkB)).toHaveCount(0);
});

test("Phase 4: a bookmark added to a subcategory renders nested inside that subcategory's own section, not the parent's direct grid", async ({
  page,
  testData,
}) => {
  const categoryA = testData.name("Nested Bookmark Parent");
  const subcategoryB = testData.name("Nested Bookmark Subcategory");
  const bookmarkName = testData.name("Deeply Nested Bookmark");

  await createCategory(page, categoryA, testData.registerCategory);
  await createSubcategory(
    page,
    categoryA,
    subcategoryB,
    testData.registerCategory,
  );
  await createBookmark(page, subcategoryB, {
    name: bookmarkName,
    url: testData.localUrl(`/settings?bookmark=${testData.suffix}`),
  });

  await expect(
    categorySection(page, categoryA)
      .getByRole("region", { name: subcategoryB, exact: true })
      .getByRole("article", { name: bookmarkName, exact: true }),
  ).toBeVisible();
});
