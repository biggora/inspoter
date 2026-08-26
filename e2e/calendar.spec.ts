import type { Page } from "@playwright/test";

import { expect, test } from "./fixtures/test";
import { login } from "./utils/auth";

const createdEventIds: string[] = [];

test.beforeEach(async ({ page }) => {
  await login(page);
  await page.goto("/calendar");
});

test.afterEach(async ({ page, baseURL }) => {
  if (createdEventIds.length === 0) return;

  const workspaceId =
    (await page
      .locator("[data-workspace-id]")
      .first()
      .getAttribute("data-workspace-id")) ?? "";

  for (const id of createdEventIds.splice(0)) {
    const status = await page.evaluate(
      async ([target, workspace]) =>
        (
          await fetch(target, {
            method: "DELETE",
            redirect: "manual",
            headers: { "x-inspoter-workspace": workspace },
          })
        ).status,
      [
        new URL(
          `/api/calendar/events/${encodeURIComponent(id)}?scope=series`,
          baseURL,
        ).toString(),
        workspaceId,
      ] as const,
    );
    if (status !== 204 && status !== 404) {
      throw new Error(
        `Calendar event cleanup failed for ${id}: expected 204/404, received ${status}.`,
      );
    }
  }
});

async function createRecurringEvent(page: Page, title: string) {
  await page.getByRole("button", { name: "New event", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Title", { exact: true }).fill(title);
  await dialog.getByLabel("Repeat", { exact: true }).selectOption("DAILY");

  const responsePromise = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/calendar/events" &&
      response.request().method() === "POST",
  );
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  const response = await responsePromise;
  expect(response.status()).toBe(201);
  const event = (await response.json()) as { id: string };
  createdEventIds.push(event.id);
  await expect(dialog).toBeHidden();
}

test("creates and edits a recurring event across calendar views", async ({
  page,
  testData,
}) => {
  const title = testData.name("Calendar event");
  const updatedTitle = testData.name("Updated calendar event");

  await createRecurringEvent(page, title);
  await expect(page.getByText(title, { exact: true }).first()).toBeVisible();

  await page.getByRole("button", { name: "Week", exact: true }).click();
  await expect(page.getByText(title, { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "Day", exact: true }).click();
  await expect(page.getByText(title, { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "Month", exact: true }).click();

  await page.getByText(title, { exact: true }).first().click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("heading", { name: "Edit event" }),
  ).toBeVisible();
  await expect(
    dialog.getByLabel("Change a repeating series", { exact: true }),
  ).toHaveValue("occurrence");
  await dialog.getByLabel("Title", { exact: true }).fill(updatedTitle);

  const responsePromise = page.waitForResponse(
    (response) =>
      /\/api\/calendar\/events\/[^/]+$/.test(
        new URL(response.url()).pathname,
      ) && response.request().method() === "PATCH",
  );
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  const response = await responsePromise;
  expect(response.status()).toBe(200);
  await expect(dialog).toBeHidden();
  await expect(
    page.getByText(updatedTitle, { exact: true }).first(),
  ).toBeVisible();
});
