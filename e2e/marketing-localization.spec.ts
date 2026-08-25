import { expect, test } from "./fixtures/test";
import en from "../src/messages/en/marketing.json";
import lv from "../src/messages/lv/marketing.json";
import ru from "../src/messages/ru/marketing.json";

// UI-001: the landing page used to render hard-coded English for every
// locale. The hero (plus a sample of other sections) is pinned here to the
// strings from src/messages/<locale>/marketing.json for ru and lv, and to
// English for the default, unprefixed locale.

const LOCALIZED_CATALOGS = [
  { locale: "ru", messages: ru },
  { locale: "lv", messages: lv },
] as const;

test("en landing renders the English hero and marketing copy", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: `${en.hero.headlineStart} ${en.hero.headlineHighlight}`,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: en.hero.viewOnGithub }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 2, name: en.features.title }),
  ).toBeVisible();
});

for (const { locale, messages } of LOCALIZED_CATALOGS) {
  test(`${locale} landing renders the localized hero and marketing copy`, async ({
    page,
  }) => {
    await page.goto(`/${locale}`);
    await expect(page.locator("html")).toHaveAttribute("lang", locale);
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: `${messages.hero.headlineStart} ${messages.hero.headlineHighlight}`,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 2, name: messages.features.title }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 2, name: messages.deploy.title }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: messages.community.starOnGithub }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: messages.footer.logIn }),
    ).toBeVisible();
  });
}
