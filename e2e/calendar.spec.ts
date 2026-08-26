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

  // The view switcher is one labeled select (Month/Week/Day), not buttons.
  // The recurring series renders one chip per day plus a same-title chip per
  // reminder occurrence, some collapsed ("+N more" mirrors) — so assert on
  // the visible grid containing the title, not on an individual text node.
  const gridShows = (text: string) =>
    expect(page.locator('[role="grid"]').filter({ hasText: text })).toBeVisible();

  const viewSelect = page.getByLabel("View", { exact: true });
  await viewSelect.selectOption("Week");
  await gridShows(title);
  await viewSelect.selectOption("Day");
  await gridShows(title);
  await viewSelect.selectOption("Month");

  // FullCalendar v7 renders obfuscated per-build classes and the event's
  // "notify before" reminder renders as its own chip carrying the same title
  // (marked with .calendar-reminder-event). Month view also collapses cells
  // behind "+N more", so open the event from the Day view where blocks
  // render expanded, targeting the title node outside any reminder chip.
  await viewSelect.selectOption("Day");
  await gridShows(title);
  await page
    .locator('[role="grid"]')
    .getByText(title, { exact: true })
    .and(page.locator(":not(.calendar-reminder-event *)"))
    .filter({ visible: true })
    .first()
    .click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("heading", { name: "Edit event" }),
  ).toBeVisible();
  // The scope select defaults to "occurrence", but occurrence-scoped edits
  // only override times today (CalendarEventException has no title column),
  // so a rename must target the series — see updateEvent in
  // src/lib/services/calendar.ts.
  await dialog
    .getByLabel("Change a repeating series", { exact: true })
    .selectOption("series");
  await expect(
    dialog.getByLabel("Change a repeating series", { exact: true }),
  ).toHaveValue("series");
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
  await gridShows(updatedTitle);
});
