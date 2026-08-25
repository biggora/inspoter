import { expect, test } from "./fixtures/test";
import { login } from "./utils/auth";

// The MCP auth hint carries an angle-bracketed <token> placeholder, which
// must render through t.rich as a code chunk. Rendering it with plain t()
// makes next-intl throw UNCLOSED_TAG and fall back to the raw
// "settings.mcpAuthHint" key.
test("Webhook tokens MCP auth hint renders translated rich text", async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  });

  await login(page);
  await page.goto("/settings/webhooks");

  await expect(
    page.getByRole("heading", { name: "API Tokens", exact: true }),
  ).toBeVisible();

  const hint = page.getByText("Authenticate with", { exact: false });
  await expect(hint).toBeVisible();
  await expect(hint).toContainText(
    'Authenticate with "Authorization: Bearer token". ' +
      "A token only reaches MCP once it has at least one permission below — " +
      "tokens without any stay webhook-only.",
  );
  await expect(hint.locator("code")).toHaveText("token");

  expect(await page.getByText("settings.mcpAuthHint").count()).toBe(0);
  expect(
    consoleErrors.filter((text) => /IntlError|INVALID_MESSAGE/.test(text)),
  ).toEqual([]);
});
