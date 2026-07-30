import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./fixtures/test";
import { login } from "./utils/auth";

// Dashboards section: create a board, put widgets on it, rearrange them in edit
// mode, and confirm the layout survives a reload.
//
// Only widgets that read the app's own data are used here (clock, note, service
// status). The weather widget is deliberately absent: its payload comes from a
// server-side call to api.open-meteo.com, and this suite must never depend on a
// third-party host.

test.beforeEach(async ({ page }) => {
  await login(page);
});

const createdDashboardIds: string[] = [];

test.afterEach(async ({ page, baseURL }) => {
  // Dashboards live for the whole workspace, so a leftover board would leak
  // into the next test's tab bar. Cleanup goes through the API, like the
  // category cleanup in fixtures/test.ts.
  const workspaceId =
    (await page
      .locator("[data-workspace-id]")
      .first()
      .getAttribute("data-workspace-id")) ?? "";
  for (const id of createdDashboardIds.splice(0)) {
    const url = new URL(`/api/dashboards/${id}`, baseURL).toString();
    const status = await page.evaluate(
      async ([target, workspace]) =>
        (
          await fetch(target, {
            method: "DELETE",
            redirect: "manual",
            headers: { "x-inspoter-workspace": workspace },
          })
        ).status,
      [url, workspaceId] as const,
    );
    if (status !== 204 && status !== 404) {
      throw new Error(
        `Dashboard cleanup failed for ${id}: expected 204/404, received ${status}.`,
      );
    }
  }
});

async function createDashboard(page: Page, name: string): Promise<string> {
  await page.goto("/dashboards");

  // The section shows either the empty state's button or, once a board exists,
  // the action menu's "New dashboard" item.
  const emptyStateButton = page.getByRole("button", {
    name: "Создать дашборд",
    exact: true,
  });
  if (await emptyStateButton.isVisible().catch(() => false)) {
    await emptyStateButton.click();
  } else {
    await page
      .getByRole("button", { name: "Действия с дашбордом", exact: true })
      .click();
    await page
      .getByRole("menuitem", { name: "Новый дашборд", exact: true })
      .click();
  }

  await page.getByLabel("Название", { exact: true }).fill(name);

  const responsePromise = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/dashboards" &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Сохранить", exact: true }).click();
  const response = await responsePromise;
  expect(response.status()).toBe(201);

  const dashboard = (await response.json()) as { id: string };
  createdDashboardIds.push(dashboard.id);
  await page.waitForURL(new RegExp(`/dashboards/${dashboard.id}$`));
  return dashboard.id;
}

async function enterEditMode(page: Page) {
  await page
    .getByRole("button", { name: "Редактировать", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Готово", exact: true }),
  ).toBeVisible();
}

async function addWidget(page: Page, catalogueTitle: string) {
  await page
    .getByRole("button", { name: "Добавить виджет", exact: true })
    .click();

  const responsePromise = page.waitForResponse(
    (response) =>
      /\/api\/dashboards\/[^/]+\/widgets$/.test(
        new URL(response.url()).pathname,
      ) && response.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: new RegExp(`^${catalogueTitle}`) })
    .click();
  const response = await responsePromise;
  expect(response.status()).toBe(201);

  // The settings dialog opens straight after adding; this flow keeps defaults.
  await page.getByRole("button", { name: "Отмена", exact: true }).click();
  return (await response.json()) as { id: string; kind: string };
}

function tile(page: Page, widgetId: string): Locator {
  return page.locator(`[data-widget-id="${widgetId}"]`);
}

async function tileRect(target: Locator) {
  return target.evaluate((element) => {
    const style = (element as HTMLElement).style;
    return {
      x: Number(style.getPropertyValue("--tile-x")),
      y: Number(style.getPropertyValue("--tile-y")),
      w: Number(style.getPropertyValue("--tile-w")),
      h: Number(style.getPropertyValue("--tile-h")),
    };
  });
}

function isLayoutSave(url: URL, method: string): boolean {
  return (
    /\/api\/dashboards\/[^/]+\/layout$/.test(url.pathname) && method === "PATCH"
  );
}

function layoutSaved(page: Page) {
  return page.waitForResponse((response) =>
    isLayoutSave(new URL(response.url()), response.request().method()),
  );
}

// The same stepped-and-retried gesture bookmarks.spec.ts uses for its dnd-kit
// drags: the pointer must cross the 4px activation distance before the drag is
// armed, and in headless Chromium a single press/move/release has been observed
// to land under the threshold or mistime the listener attachment. Retrying the
// whole gesture asserts on the eventual outcome rather than on one attempt.
async function mouseDragTile(
  page: Page,
  start: { x: number; y: number },
  target: { x: number; y: number },
) {
  const attempts = 5;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const responsePromise = page
      .waitForResponse(
        (response) =>
          isLayoutSave(new URL(response.url()), response.request().method()),
        { timeout: 3_000 },
      )
      .catch(() => null);

    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.waitForTimeout(50);
    await page.mouse.move(start.x - 20, start.y, { steps: 5 });
    await page.waitForTimeout(50);
    await page.mouse.move(target.x, target.y, { steps: 10 });
    await page.waitForTimeout(50);
    await page.mouse.up();

    const response = await responsePromise;
    if (response) return response;
  }
  throw new Error(
    `Mouse drag never triggered PATCH /api/dashboards/:id/layout after ${attempts} attempts.`,
  );
}

test("создание дашборда: пустое состояние ведёт к первому дашборду", async ({
  page,
  testData,
}) => {
  await page.goto("/dashboards");

  const name = testData.name("board");
  const id = await createDashboard(page, name);

  await expect(page.getByRole("heading", { name, level: 1 })).toBeVisible();
  await expect(
    page.getByText("На дашборде пока нет виджетов", { exact: true }),
  ).toBeVisible();
  expect(id).toBeTruthy();
});

