import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures/test";
import { login } from "./utils/auth";

// Visual/responsive acceptance for a populated dashboard, following
// ui-visual.spec.ts: light and dark, desktop and phone width, no horizontal
// overflow, and the grid collapsing to one column below `sm`. Screenshots are
// attached so a reviewer can see the board without running the app.
//
// Widgets used here read only the app's own data — the weather tile is excluded
// because its payload would require an outbound call to api.open-meteo.com.
const WIDGETS = ["Clock and date", "Note", "Service status", "Logs"];

async function selectTheme(page: Page, theme: "light" | "dark") {
  await page.evaluate((value) => localStorage.setItem("theme", value), theme);
  await page.reload();
  await expect(page.locator("html")).toHaveClass(
    new RegExp(`(^| )${theme}( |$)`),
  );
}

async function expectNoHorizontalOverflow(page: Page) {
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true);
}

test("a populated dashboard renders in light and dark, and collapses to one column on a phone", async ({
  page,
}, testInfo) => {
  test.setTimeout(60_000);
  await login(page);
  await page.goto("/dashboards");

  // Read the workspace id while the persistent sidebar is still mounted: below
  // `lg` it moves into an off-canvas sheet and the attribute leaves the DOM,
  // which the phone-width part of this test would otherwise trip over.
  const workspaceId =
    (await page
      .locator("[data-workspace-id]")
      .first()
      .getAttribute("data-workspace-id")) ?? "";

  // Build a board with four widgets. The section shows the empty state's button
  // only when the workspace has no dashboards yet, so fall back to the action
  // menu — this suite must not depend on what other specs left behind.
  const emptyStateButton = page.getByRole("button", {
    name: "Create dashboard",
    exact: true,
  });
  if (await emptyStateButton.isVisible().catch(() => false)) {
    await emptyStateButton.click();
  } else {
    await page
      .getByRole("button", { name: "Dashboard actions", exact: true })
      .click();
    await page
      .getByRole("menuitem", { name: "New dashboard", exact: true })
      .click();
  }
  await page.getByLabel("Name", { exact: true }).fill("Overview");
  const created = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/dashboards" &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Save", exact: true }).click();
  const dashboardId = ((await (await created).json()) as { id: string }).id;

  await page.getByRole("button", { name: "Edit", exact: true }).click();
  for (const widget of WIDGETS) {
    const isFirst = widget === WIDGETS[0];
    await page
      .getByRole("button", {
        name: isFirst ? "Add the first widget" : "Add widget",
        exact: true,
      })
      .click();
    const added = page.waitForResponse(
      (response) =>
        /\/api\/dashboards\/[^/]+\/widgets$/.test(
          new URL(response.url()).pathname,
        ) && response.request().method() === "POST",
    );
    await page.getByRole("button", { name: new RegExp(`^${widget}`) }).click();
    await added;
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
  }
  await page.getByRole("button", { name: "Done", exact: true }).click();

  const tiles = page.locator('[data-slot="dashboard-grid-item"]');
  await expect(tiles).toHaveCount(WIDGETS.length);

  try {
    await selectTheme(page, "light");
    await expectNoHorizontalOverflow(page);
    testInfo.attach("dashboard-light", {
      body: await page.screenshot({ fullPage: true }),
      contentType: "image/png",
    });

    await selectTheme(page, "dark");
    await expectNoHorizontalOverflow(page);
    testInfo.attach("dashboard-dark", {
      body: await page.screenshot({ fullPage: true }),
      contentType: "image/png",
    });

    // Desktop: the tiles sit side by side on the 12-column grid, so at least two
    // of them share a top edge.
    const desktopTops = await tiles.evaluateAll((elements) =>
      elements.map((element) =>
        Math.round(element.getBoundingClientRect().top),
      ),
    );
    expect(new Set(desktopTops).size).toBeLessThan(desktopTops.length);

    // Phone: one column — every tile starts at a distinct vertical offset and
    // spans the full width.
    await page.setViewportSize({ width: 375, height: 800 });
    await selectTheme(page, "light");
    await expectNoHorizontalOverflow(page);
    const phoneBoxes = await tiles.evaluateAll((elements) =>
      elements.map((element) => {
        const rect = element.getBoundingClientRect();
        return { top: Math.round(rect.top), width: Math.round(rect.width) };
      }),
    );
    expect(new Set(phoneBoxes.map((box) => box.top)).size).toBe(
      phoneBoxes.length,
    );
    expect(new Set(phoneBoxes.map((box) => box.width)).size).toBe(1);
    testInfo.attach("dashboard-mobile", {
      body: await page.screenshot({ fullPage: true }),
      contentType: "image/png",
    });
  } finally {
    await page.evaluate(
      async ([id, workspace]) => {
        await fetch(`/api/dashboards/${id}`, {
          method: "DELETE",
          headers: { "x-inspoter-workspace": workspace },
        });
      },
      [dashboardId, workspaceId] as const,
    );
  }
});
