import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures/test";
import { login } from "./utils/auth";

// End-to-end proof of the whole WebMCP chain:
// registerTool -> execute -> cardsApi.create -> route -> DB -> UI refresh.
// `page.addInitScript` runs before any page script (including React's own),
// so it correctly simulates a browser with native WebMCP support already
// present by the time `document.modelContext.registerTool()` is called from
// `useWebMcpTool`. Follows the fixture/login/board-creation pattern from
// e2e/kanban.spec.ts.

declare global {
  interface Window {
    __webMcpCalls?: { tool: ModelContextTool; options?: object }[];
  }
}

let createdBoards: string[] = [];

test.beforeEach(async ({ page }) => {
  createdBoards = [];

  // Must be registered before the first navigation so it's present when
  // KanbanBoardView's useWebMcpTool effects run.
  await page.addInitScript(() => {
    window.__webMcpCalls = [];
    Object.defineProperty(document, "modelContext", {
      configurable: true,
      writable: true,
      value: {
        ontoolchange: null,
        registerTool: (tool: unknown, options?: unknown) => {
          window.__webMcpCalls!.push({
            tool: tool as never,
            options: options as never,
          });
          return Promise.resolve(undefined);
        },
      },
    });
  });

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

test.describe("WebMCP tools", () => {
  test("registers the kanban tools and kanban_create_card creates a real card", async ({
    page,
  }) => {
    const name = unique("e2e-web-mcp");
    await createBoard(page, name);
    await openBoard(page, name);

    // The board is rendered (columns visible), so KanbanBoardView's
    // useWebMcpTool effects have run.
    await expect(column(page, "Backlog")).toBeVisible();

    const registeredNames = await page.evaluate(() =>
      (window.__webMcpCalls ?? []).map((c) => c.tool.name),
    );
    expect(registeredNames).toContain("kanban_move_card");
    expect(registeredNames).toContain("kanban_create_card");

    const executeResult = await page.evaluate(async () => {
      const entry = (window.__webMcpCalls ?? []).find(
        (c) => c.tool.name === "kanban_create_card",
      );
      if (!entry) return { error: "kanban_create_card was never registered" };
      return entry.tool.execute({
        column: "Backlog",
        title: "WebMCP e2e test card",
      });
    });

    expect(executeResult).not.toHaveProperty("error");

    await page.reload();
    await expect(column(page, "Backlog")).toBeVisible();
    await expect(card(page, "WebMCP e2e test card")).toBeVisible();
  });
});
