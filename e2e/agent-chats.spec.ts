import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures/test";
import { login } from "./utils/auth";

async function workspaceId(page: Page): Promise<string> {
  return (
    (await page
      .locator("[data-workspace-id]")
      .first()
      .getAttribute("data-workspace-id")) ?? ""
  );
}

async function api<T>(
  page: Page,
  workspace: string,
  url: string,
  init?: { method?: string; body?: unknown },
): Promise<T> {
  return page.evaluate(
    async ([requestUrl, workspaceId, method, body]) => {
      const response = await fetch(requestUrl, {
        method,
        headers: {
          "Content-Type": "application/json",
          "x-inspoter-workspace": workspaceId,
        },
        ...(body === null ? {} : { body: JSON.stringify(body) }),
      });
      const payload = response.status === 204 ? null : await response.json();
      if (!response.ok) {
        throw new Error(`${method} ${requestUrl} failed: ${response.status}`);
      }
      return payload;
    },
    [url, workspace, init?.method ?? "GET", init?.body ?? null] as const,
  ) as Promise<T>;
}

async function waitForBackfillReady(page: Page, workspace: string) {
  await expect
    .poll(
      async () =>
        (
          await api<{ backfillStatus: string }>(
            page,
            workspace,
            "/api/embeddings/status",
          )
        ).backfillStatus,
      { timeout: 20_000 },
    )
    .toBe("READY");
}

test("agent chat uses indexed Notes and falls back without stale chunks", async ({
  page,
  testData,
}) => {
  // Two scheduler-gated waits (the initial backfill and the re-index after
  // the note edit) each ride a 5s worker tick, on top of three mock chat
  // round-trips.
  test.setTimeout(45_000);

  await login(page);
  const workspace = await workspaceId(page);
  const suffix = Math.floor(Math.random() * 1_000_000);

  // Cleanup is registered up front instead of a test-body finally: on a test
  // timeout Playwright closes the page while the body is still unwinding, so
  // a finally + page.evaluate silently leaks rows into the shared workspace
  // (a leaked LLM credential once made the mail-ai "no model" scenario answer
  // with the mock driver). Registration order matters: teardown runs in
  // reverse, so the profile is disabled before the credential is deleted.
  const credential = await api<{ id: string }>(
    page,
    workspace,
    "/api/credentials",
    {
      method: "POST",
      body: {
        provider: "OPENAI_COMPATIBLE",
        label: `chat-embeddings-${suffix}`,
        baseUrl: "http://127.0.0.1:9/v1",
        model: "mock-chat",
        apiKey: "mock-key",
        mode: "MOCK",
      },
    },
  );
  testData.registerTeardown({
    description: "mock chat credential",
    method: "DELETE",
    url: `/api/credentials/${credential.id}`,
    workspaceId: workspace,
  });
  testData.registerTeardown({
    description: "workspace embedding profile",
    method: "PATCH",
    url: `/api/credentials/${credential.id}/embedding-default`,
    workspaceId: workspace,
    body: { enabled: false },
    expectStatus: 200,
  });
  const agent = await api<{ id: string }>(page, workspace, "/api/agents", {
    method: "POST",
    body: {
      name: `Chat agent ${suffix}`,
      instructions: "Answer from the available context.",
      scopes: ["notes:read"],
    },
  });
  testData.registerTeardown({
    description: "chat agent",
    method: "DELETE",
    url: `/api/agents/${agent.id}`,
    workspaceId: workspace,
  });
  const note = await api<{ id: string; version: number }>(
    page,
    workspace,
    "/api/notes",
    {
      method: "POST",
      body: {
        title: `Deployment runbook ${suffix}`,
        content: "deployment recovery requires restarting the worker",
      },
    },
  );
  testData.registerTeardown({
    description: "deployment runbook note",
    method: "DELETE",
    url: `/api/notes/${note.id}`,
    workspaceId: workspace,
  });
  await api(
    page,
    workspace,
    `/api/credentials/${credential.id}/embedding-default`,
    {
      method: "PATCH",
      body: { enabled: true, model: "mock-embedding" },
    },
  );
  await waitForBackfillReady(page, workspace);

  await page.goto("/agents/runs");
  await expect(
    page.getByRole("heading", { name: "Runs", exact: true }),
  ).toBeVisible();
  await expect(page.locator('[data-slot="page-header"] > a')).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Chats", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Agents", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Skills", exact: true }),
  ).toBeVisible();

  await page.goto(`/agents?agentId=${agent.id}`);
  await expect(
    page.getByRole("heading", { name: "Agent chats", exact: true }),
  ).toBeVisible();
  await expect(page.locator('[data-slot="page-header"] > a')).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Agents", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Runs", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Skills", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: "Message the agent", exact: true })
    .fill("deployment recovery");
  await page.getByRole("button", { name: "Send message" }).click();
  await page.waitForURL(/\/agents\/chats\/[^/]+$/);
  const conversationId = page.url().split("/").pop() ?? "";
  testData.registerTeardown({
    description: "agent conversation",
    method: "DELETE",
    url: `/api/agents/conversations/${conversationId}`,
    workspaceId: workspace,
  });
  await expect(page.getByText("Succeeded")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("Hybrid", { exact: true })).toBeVisible();
  await expect(
    page.getByText(`Deployment runbook ${suffix}`, { exact: true }),
  ).toBeVisible();

  // Editing a note makes its indexed chunk stale. Rather than pinning the
  // transient "indexing" badge — a race against the re-index worker — wait
  // for the indexer to catch up, then assert the hybrid retrieval answers
  // from the fresh chunk.
  await api(page, workspace, `/api/notes/${note.id}`, {
    method: "PATCH",
    body: {
      version: note.version,
      content: "rotated emergency key is stored in the operations vault",
    },
  });
  await waitForBackfillReady(page, workspace);
  await page
    .getByRole("textbox", { name: "Message the agent", exact: true })
    .fill("rotated emergency key");
  await page.getByRole("button", { name: "Send message" }).click();
  const secondRun = page.locator("article").last();
  await expect(secondRun.getByText("rotated emergency key")).toBeVisible();
  await expect(secondRun.getByText("Hybrid", { exact: true })).toBeVisible();
  await expect(
    secondRun.getByText(`Deployment runbook ${suffix}`, { exact: true }),
  ).toBeVisible();

  // The fallback badge is only deterministic with no embedding profile at
  // all: retrieval must then be full-text only, and the note must still
  // surface through it.
  await api(
    page,
    workspace,
    `/api/credentials/${credential.id}/embedding-default`,
    {
      method: "PATCH",
      body: { enabled: false },
    },
  );
  await page
    .getByRole("textbox", { name: "Message the agent", exact: true })
    .fill("operations vault");
  await page.getByRole("button", { name: "Send message" }).click();
  const thirdRun = page.locator("article").last();
  await expect(thirdRun.getByText("operations vault")).toBeVisible();
  await expect(
    thirdRun.getByText("Full-text only", { exact: true }),
  ).toBeVisible();
  await expect(
    thirdRun.getByText(`Deployment runbook ${suffix}`, { exact: true }),
  ).toBeVisible();

  await page.reload();
  await expect(
    page
      .getByRole("paragraph")
      .filter({ hasText: "deployment recovery" })
      .first(),
  ).toBeVisible();
});