test("виджеты: добавление, настройка и удаление", async ({
  page,
  testData,
}) => {
  await createDashboard(page, testData.name("widgets"));
  await enterEditMode(page);

  const note = await addWidget(page, "Заметка");
  await expect(tile(page, note.id)).toBeVisible();

  // Configure it: the note's text is the widget's whole payload, so a saved
  // config shows up as tile content immediately after the refresh.
  await page.getByRole("button", { name: "Действия с виджетом" }).click();
  await page.getByRole("menuitem", { name: "Настроить", exact: true }).click();
  await page.getByLabel("Текст заметки", { exact: true }).fill("дежурит Аня");

  const savePromise = page.waitForResponse(
    (response) =>
      /\/api\/dashboards\/[^/]+\/widgets\/[^/]+$/.test(
        new URL(response.url()).pathname,
      ) && response.request().method() === "PATCH",
  );
  await page.getByRole("button", { name: "Сохранить", exact: true }).click();
  expect((await savePromise).status()).toBe(200);
  await expect(page.getByText("дежурит Аня")).toBeVisible();

  // Removing the widget leaves the board empty again.
  await page.getByRole("button", { name: "Действия с виджетом" }).click();
  const deletePromise = page.waitForResponse(
    (response) =>
      /\/api\/dashboards\/[^/]+\/widgets\/[^/]+$/.test(
        new URL(response.url()).pathname,
      ) && response.request().method() === "DELETE",
  );
  await page
    .getByRole("menuitem", { name: "Удалить виджет", exact: true })
    .click();
  expect((await deletePromise).status()).toBe(204);
  await expect(tile(page, note.id)).toHaveCount(0);
});

test("раскладка: изменение размера с клавиатуры сохраняется после перезагрузки", async ({
  page,
  testData,
}) => {
  await createDashboard(page, testData.name("resize"));
  await enterEditMode(page);

  const clock = await addWidget(page, "Часы и дата");
  const before = await tileRect(tile(page, clock.id));

  // The grip is a real button, so the resize is reachable from the keyboard —
  // and a key press is deterministic where a pixel drag is not.
  const saved = layoutSaved(page);
  await page
    .getByRole("button", { name: /^Изменить размер виджета/ })
    .first()
    .focus();
  await page.keyboard.press("ArrowRight");
  expect((await saved).status()).toBe(204);

  await page.reload();
  const after = await tileRect(tile(page, clock.id));
  expect(after.w).toBe(before.w + 1);
  expect(after.h).toBe(before.h);
});

test("раскладка: перетаскивание меняет порядок плиток и сохраняется", async ({
  page,
  testData,
}) => {
  await createDashboard(page, testData.name("drag"));
  await enterEditMode(page);

  const clock = await addWidget(page, "Часы и дата");
  const note = await addWidget(page, "Заметка");

  // Both tiles start on the top row, the note to the right of the clock.
  expect((await tileRect(tile(page, clock.id))).y).toBe(1);
  const noteBefore = await tileRect(tile(page, note.id));
  expect(noteBefore.y).toBe(1);
  expect(noteBefore.x).toBeGreaterThan(1);

  const handle = tile(page, note.id).getByRole("button", {
    name: /^Переместить виджет/,
  });
  const handleBox = await handle.boundingBox();
  const clockBox = await tile(page, clock.id).boundingBox();
  if (!handleBox || !clockBox) {
    throw new Error("Expected both tiles to have bounding boxes.");
  }

  // Drag the note onto the clock's cell.
  const saved = await mouseDragTile(
    page,
    {
      x: handleBox.x + handleBox.width / 2,
      y: handleBox.y + handleBox.height / 2,
    },
    { x: clockBox.x + 20, y: clockBox.y + 20 },
  );
  expect(saved.status()).toBe(204);

  await page.reload();
  // The note took the left-hand slot and the clock was pushed out of it.
  const noteAfter = await tileRect(tile(page, note.id));
  const clockAfter = await tileRect(tile(page, clock.id));
  expect(noteAfter.x).toBeLessThan(noteBefore.x);
  expect(
    clockAfter.y > 1 || clockAfter.x > 1,
    "the clock should no longer occupy the origin cell",
  ).toBe(true);
});

test("дашборд: переименование, назначение стартовым и удаление", async ({
  page,
  testData,
}) => {
  const id = await createDashboard(page, testData.name("manage"));
  const renamed = testData.name("renamed");

  await page
    .getByRole("button", { name: "Действия с дашбордом", exact: true })
    .click();
  await page
    .getByRole("menuitem", { name: "Переименовать", exact: true })
    .click();
  await page.getByLabel("Название", { exact: true }).fill(renamed);
  await page.getByRole("button", { name: "Сохранить", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: renamed, level: 1 }),
  ).toBeVisible();

  await page
    .getByRole("button", { name: "Действия с дашбордом", exact: true })
    .click();
  await page
    .getByRole("menuitem", { name: "Сделать стартовым", exact: true })
    .click();
  await expect(page.getByText("Дашборд стал стартовым")).toBeVisible();

  await page
    .getByRole("button", { name: "Действия с дашбордом", exact: true })
    .click();
  await page.getByRole("menuitem", { name: "Удалить", exact: true }).click();

  const deletePromise = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === `/api/dashboards/${id}` &&
      response.request().method() === "DELETE",
  );
  await page
    .getByRole("button", { name: "Удалить", exact: true })
    .last()
    .click();
  expect((await deletePromise).status()).toBe(204);
  createdDashboardIds.splice(createdDashboardIds.indexOf(id), 1);

  await page.waitForURL(/\/dashboards$/);
  await expect(page.getByText("Дашбордов пока нет")).toBeVisible();
});
