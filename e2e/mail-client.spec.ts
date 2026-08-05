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
      page.getByRole("heading", { name: "Mail", exact: true }),
    ).toBeVisible();

    const addAccountButton = page.getByRole("button", {
      name: "Add account",
      exact: true,
    });
    await addAccountButton.click();
    const accountDialog = page.getByRole("dialog");
    await expect(
      accountDialog.getByRole("heading", { name: "Add account" }),
    ).toBeVisible();
    await accountDialog
      .getByLabel("Name", { exact: true })
      .fill("Draft account");
    await accountDialog.getByRole("button", { name: "Cancel" }).click();
    await expect(accountDialog).toBeHidden();
    await addAccountButton.click();
    await expect(accountDialog.getByLabel("Name", { exact: true })).toHaveValue(
      "",
    );
    await accountDialog.getByRole("button", { name: "Cancel" }).click();

    // Sidebar: the MOCK IMAP account is preselected over the webhook one,
    // and INBOX carries the deterministic unread badge.
    const sidebar = page.getByRole("navigation", { name: "Folders" });
    const inboxButton = sidebar.getByRole("button", { name: /Inbox/ });
    await expect(inboxButton).toBeVisible();
    await expect(
      inboxButton.getByLabel(`Unread: ${MOCK_INBOX_UNREAD}`),
    ).toBeVisible();
    await expect(
      sidebar.getByRole("button", { name: "Sent", exact: true }),
    ).toBeVisible();

    // All 30 INBOX messages fit on one page (LIST_PAGE_SIZE 50).
    const list = page.getByRole("list", { name: "Message list" });
    await expect(list.getByRole("listitem")).toHaveCount(30);

    // Newest message (uid 30) opens in the reading pane with its body.
    await list
      .getByRole("button", { name: /Sprint results/ })
      .first()
      .click();
    await expect(
      page.getByRole("heading", { name: "Sprint results", exact: true }),
    ).toBeVisible();
    // The body renders in the reading pane's <pre>; the same sentence also
    // appears in list-row snippets, so scope to the pane body element.
    await expect(
      page.locator("pre", { hasText: "A draft of the goals is attached" }),
    ).toBeVisible();
    await expect(
      page.getByText("To: Operator <operator@inspot.local>", {
        exact: true,
      }),
    ).toBeVisible();

    // Folder switch: the mock Sent folder is empty.
    await sidebar.getByRole("button", { name: "Sent", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "No messages", exact: true }),
    ).toBeVisible();

    // Back to INBOX; search narrows the list (3 of 30 subjects match).
    await inboxButton.click();
    await expect(list.getByRole("listitem")).toHaveCount(30);
    const search = page.getByLabel("Search mail", { exact: true });
    await search.fill("Question about the integration");
    await expect(list.getByRole("listitem")).toHaveCount(3);

    // Unread-only toggle keeps just the 10 unread messages.
    await search.fill("");
    await expect(list.getByRole("listitem")).toHaveCount(30);
    await page
      .getByRole("button", { name: "Unread only", exact: true })
      .click();
    await expect(list.getByRole("listitem")).toHaveCount(MOCK_INBOX_UNREAD);

    // Attachment download (Phase 7): uid 1 ("Weekly report", the only
    // unread message with an attachment) exposes a chip that streams
    // document-1.txt through the lazy-cache attachment route.
    await list
      .getByRole("button", { name: /Weekly report/ })
      .first()
      .click();
    await expect(
      page.getByRole("heading", { name: "Weekly report", exact: true }),
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
    const sidebar = page.getByRole("navigation", { name: "Folders" });
    const inboxButton = sidebar.getByRole("button", { name: /Inbox/ });
    await expect(
      inboxButton.getByLabel(`Unread: ${MOCK_INBOX_UNREAD}`),
    ).toBeVisible();
    const list = page.getByRole("list", { name: "Message list" });
    await expect(list.getByRole("listitem")).toHaveCount(30);

    // Opening an unread message (uid 28, newest "Repository access")
    // clears its dot and decrements the INBOX badge.
    const unreadRow = list
      .getByRole("listitem")
      .filter({ hasText: "Repository access" })
      .first();
    await expect(unreadRow.getByLabel("Unread")).toBeVisible();
    await unreadRow.getByRole("button").click();
    await expect(
      page.getByRole("heading", { name: "Repository access", exact: true }),
    ).toBeVisible();
    await expect(unreadRow.getByLabel("Unread")).toBeHidden();
    await expect(
      inboxButton.getByLabel(`Unread: ${MOCK_INBOX_UNREAD - 1}`),
    ).toBeVisible();

    // Archive the open message: row leaves INBOX and shows up in Archive.
    // Both the message-pane action and the sidebar folder are labelled
    // "Archive" in the base locale, so the action is scoped to the pane.
    await page
      .locator('[data-slot="message-pane"]')
      .getByRole("button", { name: "Archive", exact: true })
      .click();
    await expect(
      page.getByText("Message moved to archive").first(),
    ).toBeVisible();
    await expect(list.getByRole("listitem")).toHaveCount(29);
    await sidebar.getByRole("button", { name: "Archive", exact: true }).click();
    await expect(list.getByRole("listitem")).toHaveCount(1);
    await expect(
      list.getByRole("listitem").filter({ hasText: "Repository access" }),
    ).toBeVisible();

    // Delete from INBOX moves the message into Trash.
    await inboxButton.click();
    await expect(list.getByRole("listitem")).toHaveCount(29);
    await list
      .getByRole("button", { name: /Sprint results/ })
      .first()
      .click();
    await expect(
      page.getByRole("heading", { name: "Sprint results", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(
      page.getByText("Message moved to trash").first(),
    ).toBeVisible();
    await expect(list.getByRole("listitem")).toHaveCount(28);
    await sidebar.getByRole("button", { name: "Trash", exact: true }).click();
    await expect(list.getByRole("listitem")).toHaveCount(1);
    await expect(
      list.getByRole("listitem").filter({ hasText: "Sprint results" }),
    ).toBeVisible();

    // Compose: send a new message and find it in Sent (mock append +
    // local Sent row).
    await page.getByRole("button", { name: "Compose", exact: true }).click();
    const composeDialog = page.getByRole("dialog");
    await expect(
      composeDialog.getByRole("heading", { name: "New message" }),
    ).toBeVisible();
    await composeDialog
      .getByLabel("To", { exact: true })
      .fill("dest@example.ru");
    await composeDialog
      .getByLabel("Subject", { exact: true })
      .fill("E2E test message");
    await composeDialog
      .getByLabel("Message body", { exact: true })
      .fill("Hello from the e2e test.");
    await composeDialog
      .getByRole("button", { name: "Send", exact: true })
      .click();
    await expect(page.getByText("Message sent").first()).toBeVisible();
    await sidebar.getByRole("button", { name: "Sent", exact: true }).click();
    await expect(list.getByRole("listitem")).toHaveCount(1);
    await expect(
      list.getByRole("listitem").filter({ hasText: "E2E test message" }),
    ).toBeVisible();

    // Draft lifecycle: attaching creates the draft, closing persists it,
    // reopening restores content + attachment, and sending removes it.
    await page.getByRole("button", { name: "Compose", exact: true }).click();
    const draftDialog = page.getByRole("dialog");
    await draftDialog
      .getByLabel("To", { exact: true })
      .fill("draft-recipient@example.ru");
    await draftDialog
      .getByLabel("Subject", { exact: true })
      .fill("E2E draft with a file");
    await draftDialog
      .getByLabel("Message body", { exact: true })
      .fill("Saved draft body.");
    await draftDialog.locator('input[type="file"]').setInputFiles({
      name: "report.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("draft attachment"),
    });
    await expect(page.getByText("1 attachment added").first()).toBeVisible();
    await draftDialog
      .getByRole("button", { name: "Close composer", exact: true })
      .click();
    await expect(draftDialog).toBeHidden();

    await sidebar.getByRole("button", { name: "Drafts", exact: true }).click();
    await expect(list.getByRole("listitem")).toHaveCount(1);
    await list.getByRole("button", { name: /E2E draft with a file/ }).click();
    await page.getByRole("button", { name: "Edit draft", exact: true }).click();
    const editDraftDialog = page.getByRole("dialog");
    await expect(
      editDraftDialog.getByRole("heading", { name: "Edit draft" }),
    ).toBeVisible();
    await expect(editDraftDialog.getByText("report.txt")).toBeVisible();
    await expect(
      editDraftDialog.getByLabel("Message body", { exact: true }),
    ).toHaveText("Saved draft body.");
    await editDraftDialog
      .getByRole("button", { name: "Send", exact: true })
      .click();
    await expect(page.getByText("Message sent").first()).toBeVisible();
    await expect(list.getByRole("listitem")).toHaveCount(0);

    await sidebar.getByRole("button", { name: "Sent", exact: true }).click();
    await expect(list.getByRole("listitem")).toHaveCount(2);
    await expect(
      list.getByRole("listitem").filter({ hasText: "E2E draft with a file" }),
    ).toBeVisible();

    // Reply from the reading pane: prefilled recipient and Re: subject.
    await inboxButton.click();
    await list
      .getByRole("button", { name: /Backup/ })
      .first()
      .click();
    await expect(
      page.getByRole("heading", {
        name: "Backup",
        exact: true,
      }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Reply", exact: true }).click();
    const replyComposer = page.getByRole("region", { name: "Reply" });
    await expect(
      replyComposer.getByRole("heading", { name: "Reply" }),
    ).toBeVisible();
    await expect(replyComposer.getByLabel("To", { exact: true })).toHaveValue(
      "e.sokolova@example.com",
    );
    await expect(
      replyComposer.getByLabel("Subject", { exact: true }),
    ).toHaveValue("Re: Backup");
    await replyComposer
      .getByLabel("Message body", { exact: true })
      .fill("Thanks, the backup has been verified.");
    await replyComposer
      .getByRole("button", { name: "Send reply", exact: true })
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
      page.getByRole("heading", { name: "Mail", exact: true }),
    ).toBeVisible();
    const list = page.getByRole("list", { name: "Message list" });
    await expect(list.getByRole("listitem")).toHaveCount(30);

    // Open a message so the reading pane content is part of the scan.
    await list
      .getByRole("button", { name: /Sprint results/ })
      .first()
      .click();
    await expect(
      page.getByRole("heading", { name: "Sprint results", exact: true }),
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
