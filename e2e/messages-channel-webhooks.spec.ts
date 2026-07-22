import type { Browser, BrowserContext, Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

import { expect, test } from "./fixtures/test";
import { login } from "./utils/auth";

test.use({ trace: "off", screenshot: "off", video: "off" });

interface CreatedCategory {
  id: string;
}

interface CreatedChannel {
  id: string;
  name: string;
}

interface CreatedMember {
  id: string;
}

interface CreatedWorkspace {
  id: string;
  name: string;
}

interface MessageFixture {
  workspaceId: string;
  workspaceName: string;
  categoryId: string;
  channel: CreatedChannel;
}

async function activeWorkspace(page: Page) {
  const sidebar = page.locator("[data-workspace-id]").first();
  let workspaceId = await sidebar.evaluateAll(
    (elements) => elements[0]?.getAttribute("data-workspace-id") ?? null,
  );
  if (!workspaceId) {
    const categoriesRequest = page.waitForRequest((request) => {
      const url = new URL(request.url());
      return (
        url.pathname === "/api/message-categories" && request.method() === "GET"
      );
    });
    await page.reload();
    workspaceId = (await categoriesRequest).headers()["x-inspoter-workspace"];
  }
  if (!workspaceId) {
    throw new Error("An active workspace id is required for this E2E test.");
  }

  const workspaceName = await page.evaluate(async (workspace) => {
    const response = await fetch("/api/workspaces", {
      headers: { "x-inspoter-workspace": workspace },
    });
    if (!response.ok) return "";
    const workspaces = (await response.json()) as Array<{
      id: string;
      name: string;
    }>;
    return workspaces.find((item) => item.id === workspace)?.name ?? "";
  }, workspaceId);
  if (!workspaceName) {
    throw new Error("An active workspace name is required for this E2E test.");
  }
  return { workspaceId, workspaceName };
}

async function postJson<T>(
  page: Page,
  workspaceId: string,
  path: string,
  body: object,
): Promise<T> {
  const result = await page.evaluate(
    async ({ requestPath, workspace, payload }) => {
      const response = await fetch(requestPath, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-inspoter-workspace": workspace,
        },
        body: JSON.stringify(payload),
      });
      return {
        ok: response.ok,
        status: response.status,
        body: response.ok ? await response.json() : null,
      };
    },
    { requestPath: path, workspace: workspaceId, payload: body },
  );

  if (!result.ok) {
    throw new Error(`Test setup POST ${path} failed with ${result.status}.`);
  }
  return result.body as T;
}

async function deleteResource(
  page: Page,
  workspaceId: string,
  path: string,
): Promise<number> {
  return page.evaluate(
    async ({ requestPath, workspace }) =>
      (
        await fetch(requestPath, {
          method: "DELETE",
          headers: { "x-inspoter-workspace": workspace },
        })
      ).status,
    { requestPath: path, workspace: workspaceId },
  );
}

async function createMessageFixture(
  page: Page,
  registerCategory: (id: string) => void,
  uniqueName: (baseName: string) => string,
): Promise<MessageFixture> {
  await login(page);
  await page.goto("/messages");
  const { workspaceId, workspaceName } = await activeWorkspace(page);
  const category = await postJson<CreatedCategory>(
    page,
    workspaceId,
    "/api/message-categories",
    { name: uniqueName("E2E Messages") },
  );
  registerCategory(category.id);
  const channel = await postJson<CreatedChannel>(
    page,
    workspaceId,
    "/api/channels",
    { categoryId: category.id, name: uniqueName("webhooks") },
  );
  await page.reload();
  const channelHeading = page.getByRole("heading", {
    name: channel.name,
    exact: true,
  });
  if ((await page.viewportSize())?.width === 375) {
    await page
      .getByRole("button", { name: "Открыть каналы", exact: true })
      .click();
    await page
      .getByRole("dialog", { name: "Категории и каналы", exact: true })
      .getByRole("button", { name: channel.name, exact: true })
      .click();
  }
  await expect(channelHeading).toBeVisible();
  return {
    workspaceId,
    workspaceName,
    categoryId: category.id,
    channel,
  };
}

