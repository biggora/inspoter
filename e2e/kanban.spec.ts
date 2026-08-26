import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./fixtures/test";
import { login } from "./utils/auth";

// Every board this spec creates is torn down in afterEach, so a rerun never
// inherits the previous run's boards. Names are suffixed per test to keep
// parallel workers from colliding on the same board.
let createdBoards: string[] = [];

test.beforeEach(async ({ page }) => {
  createdBoards = [];
  await login(page);
  await page.goto("/kanban");
});

test.afterEach(async ({ page }) => {
  for (const name of createdBoards) {
    await deleteBoard(page, name).catch(() => {});
  }
});

function unique(prefix: string) {
  return `${prefix}-${Math.floor(Math.random() * 1e6)}`;
}

function column(page: Page, name: string) {
  return page.getByRole("region", { name, exact: true });
}

function card(page: Page, title: string) {
  return page.getByRole("article", { name: title, exact: true });
}

/** DOM order of the card titles inside one column. */
function cardTitles(section: Locator) {
  return section
    .getByRole("article")
    .evaluateAll((elements) =>
      elements.map((el) => el.getAttribute("aria-label")),
    );
}

async function createBoard(page: Page, name: string) {
  await page.getByRole("button", { name: "New board", exact: true }).click();
  await page.getByLabel("Name", { exact: true }).fill(name);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(
    page.getByRole("link", { name: `Open board ${name}` }),
  ).toBeVisible();
  createdBoards.push(name);
}

async function openBoard(page: Page, name: string) {
  await page.getByRole("link", { name: `Open board ${name}` }).click();
  await expect(
    page.getByRole("heading", { name, exact: true, level: 1 }),
  ).toBeVisible();
}

async function deleteBoard(page: Page, name: string) {
  await page.goto("/kanban");
  const link = page.getByRole("link", { name: `Open board ${name}` });
  if ((await link.count()) === 0) return;
  const boardCard = page.getByRole("article").filter({ has: link });
  await boardCard.getByRole("button", { name: "Board actions" }).click();
  await page.getByRole("menuitem", { name: "Delete", exact: true }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Delete", exact: true })
    .click();
  await expect(link).toHaveCount(0);
}

async function addCard(page: Page, columnName: string, title: string) {
  await column(page, columnName)
    .getByRole("button", { name: "Add card", exact: true })
    .click();
  await page.getByLabel("Title", { exact: true }).fill(title);
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await expect(card(page, title)).toBeVisible();
}

// dnd-kit's KeyboardSensor attaches its directional listener from a deferred
// `setTimeout(fn)` issued inside the pickup handler, so a direction key sent
// too early is silently dropped and the cycle resolves as a no-op. Retrying
// the whole pick-up/move/drop gesture asserts the eventual outcome without
// pinning the test to an exact delay — the same approach bookmarks.spec.ts
// uses for its reorder tests.
async function keyboardMoveCard(page: Page, handle: Locator, key: string) {
  const attempts = 8;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const responsePromise = page
      .waitForResponse(
        (response) => {
          const url = new URL(response.url());
          return (
            url.pathname === "/api/kanban/cards/move" &&
            response.request().method() === "PATCH"
          );
        },
        { timeout: 1500 },
      )
      .catch(() => null);

    await handle.focus();
    await page.keyboard.press("Space");
    await page.waitForTimeout(250);
    await page.keyboard.press(key);
    await page.keyboard.press("Space");

    const response = await responsePromise;
    if (response) return response;
  }
  throw new Error(
    `Keyboard move never triggered PATCH /api/kanban/cards/move after ${attempts} attempts.`,
  );
}

