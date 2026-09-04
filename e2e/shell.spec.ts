import { expect, test } from "./fixtures/test";
import { login } from "./utils/auth";

// AC-SHELL-001..003 (design.md §3.2): the navigation and every implemented
// dashboard route remain available through the shared shell. The suite runs on
// the base locale (playwright.config.ts sets `locale: "en-US"`), so the labels
// below are the English catalog's.
const SECTIONS = [
  "Management",
  "Bookmarks",
  "Domains",
  "Servers",
  "Mail",
  "Messages",
  "Logs",
  "Alerts",
];

// Scoped by accessible name: a dashboard page also renders a navigation
// landmark for its dashboard tabs, so the bare "navigation" role is ambiguous
// once a workspace has more than one dashboard.
const MAIN_NAV = { name: "Main navigation" } as const;

test("AC-SHELL-001: navigation starts with Management and lists core sections", async ({
  page,
}) => {
  await login(page);
  const nav = page.getByRole("navigation", MAIN_NAV);
  await expect(nav.getByRole("link").first()).toHaveAccessibleName(
    "Management",
  );
  for (const section of SECTIONS) {
    await expect(
      nav.getByRole("link", { name: section, exact: true }),
    ).toBeVisible();
  }
});

test("AC-SHELL-002: clicking a nav link routes client-side (no full page reload)", async ({
  page,
}) => {
  await login(page);
  await page.evaluate(() => {
    (
      window as unknown as { __modeANoReloadMarker?: boolean }
    ).__modeANoReloadMarker = true;
  });

  await page
    .getByRole("navigation", MAIN_NAV)
    .getByRole("link", { name: "Domains", exact: true })
    .click();
  await expect(page).toHaveURL(/\/domains$/);

  const markerSurvived = await page.evaluate(
    () =>
      (window as unknown as { __modeANoReloadMarker?: boolean })
        .__modeANoReloadMarker === true,
  );
  expect(markerSurvived).toBe(true);
});

// Topbar shortcuts to the three sections that accumulate unread items. The
// count lives in the accessible name (the badge itself is aria-hidden), so the
// prefix match works whether or not the workspace has anything unread.
test("topbar exposes mail, alert and message indicators that route to their sections", async ({
  page,
}) => {
  await login(page);
  const topbar = page.getByRole("banner");

  for (const prefix of ["Mail:", "Alerts:", "Messages:"]) {
    await expect(
      topbar.getByLabel(new RegExp(`^${prefix}`)),
      `${prefix} indicator should be visible`,
    ).toBeVisible();
  }

  await topbar.getByLabel(/^Alerts:/).click();
  await expect(page).toHaveURL(/\/alerts$/);
});

interface Readiness {
  name: string;
  // Optional ARIA role. When omitted, the readiness marker is matched by
  // visible text only — used for elements whose role is intentionally
  // non-deterministic (e.g. a Base UI Button rendered over a next/link).
  role?: "heading" | "link" | "button";
}

interface ImplementedSection {
  path: string;
  label: string;
  readiness: Readiness;
}

const IMPLEMENTED_SECTIONS: readonly ImplementedSection[] = [
  {
    path: "/management",
    label: "Management",
    readiness: { role: "heading", name: "Management" },
  },
  {
    path: "/domains",
    label: "Domains",
    readiness: { role: "heading", name: "Domains" },
  },
  {
    path: "/servers",
    label: "Servers",
    readiness: { role: "heading", name: "Servers" },
  },
  {
    path: "/mail",
    label: "Mail",
    readiness: { role: "heading", name: "Mail" },
  },
  {
    path: "/messages",
    label: "Messages",
    readiness: { role: "heading", name: "Channels" },
  },
  {
    path: "/logs",
    label: "Logs",
    readiness: { role: "heading", name: "Logs" },
  },
  {
    path: "/alerts",
    label: "Alerts",
    readiness: { role: "heading", name: "Alerts" },
  },
];

const SETTINGS_ROUTE = {
  path: "/settings",
  label: "Settings",
  readiness: { role: "heading", name: "Settings" },
} as const;