async function createMemberContext(
  browser: Browser,
  baseURL: string,
  username: string,
  password: string,
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({
    baseURL,
    viewport: { width: 1440, height: 900 },
    permissions: ["clipboard-read", "clipboard-write"],
  });
  const appOrigin = new URL(baseURL).origin;
  await context.route("**/*", async (route) => {
    const target = new URL(route.request().url());
    if (
      (target.protocol === "http:" || target.protocol === "https:") &&
      target.origin !== appOrigin
    ) {
      await route.abort("blockedbyclient");
      return;
    }
    await route.continue();
  });
  const page = await context.newPage();
  await login(page, username, password);
  return { context, page };
}

function isExpectedSecretUrl(value: string, baseURL: string): boolean {
  try {
    const url = new URL(value);
    const expectedOrigin = new URL(baseURL).origin;
    return (
      url.origin === expectedOrigin &&
      /^\/api\/webhooks\/channels\/[A-Za-z0-9_-]+\/[0-9a-f]{48}$/.test(
        url.pathname,
      ) &&
      url.search === "" &&
      url.hash === ""
    );
  } catch {
    return false;
  }
}

async function postSecret(
  page: Page,
  secretUrl: string,
  content: string,
): Promise<number> {
  return page.evaluate(
    async ({ endpoint, message }) =>
      (
        await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: message }),
        })
      ).status,
    { endpoint: secretUrl, message: content },
  );
}

async function expectNoBlockingAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  const blocking = results.violations
    .filter(
      (violation) =>
        violation.impact === "critical" || violation.impact === "serious",
    )
    .map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      targets: violation.nodes.map((node) => node.target),
    }));
  expect(blocking).toEqual([]);
}

