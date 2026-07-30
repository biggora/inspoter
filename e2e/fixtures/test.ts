import { createHash } from "node:crypto";

import {
  expect,
  test as base,
  type Page,
  type TestInfo,
} from "@playwright/test";

interface DeterministicTestData {
  suffix: string;
  name: (baseName: string) => string;
  localUrl: (path: string) => string;
  /**
   * Register a **bookmark** category id for teardown. Cleanup goes through
   * DELETE /api/categories/{id} and requires a 204 — a 404 means the id never
   * was a bookmark category of this workspace (e.g. a message category id) and
   * fails the test instead of silently leaking rows into the shared E2E
   * database.
   */
  registerCategory: (id: string) => void;
  /**
   * Declare that the test itself already deleted a previously registered
   * bookmark category (directly or through a parent cascade), so teardown
   * expects a 404 for it instead of a 204.
   */
  markCategoryDeleted: (id: string) => void;
}

function suffixFor(testInfo: TestInfo) {
  return createHash("sha256").update(testInfo.testId).digest("hex").slice(0, 8);
}

function sanitizedNetworkTarget(url: URL) {
  return `${url.origin}${url.pathname}`;
}

async function workspaceIdFromPage(page: Page) {
  const wsEl = page.locator("[data-workspace-id]").first();
  return (await wsEl.count()) > 0
    ? ((await wsEl.getAttribute("data-workspace-id")) ?? "")
    : "";
}

async function deleteCategoryStatus(
  page: Page,
  appUrl: URL,
  workspaceId: string,
  id: string,
) {
  const url = new URL(
    `/api/categories/${encodeURIComponent(id)}`,
    appUrl,
  ).toString();
  return page.evaluate(
    async ([requestUrl, wsId]) =>
      (
        await fetch(requestUrl, {
          method: "DELETE",
          redirect: "manual",
          headers: { "x-inspoter-workspace": wsId },
        })
      ).status,
    [url, workspaceId] as const,
  );
}

async function messageCategoryIds(
  page: Page,
  appUrl: URL,
  workspaceId: string,
) {
  const url = new URL("/api/message-categories", appUrl).toString();
  return page.evaluate(
    async ([requestUrl, wsId]) => {
      const response = await fetch(requestUrl, {
        redirect: "manual",
        headers: { "x-inspoter-workspace": wsId },
      });
      if (!response.ok) return [];
      const body: unknown = await response.json().catch(() => null);
      return Array.isArray(body)
        ? body
            .map((entry) =>
              typeof entry === "object" &&
              entry !== null &&
              "id" in entry &&
              typeof (entry as { id: unknown }).id === "string"
                ? (entry as { id: string }).id
                : "",
            )
            .filter((entry) => entry.length > 0)
        : [];
    },
    [url, workspaceId] as const,
  );
}

async function cleanupFailure(
  page: Page,
  appUrl: URL,
  workspaceId: string,
  id: string,
  status: number,
  expectedStatus: number,
) {
  if (expectedStatus === 404) {
    return (
      `Category cleanup failed for ${id}: the test called ` +
      `testData.markCategoryDeleted(), but DELETE /api/categories/{id} ` +
      `returned ${status} instead of 404 — the category still existed, so ` +
      `the test's own deletion never reached the database.`
    );
  }

  if (status !== 404) {
    return `Category cleanup failed for ${id}: expected 204, received ${status}.`;
  }

  if ((await messageCategoryIds(page, appUrl, workspaceId)).includes(id)) {
    return (
      `Category cleanup failed for ${id}: this id belongs to a *message* ` +
      `category, so DELETE /api/categories/{id} (the bookmark route) can ` +
      `only ever return 404 and the row is never cleaned up. ` +
      `testData.registerCategory handles bookmark categories only — delete ` +
      `message categories and their channels from the spec via ` +
      `/api/message-categories/{id}.`
    );
  }

  return (
    `Category cleanup failed for ${id}: expected 204, received 404 — the ` +
    `bookmark category is already gone. If the test deleted it on purpose, ` +
    `declare it with testData.markCategoryDeleted(id); otherwise the ` +
    `registered id never was a bookmark category of this workspace.`
  );
}

export const test = base.extend<{ testData: DeterministicTestData }>({
  testData: [
    async ({ baseURL, context, page }, provide, testInfo) => {
      if (!baseURL) {
        throw new Error(
          "Playwright use.baseURL is required for deterministic E2E tests.",
        );
      }

      const appUrl = new URL(baseURL);
      const categoryIds: string[] = [];
      const deletedByTest = new Set<string>();
      const externalNetworkAttempts: string[] = [];
      const suffix = suffixFor(testInfo);

      await context.route("**/*", async (route) => {
        const requestUrl = new URL(route.request().url());
        if (
          (requestUrl.protocol === "http:" ||
            requestUrl.protocol === "https:") &&
          requestUrl.origin !== appUrl.origin
        ) {
          externalNetworkAttempts.push(sanitizedNetworkTarget(requestUrl));
          await route.abort("blockedbyclient");
          return;
        }

        await route.continue();
      });

      try {
        await provide({
          suffix,
          name: (baseName) => `${baseName}-${suffix}`,
          localUrl: (path) => new URL(path, appUrl).toString(),
          registerCategory: (id) => {
            if (!id || categoryIds.includes(id)) {
              throw new Error(
                `Invalid or duplicate category id: ${id || "<empty>"}`,
              );
            }
            categoryIds.push(id);
          },
          markCategoryDeleted: (id) => {
            if (!categoryIds.includes(id)) {
              throw new Error(
                `markCategoryDeleted called for an unregistered category id: ${id || "<empty>"}`,
              );
            }
            deletedByTest.add(id);
          },
        });
      } finally {
        await testInfo.attach("external-network-attempts", {
          body: JSON.stringify({ attempts: externalNetworkAttempts }, null, 2),
          contentType: "application/json",
        });

        const workspaceId = await workspaceIdFromPage(page);
        const failures: string[] = [];
        for (const id of categoryIds.reverse()) {
          const expectedStatus = deletedByTest.has(id) ? 404 : 204;
          const status = await deleteCategoryStatus(
            page,
            appUrl,
            workspaceId,
            id,
          );
          if (status === expectedStatus) continue;
          failures.push(
            await cleanupFailure(
              page,
              appUrl,
              workspaceId,
              id,
              status,
              expectedStatus,
            ),
          );
        }
        if (failures.length > 0) {
          throw new Error(failures.join("\n"));
        }
      }
    },
    { auto: true },
  ],
});

export { expect };
