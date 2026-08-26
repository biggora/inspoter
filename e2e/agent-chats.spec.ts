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

test("agent chat uses indexed Notes and falls back without stale chunks", async ({
  page,
}) => {
  await login(page);
  const workspace = await workspaceId(page);
  const suffix = Math.floor(Math.random() * 1_000_000);
  let credentialId = "";
  let agentId = "";
  let noteId = "";
  let conversationId = "";

  try {
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
    credentialId = credential.id;
    const agent = await api<{ id: string }>(page, workspace, "/api/agents", {
      method: "POST",
      body: {
        name: `Chat agent ${suffix}`,
        instructions: "Answer from the available context.",
        scopes: ["notes:read"],
      },
    });
    agentId = agent.id;
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
    noteId = note.id;
    await api(
      page,
      workspace,
      `/api/credentials/${credentialId}/embedding-default`,
      {
        method: "PATCH",
        body: { enabled: true, model: "mock-embedding" },
      },
    );

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

    await page.goto(`/agents/chats?agentId=${agentId}`);
    await page
      .getByPlaceholder("Message the agent…")
      .fill("deployment recovery");
    await page.getByRole("button", { name: "Send message" }).click();
    await page.waitForURL(/\/agents\/chats\/[^/]+$/);
    conversationId = page.url().split("/").pop() ?? "";
    await expect(page.getByText("Succeeded")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("Hybrid", { exact: true })).toBeVisible();
    await expect(
      page.getByText(`Deployment runbook ${suffix}`, { exact: true }),
    ).toBeVisible();

    await api(page, workspace, `/api/notes/${noteId}`, {
      method: "PATCH",
      body: {
        version: note.version,
        content: "rotated emergency key is stored in the operations vault",
      },
    });
    await page
      .getByPlaceholder("Message the agent…")
      .fill("rotated emergency key");
    await page.getByRole("button", { name: "Send message" }).click();
    await expect(page.getByText("Full-text only", { exact: true })).toBeVisible(
      { timeout: 20_000 },
    );
    await expect(
      page.getByText(`Deployment runbook ${suffix}`, { exact: true }).last(),
    ).toBeVisible();

    await page.reload();
    await expect(
      page
        .getByRole("paragraph")
        .filter({ hasText: "deployment recovery" })
        .first(),
    ).toBeVisible();
  } finally {
    if (conversationId) {
      await api(
        page,
        workspace,
        `/api/agents/conversations/${conversationId}`,
        {
          method: "DELETE",
        },
      ).catch(() => undefined);
    }
    if (noteId) {
      await api(page, workspace, `/api/notes/${noteId}`, {
        method: "DELETE",
      }).catch(() => undefined);
    }
    if (agentId) {
      await api(page, workspace, `/api/agents/${agentId}`, {
        method: "DELETE",
      }).catch(() => undefined);
    }
    if (credentialId) {
      await api(
        page,
        workspace,
        `/api/credentials/${credentialId}/embedding-default`,
        { method: "PATCH", body: { enabled: false } },
      ).catch(() => undefined);
      await api(page, workspace, `/api/credentials/${credentialId}`, {
        method: "DELETE",
      }).catch(() => undefined);
    }
  }
});