test("desktop member manages a channel webhook, inbound delivery survives reload, and workspace switching stays isolated", async ({
  baseURL,
  browser,
  page,
  testData,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1440", "desktop acceptance");
  test.setTimeout(60_000);
  if (!baseURL) throw new Error("Playwright baseURL is required.");

  const fixture = await createMessageFixture(
    page,
    testData.registerCategory,
    testData.name,
  );
  const memberName = testData.name("webhook-member");
  const memberPassword = "member-local-test-password";
  const member = await postJson<CreatedMember>(
    page,
    fixture.workspaceId,
    `/api/workspaces/${fixture.workspaceId}/members`,
    { username: memberName, password: memberPassword },
  );
  const secondWorkspace = await postJson<CreatedWorkspace>(
    page,
    fixture.workspaceId,
    "/api/workspaces",
    { name: testData.name("Isolated workspace") },
  );

  let memberContext: BrowserContext | undefined;
  let secretUrl = "";
  try {
    const memberSession = await createMemberContext(
      browser,
      baseURL,
      memberName,
      memberPassword,
    );
    memberContext = memberSession.context;
    const memberPage = memberSession.page;
    await memberPage.goto("/messages");

    const rowActions = memberPage.getByRole("button", {
      name: `Действия канала «${fixture.channel.name}»`,
      exact: true,
    });
    await rowActions.click();
    await memberPage
      .getByRole("menuitem", { name: "Настройки канала", exact: true })
      .click();
    const settingsDialog = memberPage.getByRole("dialog", {
      name: `Настройки канала #${fixture.channel.name}`,
      exact: true,
    });
    await expect(settingsDialog).toBeVisible();
    await settingsDialog
      .getByRole("button", { name: "Закрыть", exact: true })
      .click();
    await expect(settingsDialog).toBeHidden();
    await expect(rowActions).toBeFocused();

    const headerSettings = memberPage.getByRole("button", {
      name: `Настройки канала «${fixture.channel.name}»`,
      exact: true,
    });
    await headerSettings.click();
    await settingsDialog
      .getByRole("tab", { name: "Вебхуки", exact: true })
      .click();
    const webhookName = testData.name("CI incoming");
    await settingsDialog
      .getByLabel("Название webhook", { exact: true })
      .fill(webhookName);
    await settingsDialog
      .getByRole("button", { name: "Создать webhook", exact: true })
      .click();

    const urlField = settingsDialog.getByLabel("URL webhook", { exact: true });
    const curlField = settingsDialog.getByLabel("Готовая команда cURL", {
      exact: true,
    });
    await expect(urlField).toBeVisible();
    await expect(curlField).toBeVisible();
    secretUrl = await urlField.inputValue();
    expect(isExpectedSecretUrl(secretUrl, baseURL)).toBe(true);
    expect(
      await curlField.evaluate((element) => {
        const value = (element as HTMLTextAreaElement).value;
        return value.startsWith("curl -X POST '") && value.includes("content");
      }),
    ).toBe(true);
    await settingsDialog
      .getByRole("button", { name: "Копировать URL", exact: true })
      .click();
    await expect(
      settingsDialog.getByRole("button", {
        name: "URL скопирован",
        exact: true,
      }),
    ).toBeVisible();
    await settingsDialog
      .getByRole("button", { name: "Копировать cURL", exact: true })
      .click();
    await expect(
      settingsDialog.getByRole("button", {
        name: "cURL скопирован",
        exact: true,
      }),
    ).toBeVisible();

    const inboundText = testData.name("external-delivery");
    expect(await postSecret(memberPage, secretUrl, inboundText)).toBe(201);
    await settingsDialog
      .getByRole("button", { name: "Закрыть", exact: true })
      .click();
    await expect(headerSettings).toBeFocused();
    expect(
      await memberPage.evaluate(
        (value) =>
          document.body.textContent?.includes(value) ||
          Object.values(localStorage).some((entry) => entry.includes(value)) ||
          Object.values(sessionStorage).some((entry) => entry.includes(value)),
        secretUrl,
      ),
    ).toBe(false);

    await memberPage.reload();
    await expect(
      memberPage.getByText(inboundText, { exact: true }),
    ).toBeVisible();
    await expect(
      memberPage.getByText("Внешний источник", { exact: true }),
    ).toBeVisible();

    await headerSettings.click();
    await settingsDialog
      .getByRole("tab", { name: "Вебхуки", exact: true })
      .click();
    const webhookRow = settingsDialog
      .getByRole("list", { name: "Вебхуки канала", exact: true })
      .getByRole("listitem")
      .filter({ hasText: webhookName });
    await webhookRow
      .getByRole("button", { name: "Отозвать", exact: true })
      .click();
    const revokeDialog = memberPage.getByRole("alertdialog", {
      name: `Отозвать webhook «${webhookName}»?`,
      exact: true,
    });
    await revokeDialog
      .getByRole("button", { name: "Отозвать", exact: true })
      .click();
    await expect(
      webhookRow.getByText("Отозван", { exact: true }),
    ).toBeVisible();
    await settingsDialog
      .getByRole("button", { name: "Закрыть", exact: true })
      .click();
    expect(
      await postSecret(memberPage, secretUrl, "rejected-after-revoke"),
    ).toBe(401);
    secretUrl = "";
    await expectNoBlockingAxeViolations(memberPage);
    await memberContext.close();
    memberContext = undefined;

    await page.reload();
    const originalWorkspaceTrigger = page.getByRole("button", {
      name: new RegExp(
        fixture.workspaceName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
      ),
    });
    await originalWorkspaceTrigger.click();
    await page
      .getByRole("menuitem", { name: secondWorkspace.name, exact: true })
      .click();
    await expect(
      page.locator(`button[data-workspace-id="${secondWorkspace.id}"]`),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: fixture.channel.name, exact: true }),
    ).toHaveCount(0);
  } finally {
    secretUrl = "";
    await memberContext?.close();
    const activeId = await page
      .locator("button[data-workspace-id]")
      .first()
      .getAttribute("data-workspace-id")
      .catch(() => null);
    if (activeId === secondWorkspace.id) {
      const secondTrigger = page.getByRole("button", {
        name: new RegExp(
          secondWorkspace.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
        ),
      });
      await secondTrigger.click();
      await page
        .getByRole("menuitem", { name: fixture.workspaceName, exact: true })
        .click();
      await expect(
        page.locator(`button[data-workspace-id="${fixture.workspaceId}"]`),
      ).toBeVisible();
    }
    const removeStatus = await deleteResource(
      page,
      fixture.workspaceId,
      `/api/workspaces/${fixture.workspaceId}/members/${member.id}`,
    );
    expect([204, 404]).toContain(removeStatus);
  }
});

