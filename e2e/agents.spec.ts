import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures/test";
import { login } from "./utils/auth";

// mode: "MOCK" is a hard requirement, not a convenience (architecture.md
// §7F.1): a real model is non-deterministic by construction, and the run
// timeline this spec asserts is the mock script from
// buildAgentMockTurns() — one read-only tool call, then a report. baseUrl
// points at the discard port as a second line of defence.
async function getWorkspaceId(page: Page): Promise<string> {
  const wsEl = page.locator("[data-workspace-id]").first();
  return (await wsEl.count()) > 0
    ? ((await wsEl.getAttribute("data-workspace-id")) ?? "")
    : "";
}

async function createMockLlmCredential(page: Page): Promise<string> {
  const wsId = await getWorkspaceId(page);
  const result = await page.evaluate(async (workspaceId) => {
    const res = await fetch("/api/credentials", {
      method: "POST",
      redirect: "manual",
      headers: {
        "Content-Type": "application/json",
        "x-inspoter-workspace": workspaceId,
      },
      body: JSON.stringify({
        provider: "OPENAI_COMPATIBLE",
        label: `agents-e2e-${Math.floor(Math.random() * 1e6)}`,
        // Port 9 is the discard service — nothing can answer there.
        baseUrl: "http://127.0.0.1:9/v1",
        model: "mock-model",
        apiKey: "mock-key",
        mode: "MOCK",
      }),
    });
    return { status: res.status, body: (await res.json()) as unknown };
  }, wsId);
  expect(result.status).toBe(201);
  const body = result.body as { id?: unknown };
  if (typeof body.id !== "string") {
    throw new Error("Credential POST response must contain a string id.");
  }
  return body.id;
}

async function deleteCredential(page: Page, id: string) {
  const wsId = await getWorkspaceId(page);
  await page.evaluate(
    async ([credentialId, workspaceId]) => {
      await fetch(`/api/credentials/${encodeURIComponent(credentialId)}`, {
        method: "DELETE",
        redirect: "manual",
        headers: { "x-inspoter-workspace": workspaceId },
      });
    },
    [id, wsId] as const,
  );
}

// The AI Assistant section, phase 2: an operator creates a skill, creates an
// agent, grants it access and attaches the skill. Everything this spec creates
// is torn down in afterEach so a rerun never inherits the previous run's rows.

let createdAgents: string[] = [];
let createdSkills: string[] = [];

test.beforeEach(async ({ page }) => {
  createdAgents = [];
  createdSkills = [];
  await login(page);
});

test.afterEach(async ({ page }) => {
  for (const name of createdAgents) {
    await deleteRow(page, "/agents", name).catch(() => {});
  }
  for (const name of createdSkills) {
    await deleteRow(page, "/agents/skills", name).catch(() => {});
  }
});

function unique(prefix: string) {
  return `${prefix}-${Math.floor(Math.random() * 1e6)}`;
}

function row(page: Page, name: string) {
  return page.getByRole("row").filter({ hasText: name });
}

async function deleteRow(page: Page, path: string, name: string) {
  await page.goto(path);
  await row(page, name).getByRole("button", { name: "Delete" }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Delete", exact: true })
    .click();
  await expect(row(page, name)).toHaveCount(0);
}

async function createSkill(page: Page, name: string) {
  await page.goto("/agents/skills");
  await page.getByRole("button", { name: "New skill", exact: true }).click();
  await page.getByLabel("Name", { exact: true }).fill(name);
  await page
    .getByLabel("Description", { exact: true })
    .fill("Read the overnight logs.");
  await page
    .getByLabel("Instructions", { exact: true })
    .fill("Group log entries by service before summarizing.");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await expect(row(page, name)).toBeVisible();
  createdSkills.push(name);
}

async function createAgent(page: Page, name: string) {
  await page.goto("/agents");
  await page.getByRole("button", { name: "New agent", exact: true }).click();
  await page.getByLabel("Name", { exact: true }).fill(name);
  await page
    .getByLabel("Instructions", { exact: true })
    .fill("Summarize what broke overnight.");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await expect(row(page, name)).toBeVisible();
  createdAgents.push(name);
}

test("the section is reachable from the sidebar", async ({ page }) => {
  await page.getByRole("link", { name: "AI Assistant", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "AI Assistant", level: 1 }),
  ).toBeVisible();
});

