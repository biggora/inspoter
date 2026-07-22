import type { Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

import { expect, test } from "./fixtures/test";
import { login } from "./utils/auth";

// Phase 5 mail client (plan §5): three-pane /mail against a real MOCK IMAP
// account — the deterministic mock driver (src/lib/mail/mock.ts) seeds INBOX
// with 30 messages (uids 1–30; unread on uids 1, 4, 7, …; attachments on
// uids 1/11/21), so sidebar badges, list rows, and the reading pane are all
// exercised end-to-end through the API + database, not route mocks.

const MOCK_INBOX_UNREAD = 10;

async function getWorkspaceId(page: Page): Promise<string> {
  const wsEl = page.locator("[data-workspace-id]").first();
  return (await wsEl.count()) > 0
    ? ((await wsEl.getAttribute("data-workspace-id")) ?? "")
    : "";
}

async function createMockMailAccount(
  page: Page,
  name: string,
): Promise<string> {
  const wsId = await getWorkspaceId(page);
  const result = await page.evaluate(
    async ([accountName, workspaceId]) => {
      const res = await fetch("/api/mail/accounts", {
        method: "POST",
        redirect: "manual",
        headers: {
          "Content-Type": "application/json",
          "x-inspoter-workspace": workspaceId,
        },
        body: JSON.stringify({
          name: accountName,
          email: "operator@inspot.local",
          imapHost: "imap.example.ru",
          imapPort: 993,
          imapSecurity: "SSL",
          smtpHost: "smtp.example.ru",
          smtpPort: 465,
          smtpSecurity: "SSL",
          username: "operator",
          password: "mock-app-password",
          mode: "MOCK",
        }),
      });
      return { status: res.status, body: (await res.json()) as unknown };
    },
    [name, wsId] as const,
  );
  expect(result.status).toBe(201);
  const body = result.body;
  if (
    typeof body !== "object" ||
    body === null ||
    !("id" in body) ||
    typeof body.id !== "string" ||
    body.id.trim().length === 0
  ) {
    throw new Error(
      "Mail account POST response must contain a non-empty string id.",
    );
  }
  return body.id;
}

// Account creation kicks off a fire-and-forget first sync; additionally
// trigger a manual sync (409 SYNC_IN_PROGRESS is fine — someone is already
// syncing) and wait until INBOX carries the deterministic unread count.
async function waitForInitialSync(page: Page, accountId: string) {
  const wsId = await getWorkspaceId(page);
  await page.evaluate(
    async ([id, workspaceId]) => {
      const res = await fetch(
        `/api/mail/accounts/${encodeURIComponent(id)}/sync`,
        {
          method: "POST",
          redirect: "manual",
          headers: { "x-inspoter-workspace": workspaceId },
        },
      );
      if (res.status !== 200 && res.status !== 409) {
        throw new Error(`Manual sync failed with status ${res.status}.`);
      }
    },
    [accountId, wsId] as const,
  );
  await expect
    .poll(
      async () =>
        page.evaluate(
          async ([id, workspaceId]) => {
            const res = await fetch(
              `/api/mail/accounts/${encodeURIComponent(id)}/folders`,
              {
                redirect: "manual",
                headers: { "x-inspoter-workspace": workspaceId },
              },
            );
            if (!res.ok) return -1;
            const folders = (await res.json()) as Array<{
              specialUse: string;
              unreadCount: number;
            }>;
            return (
              folders.find((folder) => folder.specialUse === "INBOX")
                ?.unreadCount ?? -1
            );
          },
          [accountId, wsId] as const,
        ),
      { timeout: 15_000 },
    )
    .toBe(MOCK_INBOX_UNREAD);
}

async function deleteMailAccount(page: Page, accountId: string) {
  const wsId = await getWorkspaceId(page);
  const status = await page.evaluate(
    async ([id, workspaceId]) =>
      (
        await fetch(`/api/mail/accounts/${encodeURIComponent(id)}`, {
          method: "DELETE",
          redirect: "manual",
          headers: { "x-inspoter-workspace": workspaceId },
        })
      ).status,
    [accountId, wsId] as const,
  );
  if (status !== 204 && status !== 404) {
    throw new Error(
      `Mail account cleanup failed for ${accountId}: expected 204/404, received ${status}.`,
    );
  }
}

test.beforeEach(async ({ page }) => {
  await login(page);
});

test("mail client shows folders with unread badges, reads a message, switches folders, and filters", async ({
  page,
  testData,
}) => {
  let accountId: string | undefined;
  try {
    accountId = await createMockMailAccount(page, testData.name("Mock IMAP"));
    await waitForInitialSync(page, accountId);

    await page.goto("/mail");
    await expect(
      page.getByRole("heading", { name: "Почта", exact: true }),
    ).toBeVisible();

    const addAccountButton = page.getByRole("button", {
      name: "Добавить аккаунт",
      exact: true,
    });
    await addAccountButton.click();
    const accountDialog = page.getByRole("dialog");
    await expect(
      accountDialog.getByRole("heading", { name: "Добавить аккаунт" }),
    ).toBeVisible();
    await accountDialog.getByLabel("Название").fill("Черновик аккаунта");
    await accountDialog.getByRole("button", { name: "Отмена" }).click();
    await expect(accountDialog).toBeHidden();
    await addAccountButton.click();
    await expect(accountDialog.getByLabel("Название")).toHaveValue("");
    await accountDialog.getByRole("button", { name: "Отмена" }).click();

    // Sidebar: the MOCK IMAP account is preselected over the webhook one,
    // and INBOX carries the deterministic unread badge.
    const sidebar = page.getByRole("navigation", { name: "Папки" });
    const inboxButton = sidebar.getByRole("button", { name: /Входящие/ });
    await expect(inboxButton).toBeVisible();
    await expect(
      inboxButton.getByLabel(`Непрочитанных: ${MOCK_INBOX_UNREAD}`),
    ).toBeVisible();
    await expect(
      sidebar.getByRole("button", { name: "Отправленные", exact: true }),
    ).toBeVisible();

    // All 30 INBOX messages fit on one page (LIST_PAGE_SIZE 50).
    const list = page.getByRole("list", { name: "Список писем" });
    await expect(list.getByRole("listitem")).toHaveCount(30);

    // Newest message (uid 30) opens in the reading pane with its body.
    await list
      .getByRole("button", { name: /Итоги спринта/ })
      .first()
      .click();
    await expect(
      page.getByRole("heading", { name: "Итоги спринта", exact: true }),
    ).toBeVisible();
    // The body renders in the reading pane's <pre>; the same sentence also
    // appears in list-row snippets, so scope to the pane body element.
    await expect(
      page.locator("pre", { hasText: "Черновик целей приложен" }),
    ).toBeVisible();
    await expect(
      page.getByText("Кому: Оператор <operator@inspot.local>", {
        exact: true,
      }),
    ).toBeVisible();

    // Folder switch: the mock Sent folder is empty.
    await sidebar
      .getByRole("button", { name: "Отправленные", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Нет писем", exact: true }),
    ).toBeVisible();

    // Back to INBOX; search narrows the list (3 of 30 subjects match).
    await inboxButton.click();
    await expect(list.getByRole("listitem")).toHaveCount(30);
    const search = page.getByLabel("Поиск по почте", { exact: true });
    await search.fill("Вопрос по интеграции");
    await expect(list.getByRole("listitem")).toHaveCount(3);

    // Unread-only toggle keeps just the 10 unread messages.
    await search.fill("");
    await expect(list.getByRole("listitem")).toHaveCount(30);
    await page
      .getByRole("button", { name: "Только непрочитанные", exact: true })
      .click();
    await expect(list.getByRole("listitem")).toHaveCount(MOCK_INBOX_UNREAD);

    // Attachment download (Phase 7): uid 1 («Отчёт за неделю», the only
    // unread message with an attachment) exposes a chip that streams
    // document-1.txt through the lazy-cache attachment route.
    await list
      .getByRole("button", { name: /Отчёт за неделю/ })
      .first()
      .click();
    await expect(
      page.getByRole("heading", { name: "Отчёт за неделю", exact: true }),
    ).toBeVisible();
    const attachmentChip = page.getByRole("button", {
      name: /document-1\.txt/,
    });
    await expect(attachmentChip).toBeVisible();
    const downloadPromise = page.waitForEvent("download");
    await attachmentChip.click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe("document-1.txt");
  } finally {
    if (accountId) await deleteMailAccount(page, accountId);
  }
});

test("mail actions: read badge, archive, trash, compose and reply", async ({
  page,
  testData,
}) => {
  test.setTimeout(30_000);
  let accountId: string | undefined;
  try {
    accountId = await createMockMailAccount(
      page,
      testData.name("Mock IMAP Actions"),
    );
    await waitForInitialSync(page, accountId);

    await page.goto("/mail");
    const sidebar = page.getByRole("navigation", { name: "Папки" });
    const inboxButton = sidebar.getByRole("button", { name: /Входящие/ });
    await expect(
      inboxButton.getByLabel(`Непрочитанных: ${MOCK_INBOX_UNREAD}`),
    ).toBeVisible();
    const list = page.getByRole("list", { name: "Список писем" });
    await expect(list.getByRole("listitem")).toHaveCount(30);

    // Opening an unread message (uid 28, newest «Доступ к репозиторию»)
    // clears its dot and decrements the INBOX badge.
    const unreadRow = list
      .getByRole("listitem")
      .filter({ hasText: "Доступ к репозиторию" })
      .first();
    await expect(unreadRow.getByLabel("Непрочитанное")).toBeVisible();
    await unreadRow.getByRole("button").click();
    await expect(
      page.getByRole("heading", { name: "Доступ к репозиторию", exact: true }),
    ).toBeVisible();
    await expect(unreadRow.getByLabel("Непрочитанное")).toBeHidden();
    await expect(
      inboxButton.getByLabel(`Непрочитанных: ${MOCK_INBOX_UNREAD - 1}`),
    ).toBeVisible();

    // Archive the open message: row leaves INBOX and shows up in Архив.
    await page.getByRole("button", { name: "В архив", exact: true }).click();
    await expect(
      page.getByText("Письмо перемещено в архив").first(),
    ).toBeVisible();
    await expect(list.getByRole("listitem")).toHaveCount(29);
    await sidebar.getByRole("button", { name: "Архив", exact: true }).click();
    await expect(list.getByRole("listitem")).toHaveCount(1);
    await expect(
      list.getByRole("listitem").filter({ hasText: "Доступ к репозиторию" }),
    ).toBeVisible();

    // Delete from INBOX moves the message into Корзина.
    await inboxButton.click();
    await expect(list.getByRole("listitem")).toHaveCount(29);
    await list
      .getByRole("button", { name: /Итоги спринта/ })
      .first()
      .click();
    await expect(
      page.getByRole("heading", { name: "Итоги спринта", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Удалить", exact: true }).click();
    await expect(
      page.getByText("Письмо перемещено в корзину").first(),
    ).toBeVisible();
    await expect(list.getByRole("listitem")).toHaveCount(28);
    await sidebar.getByRole("button", { name: "Корзина", exact: true }).click();
    await expect(list.getByRole("listitem")).toHaveCount(1);
    await expect(
      list.getByRole("listitem").filter({ hasText: "Итоги спринта" }),
    ).toBeVisible();

    // Compose: send a new message and find it in Отправленные (mock append +
    // local Sent row).
    await page.getByRole("button", { name: "Написать", exact: true }).click();
    const composeDialog = page.getByRole("dialog");
    await expect(
      composeDialog.getByRole("heading", { name: "Новое письмо" }),
    ).toBeVisible();
    await composeDialog
      .getByLabel("Кому", { exact: true })
      .fill("dest@example.ru");
    await composeDialog
      .getByLabel("Тема", { exact: true })
      .fill("E2E тестовое письмо");
    await composeDialog
      .getByLabel("Текст письма", { exact: true })
      .fill("Привет из e2e-теста.");
    await composeDialog
      .getByRole("button", { name: "Отправить", exact: true })
      .click();
    await expect(page.getByText("Письмо отправлено").first()).toBeVisible();
    await sidebar
      .getByRole("button", { name: "Отправленные", exact: true })
      .click();
    await expect(list.getByRole("listitem")).toHaveCount(1);
    await expect(
      list.getByRole("listitem").filter({ hasText: "E2E тестовое письмо" }),
    ).toBeVisible();

    // Draft lifecycle: attaching creates the draft, closing persists it,
    // reopening restores content + attachment, and sending removes it.
    await page.getByRole("button", { name: "Написать", exact: true }).click();
    const draftDialog = page.getByRole("dialog");
    await draftDialog
      .getByLabel("Кому", { exact: true })
      .fill("draft-recipient@example.ru");
    await draftDialog
      .getByLabel("Тема", { exact: true })
      .fill("E2E черновик с файлом");
    await draftDialog
      .getByLabel("Текст письма", { exact: true })
      .fill("Текст сохранённого черновика.");
    await draftDialog.locator('input[type="file"]').setInputFiles({
      name: "report.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("draft attachment"),
    });
    await expect(page.getByText("Добавлено вложений: 1").first()).toBeVisible();
    await draftDialog
      .getByRole("button", { name: "Закрыть редактор", exact: true })
      .click();
    await expect(draftDialog).toBeHidden();

    await sidebar
      .getByRole("button", { name: "Черновики", exact: true })
      .click();
    await expect(list.getByRole("listitem")).toHaveCount(1);
    await list.getByRole("button", { name: /E2E черновик с файлом/ }).click();
    await page
      .getByRole("button", { name: "Редактировать черновик", exact: true })
      .click();
    const editDraftDialog = page.getByRole("dialog");
    await expect(
      editDraftDialog.getByRole("heading", { name: "Редактировать черновик" }),
    ).toBeVisible();
    await expect(editDraftDialog.getByText("report.txt")).toBeVisible();
    await expect(
      editDraftDialog.getByLabel("Текст письма", { exact: true }),
    ).toHaveText("Текст сохранённого черновика.");
    await editDraftDialog
      .getByRole("button", { name: "Отправить", exact: true })
      .click();
    await expect(page.getByText("Письмо отправлено").first()).toBeVisible();
    await expect(list.getByRole("listitem")).toHaveCount(0);

    await sidebar
      .getByRole("button", { name: "Отправленные", exact: true })
      .click();
    await expect(list.getByRole("listitem")).toHaveCount(2);
    await expect(
      list.getByRole("listitem").filter({ hasText: "E2E черновик с файлом" }),
    ).toBeVisible();

    // Reply from the reading pane: prefilled recipient and Re: subject.
    await inboxButton.click();
    await list
      .getByRole("button", { name: /Резервное копирование/ })
      .first()
      .click();
    await expect(
      page.getByRole("heading", {
        name: "Резервное копирование",
        exact: true,
      }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Ответить", exact: true }).click();
    const replyComposer = page.getByRole("region", { name: "Ответить" });
    await expect(
      replyComposer.getByRole("heading", { name: "Ответить" }),
    ).toBeVisible();
    await expect(replyComposer.getByLabel("Кому", { exact: true })).toHaveValue(
      "e.sokolova@example.ru",
    );
    await expect(replyComposer.getByLabel("Тема", { exact: true })).toHaveValue(
      "Re: Резервное копирование",
    );
    await replyComposer
      .getByLabel("Текст письма", { exact: true })
      .fill("Спасибо, резервная копия проверена.");
    await replyComposer
      .getByRole("button", { name: "Отправить ответ", exact: true })
      .click();
    await expect(replyComposer).toBeHidden();
  } finally {
    if (accountId) await deleteMailAccount(page, accountId);
  }
});

test("mail client screen has zero serious or critical accessibility violations", async ({
  page,
  testData,
}) => {
  let accountId: string | undefined;
  try {
    accountId = await createMockMailAccount(
      page,
      testData.name("Mock IMAP A11y"),
    );
    await waitForInitialSync(page, accountId);

    await page.goto("/mail");
    await expect(
      page.getByRole("heading", { name: "Почта", exact: true }),
    ).toBeVisible();
    const list = page.getByRole("list", { name: "Список писем" });
    await expect(list.getByRole("listitem")).toHaveCount(30);

    // Open a message so the reading pane content is part of the scan.
    await list
      .getByRole("button", { name: /Итоги спринта/ })
      .first()
      .click();
    await expect(
      page.getByRole("heading", { name: "Итоги спринта", exact: true }),
    ).toBeVisible();

    const results = await new AxeBuilder({ page }).analyze();
    const blocking = results.violations.filter(
      (violation) =>
        violation.impact === "critical" || violation.impact === "serious",
    );
    expect(blocking).toEqual([]);
  } finally {
    if (accountId) await deleteMailAccount(page, accountId);
  }
});
