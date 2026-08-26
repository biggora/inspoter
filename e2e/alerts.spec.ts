import type { Page } from "@playwright/test";

import { expect, test } from "./fixtures/test";
import { login } from "./utils/auth";

// Alert categorization end to end: a third-party sender that knows nothing
// about categories, an operator who files the result, and the "no category"
// filter that lets them find such rows in the first place.

async function activeWorkspace(page: Page): Promise<string> {
  const workspaceId = await page
    .locator("[data-workspace-id]")
    .first()
    .evaluateAll(
      (elements) => elements[0]?.getAttribute("data-workspace-id") ?? null,
    );
  if (!workspaceId) {
    throw new Error("An active workspace is required for this E2E test.");
  }
  return workspaceId;
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

// testData.name() suffixes hash the test id, so every run mints the SAME
// names — without teardown, a rerun on a non-fresh database hits the
// category's unique-name constraint and the setup POST fails with 500.
let cleanupWorkspaceId = "";
const cleanupTokenIds: string[] = [];
const cleanupCategoryIds: string[] = [];

test.afterEach(async ({ page }) => {
  if (!cleanupWorkspaceId) return;
  await page.evaluate(
    async ({ workspace, tokenIds, categoryIds }) => {
      for (const id of tokenIds) {
        await fetch(`/api/webhook-tokens/${encodeURIComponent(id)}`, {
          method: "DELETE",
          headers: { "x-inspoter-workspace": workspace },
        }).catch(() => {});
      }
      for (const id of categoryIds) {
        await fetch(`/api/alert-categories/${encodeURIComponent(id)}`, {
          method: "DELETE",
          headers: { "x-inspoter-workspace": workspace },
        }).catch(() => {});
      }
    },
    {
      workspace: cleanupWorkspaceId,
      tokenIds: [...cleanupTokenIds],
      categoryIds: [...cleanupCategoryIds],
    },
  );
  cleanupTokenIds.length = 0;
  cleanupCategoryIds.length = 0;
  cleanupWorkspaceId = "";
});

/** Ingests through the public webhook exactly as an external system would. */
async function ingestAlert(
  page: Page,
  token: string,
  payload: object,
): Promise<{ status: number; id: string | null }> {
  return page.evaluate(
    async ({ bearer, body }) => {
      const response = await fetch("/api/webhooks/alert", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${bearer}`,
        },
        body: JSON.stringify(body),
      });
      const parsed = response.ok
        ? ((await response.json()) as { id?: string })
        : null;
      return { status: response.status, id: parsed?.id ?? null };
    },
    { bearer: token, body: payload },
  );
}

test("an alert ingested without a category is filed by the operator and deleted", async ({
  page,
  testData,
}) => {
  await login(page);
  await page.goto("/alerts");
  const workspaceId = await activeWorkspace(page);
  cleanupWorkspaceId = workspaceId;

  const { id: tokenId, token } = await postJson<{
    id: string;
    token: string;
  }>(page, workspaceId, "/api/webhook-tokens", {
    name: testData.name("alerts-e2e"),
  });
  cleanupTokenIds.push(tokenId);
  const categoryName = testData.name("E2E Alerts");
  const category = await postJson<{ id: string }>(
    page,
    workspaceId,
    "/api/alert-categories",
    { name: categoryName },
  );
  cleanupCategoryIds.push(category.id);

  const message = testData.name("uncategorized incident");
  const ingested = await ingestAlert(page, token, {
    severity: "critical",
    source: "alertmanager",
    message,
  });
  expect(ingested.status).toBe(201);

  await page.reload();
  const row = page.getByRole("row").filter({ hasText: message });
  await expect(row).toBeVisible();

  // Uncategorized on arrival, and the operator can say so.
  const categorySelect = row.getByLabel("Alert category", {
    exact: true,
  });
  await expect(categorySelect).toContainText("No category");

  await categorySelect.click();
  await page.getByRole("option", { name: categoryName, exact: true }).click();
  await expect(categorySelect).toContainText(categoryName);

  // The assignment survives a reload — it is a write, not local state.
  await page.reload();
  const reloadedRow = page.getByRole("row").filter({ hasText: message });
  await expect(
    reloadedRow.getByLabel("Alert category", { exact: true }),
  ).toContainText(categoryName);

  // The "no category" filter no longer matches it.
  await page.getByLabel("Filter by category", { exact: true }).click();
  await page.getByRole("option", { name: "No category", exact: true }).click();
  await expect(page.getByRole("row").filter({ hasText: message })).toHaveCount(
    0,
  );

  // AC-ALR-008: delete removes it for good.
  await page.getByLabel("Filter by category", { exact: true }).click();
  await page.getByRole("option", { name: categoryName, exact: true }).click();
  const targetRow = page.getByRole("row").filter({ hasText: message });
  await targetRow.getByRole("button", { name: "Delete alert" }).click();
  await page
    .getByRole("alertdialog", { name: "Delete this alert?" })
    .getByRole("button", { name: "Delete alert", exact: true })
    .click();
  await expect(page.getByRole("row").filter({ hasText: message })).toHaveCount(
    0,
  );
});
