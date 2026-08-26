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

    test("registers the kanban tools and kanban_card_create creates a real card", async ({
      page,
    }) => {
      const name = unique("e2e-web-mcp");
      await createBoard(page, name);
      await openBoard(page, name);
      await expect(column(page, "Backlog")).toBeVisible();

      const registeredNames = await page.evaluate(() =>
        (window.__webMcpCalls ?? []).map((c) => c.tool.name),
      );
      expect(registeredNames).toContain("kanban_boards_list");
      expect(registeredNames).toContain("kanban_card_create");
      expect(registeredNames).toContain("kanban_card_move");

      // The catalog is id-based (aff7287): resolve the board and column
      // through kanban_boards_list itself, then create the card.
      const created = await page.evaluate(async (boardName: string) => {
        const calls = window.__webMcpCalls ?? [];
        const list = calls.find((c) => c.tool.name === "kanban_boards_list");
        if (!list) throw new Error("kanban_boards_list was not registered.");
        const listed = JSON.parse(
          (
            (await list.tool.execute({})) as {
              content: { text: string }[];
            }
          ).content[0].text,
        ) as {
          boards: Array<{
            id: string;
            name: string;
            columns: Array<{ id: string; name: string }>;
          }>;
        };
        const board = listed.boards.find((item) => item.name === boardName);
        if (!board) throw new Error(`Board ${boardName} not listed.`);
        const target = board.columns.find(
          (item) => item.name === "Backlog",
        );
        if (!target) throw new Error("Backlog column not listed.");
        const create = calls.find(
          (c) => c.tool.name === "kanban_card_create",
        );
        if (!create) throw new Error("kanban_card_create was not registered.");
        const result = (await create.tool.execute({
          columnId: target.id,
          title: "WebMCP e2e test card",
        })) as {
          content: { type: string; text: string }[];
          isError?: boolean;
        };
        return {
          isError: result.isError ?? false,
          columnId: target.id,
          body: JSON.parse(result.content[0].text) as Record<string, unknown>,
        };
      }, name);

      expect(created.isError).toBe(false);
      expect(created.body).toMatchObject({
        title: "WebMCP e2e test card",
        columnId: created.columnId,
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
          (c) => c.tool.name === "kanban_card_create",
        );
        if (!entry) return null;
        // Shape-valid but nonexistent column id: the advertised schema accepts
        // it and the service rejects it, so defineWebMcpTool must resolve
        // (not reject) with the not-found error in-band.
        return (await entry.tool.execute({
          columnId: "no-such-column-id",
          title: "Should never be created",
        })) as {
          content: { type: string; text: string }[];
          isError?: boolean;
        };
      });

      expect(executeResult).not.toBeNull();
      expect(executeResult!.isError).toBe(true);
      // The API rejects an unknown column id with its RESOURCE_NOT_FOUND
      // error code, which defineWebMcpTool relays in-band as the text.
      expect(executeResult!.content[0].text).toContain("RESOURCE_NOT_FOUND");
      // The rejected card must not have been created on the open board.
      await expect(card(page, "Should never be created")).toHaveCount(0);
    });
  });
}