test.describe("AC-SHELL-003: implemented sections render through the active shell", () => {
  for (const { path, label, readiness } of IMPLEMENTED_SECTIONS) {
    test(`${label} renders its implemented route and active navigation`, async ({
      page,
    }) => {
      await login(page);
      const response = await page.goto(path);

      expect(
        response,
        `${path} should return a document response`,
      ).not.toBeNull();
      expect(
        response!.status(),
        `${path} should resolve without a 4xx/5xx response`,
      ).toBeLessThan(400);
      await expect(page).toHaveURL(new RegExp(`${path}$`));
      await expect(
        page
          .getByRole("navigation", { name: "Main navigation" })
          .getByRole("link", { name: label, exact: true }),
      ).toHaveAttribute("data-active", "true");
      const readinessLocator = readiness.role
        ? page.getByRole(readiness.role, { name: readiness.name, exact: true })
        : page.getByText(readiness.name, { exact: true });
      await expect(readinessLocator).toBeVisible();
    });
  }
});

test("Settings route renders through the active shell (smoke check, not AC-SHELL-003)", async ({
  page,
}) => {
  await login(page);
  const response = await page.goto(SETTINGS_ROUTE.path);

  expect(response).not.toBeNull();
  expect(response!.status()).toBeLessThan(400);
  await expect(page).toHaveURL(new RegExp(`${SETTINGS_ROUTE.path}$`));
  await expect(
    page
      .getByRole("navigation", { name: "Main navigation" })
      .getByRole("link", { name: SETTINGS_ROUTE.label, exact: true }),
  ).toHaveAttribute("data-active", "true");
  await expect(
    page.getByRole(SETTINGS_ROUTE.readiness.role, {
      name: SETTINGS_ROUTE.readiness.name,
      exact: true,
    }),
  ).toBeVisible();
});

// The bug this indicator work exists to fix. The sidebar footer used to be
// server-rendered in the dashboard layout, and App Router does not re-render a
// layout on client-side navigation — so after a soft nav the footer showed
// whatever it read on the last full page load while the management page beside
// it showed freshly computed numbers. Both now read one client store.
test("sidebar and management health chips agree after a client-side navigation", async ({
  page,
}) => {
  await login(page);
  await page.goto("/bookmarks");

  // Soft navigation: the path where the layout is NOT re-executed.
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("link", { name: "Management", exact: true })
    .click();
  await expect(page).toHaveURL(/\/management$/);

  const panel = page.locator("[data-slot='system-health']");
  await expect(panel).toBeVisible();

  const sidebarFooter = page.locator("[data-sidebar='footer']");
  const providersHref = "a[href$='/settings/providers']";
  const alertsHref = "a[href$='/alerts']";

  await expect(sidebarFooter.locator(providersHref)).toHaveText(
    await panel.locator(providersHref).innerText(),
  );
  await expect(sidebarFooter.locator(alertsHref)).toHaveText(
    await panel.locator(alertsHref).innerText(),
  );
});

// Entering /alerts marks everything read. The topbar badge always cleared;
// the sidebar's critical-alert chip did not, because nothing told the layout.
test("reading alerts clears the topbar badge and the sidebar chip without a reload", async ({
  page,
}) => {
  await login(page);
  await page.goto("/alerts");

  await expect(
    page.getByRole("banner").getByLabel(/^Alerts:/),
  ).toHaveAccessibleName(/no new/i);

  // Navigate away client-side; the sidebar must have kept up on its own.
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("link", { name: "Bookmarks", exact: true })
    .click();
  await expect(
    page.locator("[data-sidebar='footer']").locator("a[href$='/alerts']"),
  ).toHaveText(/No open critical alerts/);
});

// Proves the live transport is actually connected, not just that the numbers
// happen to be right.
test("the dashboard shell opens an indicator event stream", async ({
  page,
}) => {
  const streamed = page.waitForResponse(
    (response) =>
      response.url().includes("/api/indicators/stream") &&
      response.status() === 200,
  );
  await login(page);
  const response = await streamed;
  expect(response.headers()["content-type"]).toContain("text/event-stream");
});
