import type { Page } from "@playwright/test";

function requireCredential(name: "OPERATOR_USERNAME" | "OPERATOR_PASSWORD") {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required in the Playwright test environment.`);
  }
  return value;
}

export const OPERATOR_USERNAME = requireCredential("OPERATOR_USERNAME");
export const OPERATOR_PASSWORD = requireCredential("OPERATOR_PASSWORD");

export async function submitLoginForm(
  page: Page,
  username: string = OPERATOR_USERNAME,
  password: string = OPERATOR_PASSWORD,
) {
  await page.goto("/login");
  await page.getByLabel("Имя пользователя", { exact: true }).fill(username);
  await page.getByLabel("Пароль", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Войти", exact: true }).click();
}

export async function login(
  page: Page,
  username: string = OPERATOR_USERNAME,
  password: string = OPERATOR_PASSWORD,
) {
  await submitLoginForm(page, username, password);
  await page.waitForURL(/\/bookmarks/);
}
