import type { Request } from "@playwright/test";

import { expect, test } from "./fixtures/test";
import { login } from "./utils/auth";

test.use({ trace: "off", screenshot: "off", video: "off" });

const API_DOCS_PATH = "/settings/api-docs";
const SYNTHETIC_BEARER = "synthetic-e2e-value-not-a-real-token";

test("anonymous API docs requests preserve the requested locale at login", async ({
  page,
}) => {
  await page.goto(API_DOCS_PATH);
  await expect(page).toHaveURL(/\/login(?:\?|$)/);

  await page.goto(`/ru${API_DOCS_PATH}`);
  await expect(page).toHaveURL(/\/ru\/login(?:\?|$)/);
});

test("an invalid session cookie is rejected by authoritative dashboard auth", async ({
  baseURL,
  context,
  page,
}) => {
  if (!baseURL) throw new Error("Playwright baseURL is required.");

  await context.addCookies([
    {
      name: "session",
      value: "synthetic-invalid-session-not-a-secret",
      url: baseURL,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  expect(
    (await context.cookies()).some((cookie) => cookie.name === "session"),
  ).toBe(true);

  await page.goto(API_DOCS_PATH);
  await expect(page).toHaveURL(/\/login(?:\?|$)/);
});

test("authenticated operator opens the three-operation Swagger reference without external requests", async ({
  page,
}) => {
  await login(page);
  await page.goto("/settings");

  const appOrigin = new URL(page.url()).origin;
  const externalRequests: string[] = [];
  const recordExternalRequest = (request: Request) => {
    const url = new URL(request.url());
    if (
      (url.protocol === "http:" || url.protocol === "https:") &&
      url.origin !== appOrigin
    ) {
      externalRequests.push(`${url.origin}${url.pathname}`);
    }
  };
  page.on("request", recordExternalRequest);

  await page.locator('a[href$="/settings/api-docs"]').click();
  await expect(page).toHaveURL(new RegExp(`${API_DOCS_PATH}$`));

  const operationPaths = page.locator(".swagger-ui .opblock-summary-path");
  await expect(operationPaths).toHaveCount(3);
  expect(
    (await operationPaths.allTextContents()).map((path) => path.trim()).sort(),
  ).toEqual(
    [
      "/api/server-metrics",
      "/api/webhooks/{type}",
      "/api/webhooks/channels/{webhookId}/{token}",
    ].sort(),
  );
  await expect(page.locator(".swagger-ui .opblock-post")).toHaveCount(3);
  await expect(page.getByText("/api/services", { exact: false })).toHaveCount(
    0,
  );

  page.off("request", recordExternalRequest);
  expect(externalRequests).toEqual([]);
});

test("Try It Out sends only synthetic explicit auth and does not persist it", async ({
  page,
}) => {
  const pageErrors: string[] = [];
  const refractConsoleErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" && /refract/i.test(message.text())) {
      refractConsoleErrors.push(message.text());
    }
  });

  await login(page);

  let resolveInterceptedRequest!: (request: Request) => void;
  const interceptedRequest = new Promise<Request>((resolve) => {
    resolveInterceptedRequest = resolve;
  });
  await page.route("**/api/webhooks/log", async (route) => {
    resolveInterceptedRequest(route.request());
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({ id: "synthetic-intercepted-result" }),
    });
  });

  await page.goto(API_DOCS_PATH);
  await expect(page.locator(".swagger-ui")).toBeVisible();

  await page.getByRole("button", { name: "Authorize", exact: true }).click();
  const bearerAuth = page.locator(".auth-container").filter({
    hasText: "WebhookBearer",
  });
  await bearerAuth
    .getByRole("textbox", { name: "auth-bearer-value", exact: true })
    .fill(SYNTHETIC_BEARER);
  await page
    .getByRole("button", { name: "Apply credentials", exact: true })
    .click();
  await page.getByRole("button", { name: "Close", exact: true }).click();

  const typedOperation = page.locator(".swagger-ui .opblock-post").filter({
    has: page.locator(".opblock-summary-path", {
      hasText: "/api/webhooks/{type}",
    }),
  });
  await typedOperation.locator(".opblock-summary").click();
  await typedOperation
    .getByRole("button", { name: "Try it out", exact: true })
    .click();
  await typedOperation
    .locator("tr")
    .filter({ has: page.locator(".parameter__name", { hasText: "type" }) })
    .getByRole("combobox")
    .selectOption("log");
  await typedOperation.locator("textarea.body-param__text").fill(
    JSON.stringify({
      level: "info",
      source: "synthetic-e2e-source",
      message: "Synthetic request intercepted before the webhook pipeline.",
    }),
  );
  await typedOperation
    .getByRole("button", { name: "Execute", exact: true })
    .click();

  const request = await interceptedRequest;
  expect(request.headers().authorization).toBe(`Bearer ${SYNTHETIC_BEARER}`);
  expect(request.headers()).not.toHaveProperty("x-inspoter-workspace");
  expect(request.postDataJSON()).toEqual({
    level: "info",
    source: "synthetic-e2e-source",
    message: "Synthetic request intercepted before the webhook pipeline.",
  });
  await expect(
    typedOperation
      .locator(".live-responses-table .response-col_status")
      .filter({ hasText: "201" }),
  ).toBeVisible();

  await page.reload();
  const browserStorage = await page.evaluate(() => ({
    local: Object.values(localStorage),
    session: Object.values(sessionStorage),
  }));
  expect(JSON.stringify(browserStorage)).not.toContain(SYNTHETIC_BEARER);
  expect(pageErrors).toEqual([]);
  expect(refractConsoleErrors).toEqual([]);
});
