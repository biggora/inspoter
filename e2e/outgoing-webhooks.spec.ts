import type { Page } from "@playwright/test";

import { expect, test } from "./fixtures/test";
import { login } from "./utils/auth";

test.use({ trace: "off", screenshot: "off", video: "off" });

interface OutgoingWebhookDto {
  id: string;
  name: string;
}

async function activeWorkspaceId(page: Page): Promise<string> {
  const el = page.locator("[data-workspace-id]").first();
  const id = await el.getAttribute("data-workspace-id");
  if (!id) throw new Error("An active workspace id is required for this test.");
  return id;
}

async function deleteWebhooksNamed(
  page: Page,
  workspaceId: string,
  name: string,
): Promise<void> {
  await page.evaluate(
    async ({ workspace, targetName }) => {
      const res = await fetch("/api/outgoing-webhooks", {
        headers: { "x-inspoter-workspace": workspace },
      });
      if (!res.ok) return;
      const webhooks = (await res.json()) as Array<{
        id: string;
        name: string;
      }>;
      for (const webhook of webhooks) {
        if (webhook.name === targetName) {
          await fetch(`/api/outgoing-webhooks/${webhook.id}`, {
            method: "DELETE",
            headers: { "x-inspoter-workspace": workspace },
          });
        }
      }
    },
    { workspace: workspaceId, targetName: name },
  );
}

test("desktop operator creates, inspects, and deletes an outgoing webhook", async ({
  page,
  testData,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1440", "desktop acceptance");
  test.setTimeout(60_000);

  await login(page);
  await page.goto("/settings/outgoing-webhooks");

  const workspaceId = await activeWorkspaceId(page);
  const webhookName = testData.name("E2E outgoing");

  try {
    await expect(
      page.getByRole("heading", { name: "Исходящие вебхуки", exact: true }),
    ).toBeVisible();

    await page
      .getByRole("button", { name: "Новый вебхук", exact: true })
      .click();

    const dialog = page.getByRole("dialog", {
      name: "Новый вебхук",
      exact: true,
    });
    await expect(dialog).toBeVisible();

    await dialog.getByLabel("Название", { exact: true }).fill(webhookName);
    await dialog
      .getByLabel("URL эндпоинта", { exact: true })
      .fill("https://example.com/inspot-e2e");
    await dialog
      .getByRole("checkbox", { name: "Создан алерт", exact: true })
      .click();
    await dialog.getByRole("button", { name: "Создать", exact: true }).click();

    // Secret is shown exactly once, after creation.
    await expect(
      page.getByRole("dialog", { name: "Вебхук создан", exact: true }),
    ).toBeVisible();
    const secretBlock = page.locator("code").filter({ hasText: "whsec_" });
    await expect(secretBlock).toBeVisible();
    await page.getByRole("button", { name: "Готово", exact: true }).click();

    // Row appears with its URL and subscribed event.
    const row = page.getByRole("row").filter({ hasText: webhookName });
    await expect(row).toBeVisible();
    await expect(row.getByText("example.com/inspot-e2e")).toBeVisible();
    await expect(row.getByText("Создан алерт", { exact: true })).toBeVisible();
    await expect(row.getByText("Активен", { exact: true })).toBeVisible();

    // Delivery history opens (empty until the scheduler sends something).
    await row.getByRole("button", { name: "Доставки", exact: true }).click();
    const deliveriesDialog = page.getByRole("dialog", {
      name: `Доставки — ${webhookName}`,
      exact: true,
    });
    await expect(deliveriesDialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(deliveriesDialog).toBeHidden();

    // Delete via confirmation dialog.
    await row.getByRole("button", { name: "Удалить", exact: true }).click();
    const confirm = page.getByRole("alertdialog", {
      name: `Удалить «${webhookName}»?`,
      exact: true,
    });
    await confirm.getByRole("button", { name: "Удалить", exact: true }).click();
    await expect(
      page.getByRole("row").filter({ hasText: webhookName }),
    ).toHaveCount(0);
  } finally {
    await deleteWebhooksNamed(page, workspaceId, webhookName).catch(() => {});
  }
});
