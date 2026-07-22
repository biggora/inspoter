import { expect, test } from "./fixtures/test";
import { login } from "./utils/auth";

// AC-SHELL-001..003 (design.md §3.2): Russian navigation and every
// implemented dashboard route remain available through the shared shell.
const SECTIONS = [
  "Закладки",
  "Домены",
  "Серверы",
  "Почта",
  "Сообщения",
  "Логи",
  "Оповещения",
];

test("AC-SHELL-001: navigation lists all seven sections", async ({ page }) => {
  await login(page);
  const nav = page.getByRole("navigation");
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
    .getByRole("navigation")
    .getByRole("link", { name: "Домены", exact: true })
    .click();
  await expect(page).toHaveURL(/\/domains$/);

  const markerSurvived = await page.evaluate(
    () =>
      (window as unknown as { __modeANoReloadMarker?: boolean })
        .__modeANoReloadMarker === true,
  );
  expect(markerSurvived).toBe(true);
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
    path: "/domains",
    label: "Домены",
    readiness: { role: "heading", name: "Домены" },
  },
  {
    path: "/servers",
    label: "Серверы",
    readiness: { role: "heading", name: "Серверы" },
  },
  {
    path: "/mail",
    label: "Почта",
    readiness: { role: "heading", name: "Почта" },
  },
  {
    path: "/messages",
    label: "Сообщения",
    readiness: { role: "heading", name: "Каналы" },
  },
  {
    path: "/logs",
    label: "Логи",
    readiness: { role: "heading", name: "Логи" },
  },
  {
    path: "/alerts",
    label: "Оповещения",
    readiness: { role: "heading", name: "Оповещения" },
  },
];

const SETTINGS_ROUTE = {
  path: "/settings",
  label: "Настройки",
  readiness: { role: "heading", name: "Настройки" },
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
          .getByRole("navigation", { name: "Основная навигация" })
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
      .getByRole("navigation", { name: "Основная навигация" })
      .getByRole("link", { name: SETTINGS_ROUTE.label, exact: true }),
  ).toHaveAttribute("data-active", "true");
  await expect(
    page.getByRole(SETTINGS_ROUTE.readiness.role, {
      name: SETTINGS_ROUTE.readiness.name,
      exact: true,
    }),
  ).toBeVisible();
});
