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

// Kept as one constant because several specs assert the post-login URL.
export const POST_LOGIN_PATH = "/management";

export async function submitLoginForm(
  page: Page,
  username: string = OPERATOR_USERNAME,
  password: string = OPERATOR_PASSWORD,
) {
  await page.goto("/login");
  const expectedManagementUrl = new URL(POST_LOGIN_PATH, page.url()).href;
  await page.getByLabel("Username", { exact: true }).fill(username);
  // Exact: the reveal toggle inside the field is labelled "Show password",
  // which a substring match would pick up alongside the input itself.
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  return expectedManagementUrl;
}

export async function login(
  page: Page,
  username: string = OPERATOR_USERNAME,
  password: string = OPERATOR_PASSWORD,
) {
  await submitLoginForm(page, username, password);
  await page.waitForURL(/\/management/);
}
