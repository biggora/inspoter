import { createHash } from "node:crypto";

import { expect, test as base, type TestInfo } from "@playwright/test";

interface DeterministicTestData {
  suffix: string;
  name: (baseName: string) => string;
  localUrl: (path: string) => string;
  registerCategory: (id: string) => void;
}

function suffixFor(testInfo: TestInfo) {
  return createHash("sha256").update(testInfo.testId).digest("hex").slice(0, 8);
}

function sanitizedNetworkTarget(url: URL) {
  return `${url.origin}${url.pathname}`;
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
        });
      } finally {
        await testInfo.attach("external-network-attempts", {
          body: JSON.stringify({ attempts: externalNetworkAttempts }, null, 2),
          contentType: "application/json",
        });

        for (const id of categoryIds.reverse()) {
          const response = await page.request.delete(
            new URL(
              `/api/categories/${encodeURIComponent(id)}`,
              appUrl,
            ).toString(),
          );
          if (response.status() !== 204 && response.status() !== 404) {
            throw new Error(
              `Category cleanup failed for ${id}: expected 204/404, received ${response.status()}.`,
            );
          }
        }
      }
    },
    { auto: true },
  ],
});

export { expect };
