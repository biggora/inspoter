import { test, expect, type Page } from "@playwright/test";
import { login } from "./utils/auth";

// AC-BM-001..014 (design.md §3.3). Mode B: backend/frontend are implemented.
//
// Tests are ordered so the empty-state assertion (AC-BM-014, which requires
// zero categories/bookmarks) runs before any test creates data — this file
// runs sequentially within its own worker (no `fullyParallel`), so ordering
// is stable.

test.beforeEach(async ({ page }) => {
  await login(page);
  await page.goto("/bookmarks");
});

async function createCategory(page: Page, name: string) {
  await page.getByRole("button", { name: /new category/i }).click();
  await page.getByLabel(/^name$/i).fill(name);
  await page.getByRole("button", { name: /^create$/i }).click();
}

/** The <section> that hosts a given category's heading + its bookmark grid
 * (category-section.tsx renders both under one `<section aria-labelledby>`).
 * Scoping through this — rather than the heading's immediate DOM parent, or
 * an unscoped page-wide `.first()` — is required: a plain `.locator("..")`
 * on the heading only reaches the header row (heading + overflow menu), not
 * the sibling grid that holds the bookmark cards. */
function categorySection(page: Page, categoryName: string) {
  return page.locator("section").filter({
    has: page.getByRole("heading", { name: categoryName, exact: true }),
  });
}

/** Creates a bookmark via the target category's OWN "Add bookmark" ghost
 * card (never an unscoped `.first()` — with more than one category section
 * rendered, `.first()` silently targets whichever category happens to be
 * first on the page, not the intended one; this was a real bug caught while
 * running this suite in Mode B, see the dispatch report). */
async function createBookmark(
  page: Page,
  categoryName: string,
  fields: { name: string; url: string },
) {
  await categorySection(page, categoryName)
    .getByRole("button", { name: /add bookmark/i })
    .click();
  await page.getByLabel(/^name$/i).fill(fields.name);
  await page.getByLabel(/^url$/i).fill(fields.url);
  await page.getByRole("button", { name: /^create$/i }).click();
}

test("AC-BM-014: empty state prompts to create the first category (no error)", async ({
  page,
}) => {
  await expect(page.getByText(/no bookmarks yet/i)).toBeVisible();
  await expect(
    page.getByRole("button", { name: /create category/i }),
  ).toBeVisible();
});

test("AC-BM-001: creating a category persists it and it appears without a full reload", async ({
  page,
}) => {
  await createCategory(page, "Infrastructure");
  await expect(
    page.getByRole("heading", { name: "Infrastructure" }),
  ).toBeVisible();
});

test("AC-BM-005: submitting an empty category name shows a validation error and creates nothing", async ({
  page,
}) => {
  await page.getByRole("button", { name: /new category/i }).click();
  await page.getByRole("button", { name: /^create$/i }).click();
  await expect(page.getByText(/category name is required/i)).toBeVisible();
});

test("AC-BM-002: renaming a category persists and displays the new name", async ({
  page,
}) => {
  await createCategory(page, "Old Name");
  await categorySection(page, "Old Name")
    .getByRole("button", { name: /more options/i })
    .first()
    .click();
  await page.getByRole("menuitem", { name: /rename/i }).click();
  await page.getByLabel(/^name$/i).fill("New Name");
  await page.getByRole("button", { name: /^save$/i }).click();
  await expect(page.getByRole("heading", { name: "New Name" })).toBeVisible();
});

test("AC-BM-006: creating a bookmark shows it in its category without a full reload", async ({
  page,
}) => {
  await createCategory(page, "Dev Tools");
  await createBookmark(page, "Dev Tools", {
    name: "Grafana",
    url: "https://grafana.example.com",
  });
  await expect(
    categorySection(page, "Dev Tools").getByText("Grafana"),
  ).toBeVisible();
});

test("AC-BM-007: bookmark create without name/url shows a validation error, nothing created", async ({
  page,
}) => {
  await createCategory(page, "Validation Cat");
  await categorySection(page, "Validation Cat")
    .getByRole("button", { name: /add bookmark/i })
    .click();
  await page.getByRole("button", { name: /^create$/i }).click();
  await expect(page.getByText(/name is required/i)).toBeVisible();
  await expect(page.getByText(/url is required/i)).toBeVisible();
});

test("AC-BM-008: an invalid (non-http/https) URL shows a validation error", async ({
  page,
}) => {
  await createCategory(page, "URL Validation Cat");
  await categorySection(page, "URL Validation Cat")
    .getByRole("button", { name: /add bookmark/i })
    .click();
  await page.getByLabel(/^name$/i).fill("Bad Link");
  await page.getByLabel(/^url$/i).fill("not-a-url");
  await page.getByRole("button", { name: /^create$/i }).click();
  await expect(page.getByText(/enter a valid http/i)).toBeVisible();
});

