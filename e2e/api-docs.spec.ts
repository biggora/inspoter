import fs from "node:fs";
import path from "node:path";
import type { Request } from "@playwright/test";

import { expect, test } from "./fixtures/test";
import { login } from "./utils/auth";

// specs/openapi.json is the single source of truth for what the Swagger
// reference documents, and scripts/check-public-openapi.mjs is the one place
// that pins which paths and methods may appear in it. Reading the spec here
// keeps this assertion honest without making every new route a three-file edit.
// Resolved from the working directory (the repository root, where
// playwright.config.ts lives) because specs are transpiled to CommonJS here,
// which makes `import.meta.url` a load-time SyntaxError.
const spec = JSON.parse(
  fs.readFileSync(path.resolve(process.cwd(), "specs/openapi.json"), "utf8"),
) as {
  info: { version: string; license?: unknown };
  paths: Record<string, Record<string, unknown>>;
};
const expectedOperations: Record<string, string[]> = Object.fromEntries(
  Object.entries(spec.paths).map(([name, item]) => [
    name,
    Object.keys(item).filter((key) => key !== "parameters"),
  ]),
);
const expectedPaths = Object.keys(expectedOperations);
const expectedOperationCount = Object.values(expectedOperations).reduce(
  (sum, methods) => sum + methods.length,
  0,
);

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

test("authenticated operator opens the documented Swagger reference without external requests", async ({
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

  // Swagger UI renders one operation block (and therefore one
  // `.opblock-summary-path`) per HTTP method on every path, so a path with
  // both GET and POST contributes two summaries. Assert the operation count
  // and that the rendered paths — deduplicated — are exactly the spec's set.
  const operationPaths = page.locator(".swagger-ui .opblock-summary-path");
  await expect(operationPaths).toHaveCount(expectedOperationCount);
  expect(
    Array.from(
      new Set(
        (await operationPaths.allTextContents()).map((path) => path.trim()),
      ),
    ).sort(),
  ).toEqual([...expectedPaths].sort());

  const escapeRegExp = (value: string) =>
    value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  for (const [path, methods] of Object.entries(expectedOperations)) {
    // hasText is a substring match, so longer sibling paths (e.g. the
    // `/slack` variant of `/api/discord/webhooks/{webhookId}/{token}`) would
    // shadow shorter ones. Anchor the regex to the full path text instead.
    const pathLocator = page.locator(".opblock-summary-path", {
      hasText: new RegExp(`^${escapeRegExp(path)}$`),
    });
    for (const method of methods) {
      await expect(
        page.locator(`.swagger-ui .opblock-${method}`).filter({
          has: pathLocator,
        }),
      ).toHaveCount(1);
    }
  }
  expect(await page.locator(".swagger-ui .opblock-summary").count()).toBe(
    expectedOperationCount,
  );
  await expect(page.getByText("/api/services", { exact: false })).toHaveCount(
    0,
  );

  page.off("request", recordExternalRequest);
  expect(externalRequests).toEqual([]);
});

test("Swagger reference does not nest a second main landmark", async ({
  page,
}) => {
  await login(page);
  await page.goto(API_DOCS_PATH);

  await expect(page.locator(".swagger-ui")).toBeVisible();
  // The vendored bundle emits <main id="operations">; the component swaps it
  // for a div with the same id so deep links keep working. Waiting on the
  // #operations element itself (any tag) first keeps this stable while the
  // asynchronous initial render — and the swap that follows it — settle.
  await expect(page.locator(".swagger-ui #operations")).toBeVisible();
  await expect(page.locator("main#operations")).toHaveCount(0);
  await expect(page.locator(".swagger-ui div#operations")).toHaveCount(1);
  await expect(page.getByRole("main")).toHaveCount(1);
});

test("Swagger reference exposes current metadata and accessible controls", async ({
  page,
}) => {
  expect(spec.info.version).toBe("0.5.7");
  expect(spec.info.license).toBeUndefined();

  await login(page);
  await page.goto(API_DOCS_PATH);
  await expect(page.locator(".swagger-ui")).toBeVisible();
  await expect(page.locator(".swagger-ui .version")).toContainText("0.5.7");
  await expect(page.getByText("UNLICENSED", { exact: true })).toHaveCount(0);

  const contrastRatio = async (selector: string) =>
    page
      .locator(selector)
      .first()
      .evaluate((element) => {
        const parse = (color: string) =>
          color
            .match(/[\d.]+/g)!
            .slice(0, 3)
            .map(Number)
            .map((channel) => channel / 255)
            .map((channel) =>
              channel <= 0.04045
                ? channel / 12.92
                : ((channel + 0.055) / 1.055) ** 2.4,
            );
        const luminance = (color: string) => {
          const [red, green, blue] = parse(color);
          return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
        };
        const styles = getComputedStyle(element);
        const foreground = luminance(styles.color);
        const background = luminance(styles.backgroundColor);
        return (
          (Math.max(foreground, background) + 0.05) /
          (Math.min(foreground, background) + 0.05)
        );
      });

  expect(
    await contrastRatio(".swagger-ui .btn.authorize"),
  ).toBeGreaterThanOrEqual(4.5);
  for (const method of ["get", "post", "put", "delete", "patch"]) {
    const badge = `.swagger-ui .opblock-${method} .opblock-summary-method`;
    if ((await page.locator(badge).count()) > 0) {
      expect(await contrastRatio(badge)).toBeGreaterThanOrEqual(4.5);
    }
  }

  const overlaps = await page.locator(".opblock-summary").evaluateAll((rows) =>
    rows.flatMap((row, rowIndex) => {
      const boxes = Array.from(row.children).map((child) =>
        child.getBoundingClientRect(),
      );
      return boxes.flatMap((box, index) =>
        boxes
          .slice(index + 1)
          .flatMap((other) =>
            box.right > other.left &&
            other.right > box.left &&
            box.bottom > other.top &&
            other.bottom > box.top
              ? [`${rowIndex}:${index}`]
              : [],
          ),
      );
    }),
  );
  expect(overlaps).toEqual([]);

  await page.evaluate(() => document.documentElement.classList.add("dark"));
  const documentationBackground = await page
    .locator('[data-slot="swagger-documentation"]')
    .evaluate((element) => getComputedStyle(element).backgroundColor);
  const schemeBackground = await page
    .locator(".swagger-ui .scheme-container")
    .evaluate((element) => getComputedStyle(element).backgroundColor);
  expect(documentationBackground).not.toBe("rgb(255, 255, 255)");
  expect(schemeBackground).not.toBe("rgb(255, 255, 255)");
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