test.describe("Kanban boards", () => {
  test("creates a board with the three default columns", async ({ page }) => {
    const name = unique("e2e-board");
    await createBoard(page, name);
    await openBoard(page, name);

    await expect(column(page, "Backlog")).toBeVisible();
    await expect(column(page, "In progress")).toBeVisible();
    await expect(column(page, "Done")).toBeVisible();
  });

  test("adds a column and removes it again", async ({ page }) => {
    const name = unique("e2e-columns");
    await createBoard(page, name);
    await openBoard(page, name);

    await page.getByRole("button", { name: "Add column", exact: true }).click();
    await page.getByLabel("Name", { exact: true }).fill("In review");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(column(page, "In review")).toBeVisible();

    await column(page, "In review")
      .getByRole("button", { name: "Column actions" })
      .click();
    await page.getByRole("menuitem", { name: "Delete", exact: true }).click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Delete", exact: true })
      .click();
    await expect(column(page, "In review")).toHaveCount(0);
  });
});

test.describe("Kanban cards", () => {
  test("creates a card and edits it through the detail dialog", async ({
    page,
  }) => {
    const name = unique("e2e-cards");
    await createBoard(page, name);
    await openBoard(page, name);

    await addCard(page, "Backlog", "Renew the certificate");

    await card(page, "Renew the certificate")
      .getByRole("button", { name: "Open card Renew the certificate" })
      .click();

    // Priority and assignee are on the same dialog as the title, so one save
    // proves the whole edit path rather than only the title field.
    await page.getByLabel("Priority", { exact: true }).click();
    await page.getByRole("option", { name: "Urgent", exact: true }).click();
    await page
      .getByLabel("Title", { exact: true })
      .fill("Renew the wildcard certificate");
    await page.getByRole("button", { name: "Save", exact: true }).click();

    await expect(card(page, "Renew the wildcard certificate")).toBeVisible();
    await expect(
      card(page, "Renew the wildcard certificate").getByText("Urgent"),
    ).toBeVisible();
  });

  test("ticks a checklist item and posts a comment", async ({ page }) => {
    const name = unique("e2e-detail");
    await createBoard(page, name);
    await openBoard(page, name);
    await addCard(page, "Backlog", "Migrate the database");

    await card(page, "Migrate the database")
      .getByRole("button", { name: "Open card Migrate the database" })
      .click();

    await page.getByLabel("Add an item", { exact: true }).fill("Take a backup");
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await page
      .getByRole("checkbox", { name: 'Mark "Take a backup" done' })
      .click();
    await expect(
      page.getByRole("checkbox", { name: 'Mark "Take a backup" done' }),
    ).toBeChecked();

    await page
      .getByLabel("Write a comment", { exact: true })
      .fill("Scheduled for Friday");
    await page.getByRole("button", { name: "Comment", exact: true }).click();
    await expect(page.getByText("Scheduled for Friday")).toBeVisible();

    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    // The card preview surfaces the checklist progress it just gained.
    await expect(
      card(page, "Migrate the database").getByText("1 / 1"),
    ).toBeVisible();
  });

  test("moves a card to the next column with the keyboard", async ({
    page,
  }) => {
    const name = unique("e2e-move");
    await createBoard(page, name);
    await openBoard(page, name);
    await addCard(page, "Backlog", "Rotate the API token");

    const handle = card(page, "Rotate the API token").getByRole("button", {
      name: "Move card Rotate the API token",
    });
    await keyboardMoveCard(page, handle, "ArrowRight");

    await expect(
      column(page, "In progress").getByRole("article", {
        name: "Rotate the API token",
      }),
    ).toBeVisible();
    expect(await cardTitles(column(page, "Backlog"))).toEqual([]);
  });

  test("drags a card to another column with the pointer", async ({ page }) => {
    const name = unique("e2e-pointer-move");
    await createBoard(page, name);
    await openBoard(page, name);
    await addCard(page, "Backlog", "Deploy the worker");
    // Let the add-card dialog's close animation settle so the measured
    // handle position matches where the pointer actually lands.
    await expect(page.getByRole("dialog")).toBeHidden();

    // Manual pointer gesture instead of dragTo(): dnd-kit's PointerSensor
    // needs intermediate pointermove events — dragTo's single leap makes the
    // drop resolve against the pre-drag layout, so the move PATCH comes back
    // 204 as a no-op with the card still in its source column. Like the
    // keyboard gesture above, the whole pick-up/move/drop cycle is retried:
    // if the press lands before the layout settles, dnd-kit never activates
    // and no request fires.
    const handle = card(page, "Deploy the worker").getByRole("button", {
      name: "Move card Deploy the worker",
    });
    let moveResponse: Awaited<ReturnType<typeof page.waitForResponse>> | null =
      null;
    let landed = false;
    for (let attempt = 0; attempt < 5 && !landed; attempt += 1) {
      const responsePromise = page
        .waitForResponse(
          (response) => {
            const url = new URL(response.url());
            return (
              url.pathname === "/api/kanban/cards/move" &&
              response.request().method() === "PATCH"
            );
          },
          { timeout: 1500 },
        )
        .catch(() => null);

      const source = await handle.boundingBox();
      const target = await column(page, "In progress").boundingBox();
      await page.mouse.move(
        source!.x + source!.width / 2,
        source!.y + source!.height / 2,
      );
      await page.mouse.down();
      await page.mouse.move(
        target!.x + target!.width / 2,
        target!.y + target!.height / 2,
        { steps: 10 },
      );
      await page.mouse.up();

      moveResponse = (await responsePromise) ?? moveResponse;
      // A PATCH that resolves as a no-op (card dropped back onto its own
      // column) still counts as a request but leaves the card in Backlog —
      // only stop once it has actually landed.
      landed =
        (await column(page, "In progress")
          .getByRole("article", { name: "Deploy the worker" })
          .count()) > 0;
    }
    if (!moveResponse) {
      throw new Error(
        "Pointer drag never triggered PATCH /api/kanban/cards/move after 5 attempts.",
      );
    }

    await expect(
      column(page, "In progress").getByRole("article", {
        name: "Deploy the worker",
      }),
    ).toBeVisible();
    expect(await cardTitles(column(page, "Backlog"))).toEqual([]);
  });
});

