import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures/test";
import { login } from "./utils/auth";

// mode: "MOCK" is a hard requirement, not a convenience (architecture.md
// §7F.1): a real model is non-deterministic by construction, and the run
// timeline this spec asserts is the mock script from
// buildAgentMockTurns() — one read-only tool call, then a report. baseUrl
// points at the discard port as a second line of defence.
// The id is rendered by AppSidebar, which at the mobile viewport lives inside
// a closed Sheet — so at 375px the attribute is simply not in the DOM until the
// navigation is opened. Opening it here keeps every caller viewport-independent.
async function getWorkspaceId(page: Page): Promise<string> {
  const wsEl = page.locator("[data-workspace-id]").first();
  if ((await wsEl.count()) === 0) {
    await page.getByRole("button", { name: "Toggle navigation" }).click();
    await expect(wsEl).toBeAttached();
    const id = (await wsEl.getAttribute("data-workspace-id")) ?? "";
    await page.keyboard.press("Escape");
    return id;
  }
  return (await wsEl.getAttribute("data-workspace-id")) ?? "";
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
    await deleteRow(page, "/agents/agents", name).catch(() => {});
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
  // The agents table lives at /agents/agents — the /agents landing is the
  // chats view since the agent-chats feature (see AgentSectionActions).
  await page.goto("/agents/agents");
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
  // At the mobile viewport the rail collapses into an off-canvas Sheet, so the
  // nav link only exists once the trigger is pressed. This spec runs on both
  // Playwright projects (playwright.config.ts testMatch), hence the branch.
  let nav = page.getByRole("link", { name: "AI Assistant", exact: true });
  const isDesktop = (await nav.count()) > 0;
  if (!isDesktop) {
    await page.getByRole("button", { name: "Toggle navigation" }).click();
    // Scope to the Sheet: resolving the link before it opened would keep a
    // detached handle and the click would land on nothing.
    nav = page
      .getByRole("dialog")
      .getByRole("link", { name: "AI Assistant", exact: true });
  }
  await nav.first().click();
  await page.waitForURL(/\/agents$/);

  // The heading is asserted only on the desktop rail. AppSidebar renders plain
  // <Link>s with no setOpenMobile(false), so on mobile the Sheet stays open
  // over the page after the navigation and marks the content behind it
  // aria-hidden — shell-wide behaviour, identical for every section, so this
  // spec records the reachability and leaves that to the shell's own suite.
  // The section link lands on the chats view, whose h1 names the page
  // ("Agent chats"), not the section ("AI Assistant" — that is /agents/agents).
  if (isDesktop) {
    await expect(
      page.getByRole("heading", { name: "Agent chats", level: 1 }),
    ).toBeVisible();
  }
});

test("the section fits the viewport without horizontal overflow", async ({
  page,
}) => {
  const agentName = unique("e2e-responsive");
  await createAgent(page, agentName);
  await row(page, agentName).getByRole("link", { name: agentName }).click();

  // The Access matrix is the widest thing the section renders: one row per
  // domain with a Read and a Write box pushed to the right edge. Its caption
  // is a CardTitle, not a heading element, so it is matched by text.
  await expect(page.getByText("Access", { exact: true })).toBeVisible();

  for (const path of [
    "/agents",
    "/agents/agents",
    "/agents/skills",
    "/agents/runs",
  ]) {
    await page.goto(path);
    const overflows = await page.evaluate(
      () =>
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth,
    );
    expect(overflows, `${path} overflows horizontally`).toBe(false);
  }
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

  await page.goto("/agents/agents");
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

test("drafts a skill's description and instructions with the model", async ({
  page,
}) => {
  const skillName = unique("e2e-ai-skill");
  let credentialId: string | undefined;

  try {
    await page.goto("/agents/skills");
    // createMockLlmCredential reads [data-workspace-id] out of the rendered
    // shell, and at the mobile viewport that attribute only settles once the
    // sidebar Sheet has closed — so wait for the page to be interactive before
    // asking for it, rather than racing the hydration.
    await expect(
      page.getByRole("button", { name: "New skill", exact: true }),
    ).toBeVisible();
    credentialId = await createMockLlmCredential(page);

    await page.getByRole("button", { name: "New skill", exact: true }).click();
    await page.getByLabel("Name", { exact: true }).fill(skillName);

    // The mock answer echoes the brief, so a draft carrying the name is proof
    // the model was asked about THIS skill rather than returning a constant.
    await page
      .getByRole("button", { name: "Generate description", exact: true })
      .click();
    await expect(page.getByLabel("Description", { exact: true })).toHaveValue(
      new RegExp(skillName),
      { timeout: 15_000 },
    );

    await page
      .getByRole("button", { name: "Generate instructions", exact: true })
      .click();
    await expect(page.getByLabel("Instructions", { exact: true })).toHaveValue(
      new RegExp(skillName),
      { timeout: 15_000 },
    );

    // Nothing is stored until the operator presses Create: the model proposes,
    // the existing deterministic code saves.
    await page.getByRole("button", { name: "Create", exact: true }).click();
    await expect(row(page, skillName)).toBeVisible();
    createdSkills.push(skillName);
  } finally {
    if (credentialId) await deleteCredential(page, credentialId);
  }
});

test("offers the draft buttons when editing an existing skill", async ({
  page,
}) => {
  const skillName = unique("e2e-ai-edit");
  await createSkill(page, skillName);

  await row(page, skillName)
    .getByRole("button", { name: "Edit", exact: true })
    .click();
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue(skillName);

  // Both buttons are enabled here because the skill already has a name — the
  // floor the dialog requires before it will spend a model call.
  for (const label of ["Generate description", "Generate instructions"]) {
    await expect(
      page.getByRole("button", { name: label, exact: true }),
    ).toBeEnabled();
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