test("AC-BM-009: editing a bookmark persists name/url/category changes", async ({
  page,
}) => {
  await createCategory(page, "Source Cat");
  await createCategory(page, "Target Cat");
  await createBookmark(page, "Source Cat", {
    name: "GitHub",
    url: "https://github.com",
  });

  await categorySection(page, "Source Cat")
    .getByText("GitHub")
    .locator("..")
    .getByRole("button", { name: /more options/i })
    .click();
  await page.getByRole("menuitem", { name: /^edit$/i }).click();
  await page.getByLabel(/^name$/i).fill("GitHub (work)");
  await page.getByLabel(/^category$/i).selectOption({ label: "Target Cat" });
  await page.getByRole("button", { name: /save changes/i }).click();

  await expect(
    categorySection(page, "Target Cat").getByText("GitHub (work)"),
  ).toBeVisible();
});

test("AC-BM-010: deleting a bookmark removes it from the list without a full reload", async ({
  page,
}) => {
  await createCategory(page, "Deletable Cat");
  await createBookmark(page, "Deletable Cat", {
    name: "Temp Link",
    url: "https://temp.example.com",
  });

  await categorySection(page, "Deletable Cat")
    .getByText("Temp Link")
    .locator("..")
    .getByRole("button", { name: /more options/i })
    .click();
  await page.getByRole("menuitem", { name: /^delete$/i }).click();
  await page.getByRole("button", { name: /^delete$/i }).click();

  await expect(page.getByText("Temp Link")).toHaveCount(0);
});

test("AC-BM-011: a bookmark without an icon shows a deterministic fallback, never a broken image", async ({
  page,
}) => {
  await createCategory(page, "Icon Fallback Cat");
  await createBookmark(page, "Icon Fallback Cat", {
    name: "No Icon Bookmark",
    url: "https://example.com",
  });

  const card = categorySection(page, "Icon Fallback Cat")
    .getByText("No Icon Bookmark")
    .locator("..");
  await expect(card.locator("img[alt]:not([src])")).toHaveCount(0);
  await expect(card.getByText(/^N$/)).toBeVisible();
});

test("AC-BM-012: bookmarks are displayed grouped under their category", async ({
  page,
}) => {
  await createCategory(page, "Grouped Cat A");
  await createBookmark(page, "Grouped Cat A", {
    name: "Bookmark A",
    url: "https://a.example.com",
  });
  await createCategory(page, "Grouped Cat B");
  await createBookmark(page, "Grouped Cat B", {
    name: "Bookmark B",
    url: "https://b.example.com",
  });

  await expect(
    categorySection(page, "Grouped Cat A").getByText("Bookmark A"),
  ).toBeVisible();
  await expect(
    categorySection(page, "Grouped Cat B").getByText("Bookmark B"),
  ).toBeVisible();
  // Cross-check the negative: A's bookmark must not leak into B's section.
  await expect(
    categorySection(page, "Grouped Cat B").getByText("Bookmark A"),
  ).toHaveCount(0);
});

test("AC-BM-013: activating a bookmark opens its URL in a new tab", async ({
  page,
  context,
}) => {
  await createCategory(page, "New Tab Cat");
  await createBookmark(page, "New Tab Cat", {
    name: "Open Me",
    url: "https://example.com/open-me",
  });

  const [popup] = await Promise.all([
    context.waitForEvent("page"),
    categorySection(page, "New Tab Cat")
      .getByRole("link", { name: /open me/i })
      .click(),
  ]);
  await popup.waitForLoadState();
  expect(popup.url()).toContain("example.com/open-me");
});

test("AC-BM-003/004: deleting a category with bookmarks warns, then cascades on confirm", async ({
  page,
}) => {
  await createCategory(page, "Cascade Cat");
  await createBookmark(page, "Cascade Cat", {
    name: "Cascade Bookmark",
    url: "https://cascade.example.com",
  });

  // .first(): category-section.tsx renders the category's own overflow
  // button in the header row BEFORE the bookmark cards' own "More options"
  // buttons, so within this section's DOM order the category-level trigger
  // is always first — the category and its one bookmark both expose a
  // same-named "More options" button, so an unscoped match here is
  // ambiguous (caught as a real strict-mode violation while running this
  // suite).
  await categorySection(page, "Cascade Cat")
    .getByRole("button", { name: /more options/i })
    .first()
    .click();
  await page.getByRole("menuitem", { name: /delete category/i }).click();
  await expect(page.getByText(/contains 1 bookmark/i)).toBeVisible();

  await page.getByRole("button", { name: /delete category/i }).click();

  await expect(page.getByRole("heading", { name: "Cascade Cat" })).toHaveCount(
    0,
  );
  await expect(page.getByText("Cascade Bookmark")).toHaveCount(0);
});
