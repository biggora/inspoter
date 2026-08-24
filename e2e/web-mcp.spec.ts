import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures/test";
import { login } from "./utils/auth";

// End-to-end proof of the whole WebMCP chain:
// registerTool -> execute -> cardsApi.create -> route -> DB -> UI refresh.
// `page.addInitScript` runs before any page script (including React's own),
// so it correctly simulates a browser with native WebMCP support already
// present by the time `registerTool()` is called from `useWebMcpTool`.
// Follows the fixture/login/board-creation pattern from e2e/kanban.spec.ts.
//
// The API ships under two surfaces (see src/types/web-mcp.d.ts): the W3C
// draft's `document.modelContext` and `navigator.modelContext`, which is what
// the Chrome builds implementing it today actually expose. The suite is
// parameterized over both so the navigator path — the real-world one — is
// exercised, and each fake returns the shipping `{ unregister }` handle
// rather than a Promise.

declare global {
  interface Window {
    __webMcpCalls?: { tool: ModelContextTool; options?: object }[];
  }
}

const SURFACES = ["navigator", "document"] as const;
type Surface = (typeof SURFACES)[number];

let createdBoards: string[] = [];

async function installFakeModelContext(page: Page, surface: Surface) {
  // Must be registered before the first navigation so it's present when
  // KanbanBoardView's useWebMcpTool effects run.
  await page.addInitScript((target: string) => {
    window.__webMcpCalls = [];
    Object.defineProperty(
      target === "navigator" ? navigator : document,
      "modelContext",
      {
        configurable: true,
        writable: true,
        value: {
          ontoolchange: null,
          registerTool: (tool: unknown, options?: unknown) => {
            window.__webMcpCalls!.push({
              tool: tool as never,
              options: options as never,
            });
            return { unregister: () => {} };
          },
        },
      },
    );
  }, surface);
}

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

for (const surface of SURFACES) {
  test.describe(`WebMCP tools (${surface}.modelContext)`, () => {
    test.beforeEach(async ({ page }) => {
      createdBoards = [];
      await installFakeModelContext(page, surface);
      await login(page);
      await page.goto("/kanban");
    });

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
        if (!entry) return null;
        return (await entry.tool.execute({
          column: "Backlog",
          title: "WebMCP e2e test card",
        })) as {
          content: { type: string; text: string }[];
          isError?: boolean;
        };
      });

      // `execute` always resolves to the MCP result shape; a guard or a
      // failed call would come back with `isError: true` rather than
      // rejecting (see src/lib/web-mcp/define-tool.ts).
      expect(executeResult).not.toBeNull();
      expect(executeResult!.isError).toBeFalsy();
      expect(JSON.parse(executeResult!.content[0].text)).toMatchObject({
        title: "WebMCP e2e test card",
        column: "Backlog",
      });

      await page.reload();
      await expect(column(page, "Backlog")).toBeVisible();
      await expect(card(page, "WebMCP e2e test card")).toBeVisible();
    });

    test("a guard failure comes back as an isError result, not a rejection", async ({
      page,
    }) => {
      const name = unique("e2e-web-mcp-guard");
      await createBoard(page, name);
      await openBoard(page, name);
      await expect(column(page, "Backlog")).toBeVisible();

      const executeResult = await page.evaluate(async () => {
        const entry = (window.__webMcpCalls ?? []).find(
          (c) => c.tool.name === "kanban_create_card",
        );
        if (!entry) return null;
        return (await entry.tool.execute({
          column: "no-such-column",
          title: "Should never be created",
        })) as {
          content: { type: string; text: string }[];
          isError?: boolean;
        };
      });

      expect(executeResult).not.toBeNull();
      expect(executeResult!.isError).toBe(true);
      expect(executeResult!.content[0].text).toContain("No match found");
    });
  });
}