test("multiline composer keeps Enter as a newline and sends with Ctrl+Enter", async ({
  page,
  testData,
}, testInfo) => {
  test.setTimeout(40_000);
  const usesFixtureCleanup = testInfo.project.name === "desktop-1440";
  const fixture = await createMessageFixture(
    page,
    usesFixtureCleanup ? testData.registerCategory : () => {},
    testData.name,
  );
  const composer = page.getByLabel(
    `Сообщение в канале #${fixture.channel.name}`,
    { exact: true },
  );
  const firstLine = testData.name("first-line");
  const secondLine = "second-line";
  await composer.fill(firstLine);
  await composer.press("Enter");
  await composer.pressSequentially(secondLine);
  await expect(composer).toHaveValue(`${firstLine}\n${secondLine}`);
  const sent = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname ===
        `/api/channels/${fixture.channel.id}/messages` &&
      response.request().method() === "POST",
  );
  await composer.press("Control+Enter");
  expect((await sent).status()).toBe(201);
  await expect(composer).toHaveValue("");
  await expect(page.getByText(firstLine, { exact: false })).toBeVisible();
  await expect(page.getByText("Оператор", { exact: true })).toBeVisible();
  if (!usesFixtureCleanup) {
    expect([204, 404]).toContain(
      await deleteResource(
        page,
        fixture.workspaceId,
        `/api/message-categories/${fixture.categoryId}`,
      ),
    );
  }
});

test("mobile uses one channel Sheet and restores focus to the exact Sheet and header openers", async ({
  page,
  testData,
}, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-375", "mobile acceptance");
  test.setTimeout(40_000);
  const fixture = await createMessageFixture(page, () => {}, testData.name);
  await expect(page.locator("select")).toHaveCount(0);
  const sheetOpener = page.getByRole("button", {
    name: "Открыть каналы",
    exact: true,
  });
  await sheetOpener.click();
  const sheet = page.getByRole("dialog", {
    name: "Категории и каналы",
    exact: true,
  });
  await expect(sheet).toBeVisible();
  await expect(page.locator('[data-slot="sheet-content"]:visible')).toHaveCount(
    1,
  );
  await expectNoBlockingAxeViolations(page);

  const channelActions = sheet.getByRole("button", {
    name: `Действия канала «${fixture.channel.name}»`,
    exact: true,
  });
  await channelActions.click();
  await page
    .getByRole("menuitem", { name: "Настройки канала", exact: true })
    .click();
  const settingsDialog = page.getByRole("dialog", {
    name: `Настройки канала #${fixture.channel.name}`,
    exact: true,
  });
  await expect(settingsDialog).toBeVisible();
  await settingsDialog
    .getByRole("button", { name: "Закрыть", exact: true })
    .click();
  await expect(settingsDialog).toBeHidden();
  await expect(channelActions).toBeFocused();

  await sheet.getByRole("button", { name: "Закрыть", exact: true }).click();
  await expect(sheet).toBeHidden();
  await expect(sheetOpener).toBeFocused();
  await expectNoBlockingAxeViolations(page);
  expect([204, 404]).toContain(
    await deleteResource(
      page,
      fixture.workspaceId,
      `/api/message-categories/${fixture.categoryId}`,
    ),
  );
});