test.describe("Kanban filtering", () => {
  test("narrows the board by search and resets", async ({ page }) => {
    const name = unique("e2e-filter");
    await createBoard(page, name);
    await openBoard(page, name);
    await addCard(page, "Backlog", "Upgrade Node");
    await addCard(page, "Backlog", "Patch nginx");

    await page.getByLabel("Search cards", { exact: true }).fill("nginx");
    await expect(card(page, "Patch nginx")).toBeVisible();
    await expect(card(page, "Upgrade Node")).toHaveCount(0);
    // Reordering a filtered board would persist a partial order, so drag is
    // switched off and the board says so.
    await expect(
      page.getByText("Clear the filters to reorder cards."),
    ).toBeVisible();

    await page.getByRole("button", { name: "Reset filters" }).click();
    await expect(card(page, "Upgrade Node")).toBeVisible();
  });

  test("shows the empty state when nothing matches", async ({ page }) => {
    const name = unique("e2e-empty-filter");
    await createBoard(page, name);
    await openBoard(page, name);
    await addCard(page, "Backlog", "Upgrade Node");

    await page
      .getByLabel("Search cards", { exact: true })
      .fill("nothing matches this");
    await expect(
      page.getByText("Nothing matches", { exact: true }),
    ).toBeVisible();
  });
});

test.describe("Kanban responsive", () => {
  test("renders the board on a narrow viewport", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    const name = unique("e2e-mobile");
    await createBoard(page, name);
    await openBoard(page, name);
    await addCard(page, "Backlog", "Check the disk");

    await expect(card(page, "Check the disk")).toBeVisible();
    // Columns scroll horizontally rather than wrapping, so the first one has
    // to remain reachable at 375px.
    await expect(column(page, "Backlog")).toBeVisible();
  });
});
