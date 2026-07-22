import type { Page, Route } from "@playwright/test";

import { expect, test } from "./fixtures/test";
import { login } from "./utils/auth";

const REMIX_ICON_STYLESHEET_URL =
  "https://cdnjs.cloudflare.com/ajax/libs/remixicon/4.5.0/remixicon.min.css";
const GOOGLE_FONTS_STYLESHEET_URL =
  "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap";
const EXPECTED_BLOCKED_STYLESHEET_URLS = new Set([
  REMIX_ICON_STYLESHEET_URL,
  GOOGLE_FONTS_STYLESHEET_URL,
]);

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

function captureUnexpectedBrowserErrors(page: Page) {
  const errors: string[] = [];
  page.on("console", (message) => {
    const text = message.text();
    const location = message.location();
    // The shared fixture intentionally blocks the exact external stylesheets
    // declared by the app shell. Their Chromium diagnostics are expected.
    const expectedStylesheetBlock =
      message.type() === "error" &&
      text ===
        "Failed to load resource: net::ERR_BLOCKED_BY_CLIENT.Inspector" &&
      EXPECTED_BLOCKED_STYLESHEET_URLS.has(location.url) &&
      location.lineNumber === 0 &&
      location.columnNumber === 0;
    if (message.type() === "error" && !expectedStylesheetBlock) {
      errors.push(text);
    }
  });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

function expectNoUnexpectedBrowserErrors(errors: string[]) {
  expect(errors, "operational flow emitted browser errors").toEqual([]);
}

test.beforeEach(async ({ page }) => {
  await login(page);
});

test("server power confirmation cancels safely and submits exactly once", async ({
  page,
}) => {
  const browserErrors = captureUnexpectedBrowserErrors(page);
  const powerRequests: Array<{ action?: string }> = [];
  let releasePowerRequest: (() => void) | undefined;
  const powerRequestCanFinish = new Promise<void>((resolve) => {
    releasePowerRequest = resolve;
  });
  let markPowerResponseFinished: (() => void) | undefined;
  const powerResponseFinished = new Promise<void>((resolve) => {
    markPowerResponseFinished = resolve;
  });

  await page.route("**/api/servers", (route) =>
    json(route, {
      servers: [
        {
          localServerId: "server-1",
          origin: "provider",
          providerCredentialId: "mock-cred-1",
          providerId: "mock-hetzner",
          remoteServerId: "server-1",
          providerAvailability: "present",
          powerActionsAvailable: true,
          metrics: {
            state: "not_configured",
            receivedAt: null,
            cpuUsagePercent: null,
            load1: null,
            load5: null,
            load15: null,
            memoryTotalBytes: null,
            memoryAvailableBytes: null,
            swapTotalBytes: null,
            swapFreeBytes: null,
            filesystemTotalBytes: null,
            filesystemAvailableBytes: null,
            uptimeSeconds: null,
          },
          name: "edge-01",
          type: "cx22",
          status: "running",
          ip: "192.0.2.10",
          cpu: "2 vCPU",
          ram: "4 GB",
          disk: "40 GB",
          os: "Ubuntu 24.04",
          location: "Helsinki",
        },
      ],
      providerErrors: [],
    }),
  );
  await page.route(
    "**/api/servers/mock-hetzner/server-1/power",
    async (route) => {
      expect(route.request().method()).toBe("POST");
      powerRequests.push((await route.request().postDataJSON()) as object);
      await powerRequestCanFinish;
      await json(route, { ok: true });
      markPowerResponseFinished?.();
    },
  );
  await page.route("**/api/servers/mock-hetzner/server-1", (route) =>
    json(route, {
      localServerId: "server-1",
      origin: "provider",
      providerCredentialId: "mock-cred-1",
      providerId: "mock-hetzner",
      remoteServerId: "server-1",
      providerAvailability: "present",
      powerActionsAvailable: true,
      metrics: {
        state: "not_configured",
        receivedAt: null,
        cpuUsagePercent: null,
        load1: null,
        load5: null,
        load15: null,
        memoryTotalBytes: null,
        memoryAvailableBytes: null,
        swapTotalBytes: null,
        swapFreeBytes: null,
        filesystemTotalBytes: null,
        filesystemAvailableBytes: null,
        uptimeSeconds: null,
      },
      name: "edge-01",
      type: "cx22",
      status: "running",
      ip: "192.0.2.10",
      cpu: "2 vCPU",
      ram: "4 GB",
      disk: "40 GB",
      os: "Ubuntu 24.04",
      location: "Helsinki",
    }),
  );

  await page.goto("/servers");
  const server = page.getByRole("group", { name: "Сервер «edge-01»" });
  const restart = server.getByRole("button", {
    name: "Перезапустить",
    exact: true,
  });

  await restart.click();
  const dialog = page.getByRole("alertdialog", {
    name: "Перезапустить «edge-01»?",
  });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Отмена" })).toBeFocused();
  await dialog.getByRole("button", { name: "Отмена" }).click();
  await expect(dialog).toBeHidden();
  await expect(restart).toBeFocused();
  expect(powerRequests).toHaveLength(0);

  await restart.click();
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(restart).toBeFocused();
  expect(powerRequests).toHaveLength(0);

  await restart.click();
  await dialog.getByRole("button", { name: "Подтвердить" }).click();
  await expect.poll(() => powerRequests.length).toBe(1);
  expect(powerRequests).toEqual([{ action: "restart" }]);
  await expect(
    server.getByRole("button", { name: "Перезапускается…" }),
  ).toBeDisabled();
  await expect(server).toBeFocused();

  releasePowerRequest?.();
  await powerResponseFinished;
  expectNoUnexpectedBrowserErrors(browserErrors);
});

test("mobile messages navigation closes its Sheet and composer uses newline, keyboard send, and button send", async ({
  page,
}) => {
  const browserErrors = captureUnexpectedBrowserErrors(page);
  const sentMessageBodies: unknown[] = [];
  const messageReadMethods: string[] = [];

  await page.setViewportSize({ width: 375, height: 800 });
  await page.route("**/api/message-categories", (route) =>
    json(route, [
      {
        id: "category-1",
        name: "Operations",
        channels: [
          {
            id: "channel-1",
            messageCategoryId: "category-1",
            name: "deploys",
          },
        ],
      },
    ]),
  );
  await page.route("**/api/channels/channel-1/messages*", async (route) => {
    const method = route.request().method();
    if (method === "POST") {
      const body = await route.request().postDataJSON();
      sentMessageBodies.push(body);
      await json(route, { id: `sent-${sentMessageBodies.length}` }, 201);
      return;
    }
    expect(method, "message list must use the GET read branch").toBe("GET");
    messageReadMethods.push(method);
    await json(route, {
      items: [
        {
          id: "message-1",
          channelId: "channel-1",
          content: "Deployment completed",
          author: "deploy-bot",
          createdAt: "2026-07-17T08:00:00.000Z",
        },
      ],
      nextCursor: null,
    });
  });

  await page.goto("/messages");
  await page
    .getByRole("button", { name: "Открыть каналы", exact: true })
    .click();
  const sheet = page.getByRole("dialog", { name: "Категории и каналы" });
  await expect(sheet).toBeVisible();

  const category = sheet.getByRole("button", {
    name: "Operations",
    exact: true,
  });
  await expect(category).toHaveAttribute("aria-expanded", "true");
  await category.click();
  await expect(category).toHaveAttribute("aria-expanded", "false");
  await category.click();
  await sheet.getByRole("button", { name: "deploys", exact: true }).click();

  await expect(sheet).toBeHidden();
  await expect(
    page.getByRole("heading", { name: "deploys", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Deployment completed")).toBeVisible();
  expect(messageReadMethods).toEqual(["GET"]);

  const composer = page.getByPlaceholder("Написать в #deploys...");
  await composer.fill("status via keyboard");
  await composer.press("Enter");
  expect(sentMessageBodies).toHaveLength(0);
  await expect(composer).toHaveValue("status via keyboard\n");
  await composer.pressSequentially("second line");
  await composer.press("Control+Enter");
  await expect.poll(() => sentMessageBodies.length).toBe(1);
  expect(sentMessageBodies).toEqual([
    { content: "status via keyboard\nsecond line" },
  ]);
  await expect(composer).toHaveValue("");

  await composer.fill("status via button");
  const send = page.getByRole("button", {
    name: "Отправить сообщение",
    exact: true,
  });
  await expect(send).toBeEnabled();
  await send.click();
  await expect.poll(() => sentMessageBodies.length).toBe(2);
  expect(sentMessageBodies).toEqual([
    { content: "status via keyboard\nsecond line" },
    { content: "status via button" },
  ]);
  await expect(composer).toHaveValue("");
  await expect(
    page.getByRole("button", { name: /Прикрепить файл/ }),
  ).toHaveCount(0);
  expectNoUnexpectedBrowserErrors(browserErrors);
});

test("mail row selection renders the corresponding message detail", async ({
  page,
}) => {
  const browserErrors = captureUnexpectedBrowserErrors(page);

  await page.route("**/api/mail/accounts", (route) =>
    json(route, [
      {
        id: "acc-1",
        kind: "IMAP",
        mode: "MOCK",
        name: "Рабочая почта",
        email: "mail-ops@example.com",
        imapHost: "imap.example.com",
        imapPort: 993,
        imapSecurity: "SSL",
        smtpHost: "smtp.example.com",
        smtpPort: 465,
        smtpSecurity: "SSL",
        username: "ops",
        maskedHint: "••••",
        isValid: true,
        lastCheckedAt: null,
        isActive: true,
        syncStatus: "IDLE",
        syncError: null,
        lastSyncAt: null,
        createdAt: "2026-07-17T09:00:00.000Z",
        updatedAt: "2026-07-17T09:00:00.000Z",
      },
    ]),
  );
  await page.route("**/api/mail/accounts/acc-1/folders", (route) =>
    json(route, [
      {
        id: "folder-inbox",
        path: "INBOX",
        name: "Входящие",
        specialUse: "INBOX",
        position: 0,
        unreadCount: 1,
      },
    ]),
  );
  await page.route("**/api/mail?*", (route) =>
    json(route, {
      items: [
        {
          id: "mail-1",
          from: "ops@example.com",
          fromName: "Ops Team",
          subject: "Incident resolved",
          snippet: "The primary service is healthy again.",
          isRead: false,
          isAnswered: false,
          isFlagged: false,
          hasAttachments: false,
          receivedAt: "2026-07-17T09:15:00.000Z",
          accountId: "acc-1",
          folderId: "folder-inbox",
          labels: [],
        },
      ],
      nextCursor: null,
    }),
  );
  await page.route("**/api/mail/mail-1", (route) =>
    json(route, {
      id: "mail-1",
      accountId: "acc-1",
      folderId: "folder-inbox",
      accountKind: "IMAP",
      from: "ops@example.com",
      fromName: "Ops Team",
      to: [{ name: null, address: "operator@inspot.local" }],
      cc: [],
      subject: "Incident resolved",
      snippet: "The primary service is healthy again.",
      bodyText: "The primary service is healthy again.\nNo action is required.",
      bodyHtml: null,
      isRead: false,
      isAnswered: false,
      isFlagged: false,
      hasAttachments: false,
      receivedAt: "2026-07-17T09:15:00.000Z",
      attachments: [],
      labels: [],
    }),
  );

  await page.goto("/mail");
  const messageRow = page.getByRole("button", {
    name: /Ops Team.*Incident resolved/,
  });
  await expect(messageRow).toBeVisible();
  await messageRow.click();

  await expect(
    page.getByRole("heading", { name: "Incident resolved", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("ops@example.com", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "The primary service is healthy again.\nNo action is required.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    page.getByText("Кому: operator@inspot.local", { exact: true }),
  ).toBeVisible();
  expectNoUnexpectedBrowserErrors(browserErrors);
});

test("logs apply filters and reveal detail through the explicit expand button", async ({
  page,
}) => {
  const browserErrors = captureUnexpectedBrowserErrors(page);
  const requestedQueries: URLSearchParams[] = [];
  const logEntry = {
    id: "log-error",
    level: "error",
    source: "scheduler",
    message: "Nightly backup failed: permission denied",
    timestamp: "2026-07-17T10:20:30.123Z",
  };

  await page.route("**/api/logs?*", (route) => {
    const params = new URL(route.request().url()).searchParams;
    requestedQueries.push(new URLSearchParams(params));
    const items = params.get("level") === "error" ? [logEntry] : [];
    return json(route, { items, nextCursor: null });
  });

  await page.goto("/logs");
  await expect(page.locator("#log-error-detail")).toHaveCount(0);
  const levelFilter = page.getByRole("combobox", {
    name: "Фильтр по уровню",
  });
  await levelFilter.click();
  await page.getByRole("option", { name: "Ошибка", exact: true }).click();
  await expect
    .poll(() =>
      requestedQueries.some((params) => params.get("level") === "error"),
    )
    .toBe(true);

  const expand = page.locator('button[aria-controls="log-error-detail"]');
  await expect(expand).toHaveAttribute("aria-expanded", "false");
  const detailId = await expand.getAttribute("aria-controls");
  expect(detailId).toBe("log-error-detail");
  await expand.click();
  await expect(expand).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator("#log-error-detail")).toContainText(
    logEntry.message,
  );
  await expect(
    page.getByRole("button", {
      name: "Скрыть детали записи журнала",
      exact: true,
    }),
  ).toBeVisible();
  expectNoUnexpectedBrowserErrors(browserErrors);
});

test("domains retry performs one refresh and exposes its disabled transition", async ({
  page,
}) => {
  const browserErrors = captureUnexpectedBrowserErrors(page);
  let domainRscRequests = 0;
  let holdNextRequest = false;
  let releaseRefresh: (() => void) | undefined;
  const refreshCanFinish = new Promise<void>((resolve) => {
    releaseRefresh = resolve;
  });
  const emptyProvidersFixture = '"providers":[]';

  await page.route("**/domains?*", async (route) => {
    if (route.request().headers()["rsc"] !== "1") {
      await route.continue();
      return;
    }

    const response = await route.fetch();
    const originalBody = await response.text();
    if (!originalBody.includes(emptyProvidersFixture)) {
      await route.fulfill({ response, body: originalBody });
      return;
    }

    const providerError =
      domainRscRequests === 0 ? "Authentication failed" : "Timeout after 30s";
    const body = originalBody.replace(
      emptyProvidersFixture,
      `"providers":[{"providerId":"cloudflare","providerType":"cloudflare","mode":"real","domains":[],"error":"${providerError}"}]`,
    );
    expect(
      body,
      "domains RSC fixture must contain an empty providers list",
    ).not.toBe(originalBody);

    domainRscRequests += 1;
    if (holdNextRequest) await refreshCanFinish;
    await route.fulfill({ response, body });
  });

  await page
    .getByRole("navigation", { name: "Основная навигация" })
    .getByRole("link", { name: "Домены", exact: true })
    .click();
  const retry = page.getByRole("button", { name: "Повторить", exact: true });
  await expect(retry).toBeVisible();
  await expect(
    page.getByText("Cloudflare — Ошибка аутентификации провайдера.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByText("Authentication failed")).toHaveCount(0);
  const requestCountBeforeRetry = domainRscRequests;

  holdNextRequest = true;
  await retry.click();
  await expect.poll(() => domainRscRequests).toBe(requestCountBeforeRetry + 1);
  const pendingRetry = page.getByRole("button", {
    name: "Повтор…",
    exact: true,
  });
  await expect(pendingRetry).toBeDisabled();

  releaseRefresh?.();
  await expect(retry).toBeVisible();
  await expect(retry).toBeEnabled();
  await expect(
    page.getByText("Cloudflare — Не удалось получить данные от провайдера.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByText("Timeout after 30s")).toHaveCount(0);
  expect(domainRscRequests).toBe(requestCountBeforeRetry + 1);
  expectNoUnexpectedBrowserErrors(browserErrors);
});