test("creates a skill, an agent, grants access and attaches the skill", async ({
  page,
}) => {
  const skillName = unique("e2e-skill");
  const agentName = unique("e2e-agent");

  await createSkill(page, skillName);
  await createAgent(page, agentName);

  await row(page, agentName).getByRole("link", { name: agentName }).click();
  await expect(
    page.getByRole("heading", { name: agentName, level: 1 }),
  ).toBeVisible();

  // Access: ticking Write on a section also ticks its Read, because a write
  // tool always needs the ids a read tool hands out.
  const logs = page.getByText("Logs", { exact: true }).locator("..");
  await logs.getByRole("checkbox").first().check();
  await page.getByRole("button", { name: "Save access", exact: true }).click();
  await expect(page.getByText("Access updated")).toBeVisible();

  // Skills: attach, then save.
  await page
    .getByRole("listitem")
    .filter({ hasText: skillName })
    .getByRole("button", { name: "Attach", exact: true })
    .click();
  await page.getByRole("button", { name: "Save skills", exact: true }).click();
  await expect(page.getByText("Skills updated")).toBeVisible();

  await page.reload();
  await expect(
    page
      .getByRole("listitem")
      .filter({ hasText: skillName })
      .getByRole("button", { name: "Detach", exact: true }),
  ).toBeVisible();

  await page.goto("/agents");
  await expect(row(page, agentName)).toContainText("1 skill");
  await expect(row(page, agentName)).toContainText("1 scope");
});

test("runs an agent and shows the model and tool steps it took", async ({
  page,
}) => {
  const agentName = unique("e2e-run-agent");
  let credentialId: string | undefined;

  try {
    await createAgent(page, agentName);
    credentialId = await createMockLlmCredential(page);

    // Access is what gives the run a tool to call; without it the mock script
    // is a single prose turn and there is no TOOL_CALL step to assert.
    await row(page, agentName).getByRole("link", { name: agentName }).click();
    const logs = page.getByText("Logs", { exact: true }).locator("..");
    await logs.getByRole("checkbox").first().check();
    await page
      .getByRole("button", { name: "Save access", exact: true })
      .click();
    await expect(page.getByText("Access updated")).toBeVisible();

    await page.getByRole("button", { name: "Run now", exact: true }).click();
    await page.getByRole("button", { name: "Start", exact: true }).click();

    // The scheduler picks the run up on its next tick, and the run page polls
    // until it settles.
    await expect(page.getByText("Succeeded")).toBeVisible({ timeout: 45_000 });
    // The report appears twice — once as the run's summary, once as the last
    // step's output — so the assertion names which one it means.
    await expect(
      page.getByRole("paragraph").filter({ hasText: `${agentName} finished` }),
    ).toBeVisible();
    await expect(page.locator("ol").getByText("logs_search")).toBeVisible();

    await page.goto("/agents/runs");
    await expect(row(page, agentName)).toContainText("Succeeded");
  } finally {
    if (credentialId) await deleteCredential(page, credentialId);
  }
});

test("refuses a skill that names a tool the catalogue does not have", async ({
  page,
}) => {
  const skillName = unique("e2e-skill-bad");
  await page.goto("/agents/skills");
  await page.getByRole("button", { name: "New skill", exact: true }).click();
  await page.getByLabel("Name", { exact: true }).fill(skillName);
  await page.getByLabel("Description", { exact: true }).fill("Broken.");
  await page.getByLabel("Instructions", { exact: true }).fill("Body.");
  await page.getByLabel("Limit to tools", { exact: true }).fill("logs_serch");
  await page.getByRole("button", { name: "Create", exact: true }).click();

  await expect(page.getByText("Unknown tools: logs_serch")).toBeVisible();
  await expect(row(page, skillName)).toHaveCount(0);
});
