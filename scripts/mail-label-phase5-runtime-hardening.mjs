import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { cp, mkdtemp, readFile, rm, symlink } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "@playwright/test";
import { Client } from "pg";
import {
  captureDatabaseSnapshot,
  compareAllSnapshotTables,
  guardedTestEnvironment,
  writeEvidence,
} from "./mail-label-phase5-evidence-lib.mjs";
import { createTestChildEnvironment } from "./test-env.mjs";
import REPOSITORY_ROOT from "./repository-root.cjs";

const require = createRequire(resolve(REPOSITORY_ROOT, "package.json"));
const NEXT_CLI = require.resolve("next/dist/bin/next");
const CURRENT_RUNTIME = REPOSITORY_ROOT;
const PHASE4_RUNTIME = "C:\\tmp\\inspoter-phase4-runtime-20260721";
// Match playwright.config.ts: Next.js 16 rewrites through localhost on Windows.
const HOST = process.platform === "win32" ? "localhost" : "127.0.0.1";
const CURRENT_PORT = 3920;
const PHASE4_PORT = 3921;
const WORKSPACE_HEADER = "x-inspoter-workspace";
const ROLLBACK_RUN_ID = "phase5-runtime-rollback-pending";
const RESTART = Object.freeze({
  accountId: "phase5-runtime-restart-account",
  folderId: "phase5-runtime-restart-inbox",
  labelId: "phase5-runtime-restart-label",
  ruleId: "phase5-runtime-restart-rule",
  runId: "phase5-runtime-restart-run",
  messagePrefix: "phase5-runtime-restart-mail-",
});

async function preparePhase4DerivedRuntime() {
  const cleanupRoot = await mkdtemp(
    resolve(tmpdir(), "inspoter-phase4-runtime-derived-"),
  );
  const directory = resolve(cleanupRoot, "runtime");
  await cp(PHASE4_RUNTIME, directory, { recursive: true });
  const dependencySource = resolve(REPOSITORY_ROOT, "node_modules");
  await symlink(
    dependencySource,
    resolve(directory, "node_modules"),
    "junction",
  );
  return { cleanupRoot, directory, dependencySource };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function redact(text, environment) {
  let result = text;
  for (const key of [
    "DATABASE_URL",
    "OPERATOR_PASSWORD",
    "OPERATOR_PASSWORD_HASH",
    "CREDENTIAL_ENCRYPTION_KEY",
  ]) {
    const value = environment[key];
    if (value) result = result.split(value).join(`[${key}_REDACTED]`);
  }
  return result;
}

async function assertPortFree(port) {
  await new Promise((resolvePromise, rejectPromise) => {
    const probe = createServer();
    probe.unref();
    probe.once("error", (error) => {
      rejectPromise(
        new Error(
          `Dedicated evidence port ${port} is unavailable: ${error.code}`,
        ),
      );
    });
    probe.listen({ host: HOST, port, exclusive: true }, () => {
      probe.close((error) => (error ? rejectPromise(error) : resolvePromise()));
    });
  });
}

function startServer({ runtimeDirectory, port, tickMs, env }) {
  const childEnvironment = createTestChildEnvironment({
    ...env,
    NODE_ENV: "production",
    HOSTNAME: HOST,
    PORT: String(port),
    MAIL_SYNC_TICK_MS: String(tickMs),
    SERVICE_SCHEDULER_TICK_MS: "600000",
    WEBHOOK_SCHEDULER_TICK_MS: "600000",
    WEBHOOK_DELIVERY_RETENTION_TICK_MS: "600000",
  });
  const child = spawn(
    process.execPath,
    [NEXT_CLI, "start", runtimeDirectory, "-p", String(port), "-H", HOST],
    {
      cwd: REPOSITORY_ROOT,
      env: childEnvironment,
      shell: false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let output = "";
  const collect = (chunk) => {
    output = `${output}${chunk.toString("utf8")}`.slice(-20_000);
  };
  child.stdout.on("data", collect);
  child.stderr.on("data", collect);
  return {
    child,
    pid: child.pid,
    baseUrl: `http://${HOST}:${port}`,
    output: () => redact(output, childEnvironment),
  };
}

async function waitForServer(server, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (server.child.exitCode !== null) {
      throw new Error(
        `Server PID ${server.pid} exited before readiness.\n${server.output()}`,
      );
    }
    try {
      const response = await fetch(`${server.baseUrl}/login`, {
        redirect: "manual",
      });
      if (response.status < 500) return;
    } catch {
      // Boot is still in progress.
    }
    await delay(100);
  }
  throw new Error(
    `Server PID ${server.pid} did not become ready.\n${server.output()}`,
  );
}

async function stopServer(server) {
  if (!server || server.child.exitCode !== null) return;
  const exit = new Promise((resolvePromise) =>
    server.child.once("exit", resolvePromise),
  );
  server.child.kill("SIGTERM");
  const stopped = await Promise.race([
    exit.then(() => true),
    delay(5_000).then(() => false),
  ]);
  if (!stopped && server.child.exitCode === null) {
    server.child.kill("SIGKILL");
    await Promise.race([exit, delay(5_000)]);
  }
  assert(
    server.child.exitCode !== null || server.child.signalCode !== null,
    `Exact server PID ${server.pid} did not terminate.`,
  );
}

async function login(baseUrl, environment) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    baseURL: baseUrl,
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();
  try {
    await page.goto("/login");
    await page.getByLabel("Username").fill(environment.OPERATOR_USERNAME);
    await page
      .getByRole("textbox", { name: "Password" })
      .fill(environment.OPERATOR_PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL(/\/bookmarks(?:\?|$)/, { timeout: 15_000 });
    return { browser, context, page };
  } catch (error) {
    await browser.close();
    throw error;
  }
}

async function json(response, description) {
  assert(
    response.ok(),
    `${description} failed with HTTP ${response.status()}.`,
  );
  return response.json();
}

async function smokeExistingMail(baseUrl, environment, fixture) {
  const session = await login(baseUrl, environment);
  const headers = { [WORKSPACE_HEADER]: fixture.workspaceId };
  try {
    const accounts = await json(
      await session.context.request.get(`${baseUrl}/api/mail/accounts`, {
        headers,
      }),
      "Mail account list",
    );
    assert(
      accounts.some((account) => account.id === fixture.accountId),
      "Sentinel Mail account was not listed.",
    );

    const folders = await json(
      await session.context.request.get(
        `${baseUrl}/api/mail/accounts/${fixture.accountId}/folders`,
        { headers },
      ),
      "Mail folder list",
    );
    assert(
      folders.some((folder) => folder.id === fixture.inboxId),
      "Sentinel INBOX was not listed.",
    );

    const query = new URLSearchParams({
      accountId: fixture.accountId,
      folderId: fixture.inboxId,
    });
    const list = await json(
      await session.context.request.get(`${baseUrl}/api/mail?${query}`, {
        headers,
      }),
      "Mail message list",
    );
    assert(
      list.items.some((item) => item.id === fixture.messageId),
      "Sentinel Mail message was not listed.",
    );

    const detail = await json(
      await session.context.request.get(
        `${baseUrl}/api/mail/${fixture.messageId}`,
        { headers },
      ),
      "Mail message detail",
    );
    assert(
      detail.bodyText === "BODY_PHASE5_MIGRATION_SENTINEL" &&
        detail.bodyHtml === "<p>HTML_PHASE5_MIGRATION_SENTINEL</p>" &&
        detail.isFlagged === true,
      "Mail detail did not preserve body/flag sentinels.",
    );

    const attachment = await session.context.request.get(
      `${baseUrl}/api/mail/${fixture.messageId}/attachments/${fixture.attachmentId}`,
      { headers },
    );
    assert(attachment.ok(), "Mail attachment download failed.");
    assert(
      (await attachment.body()).toString("utf8") ===
        "ATTACHMENT_PHASE5_SENTINEL",
      "Mail attachment bytes changed.",
    );

    for (const isRead of [false, true]) {
      const action = await json(
        await session.context.request.patch(
          `${baseUrl}/api/mail/${fixture.messageId}`,
          { headers, data: { isRead } },
        ),
        `Mail mark-${isRead ? "read" : "unread"} action`,
      );
      assert(action.isRead === isRead, "Mail action returned the wrong state.");
    }

    return {
      accounts: accounts.length,
      folders: folders.length,
      messages: list.items.length,
      detail: "body/html/flag preserved",
      attachment: "bytes preserved",
      reversibleAction: "unread -> read",
    };
  } finally {
    await session.browser.close();
  }
}

async function verifyLabelsAvailable(baseUrl, environment, fixture) {
  const session = await login(baseUrl, environment);
  const headers = { [WORKSPACE_HEADER]: fixture.workspaceId };
  try {
    const labels = await json(
      await session.context.request.get(`${baseUrl}/api/mail/labels`, {
        headers,
      }),
      "Mail label list",
    );
    assert(
      labels.some((label) => label.id === fixture.labelId),
      "Preserved label was absent from the enabled API.",
    );
    await session.page.goto("/en/mail");
    await session.page
      .getByRole("navigation", { name: "Labels" })
      .waitFor({ timeout: 15_000 });
    await session.page
      .getByText("Migration label", { exact: true })
      .first()
      .waitFor({ timeout: 15_000 });
    return { apiLabelCount: labels.length, uiLabel: "Migration label" };
  } finally {
    await session.browser.close();
  }
}

async function withClient(connectionString, callback) {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    return await callback(client);
  } finally {
    await client.end();
  }
}

async function loadFixture(connectionString) {
  return withClient(connectionString, async (client) => {
    const result = await client.query(
      `SELECT r."workspaceId", r."accountId", r."labelId", r.id AS "ruleId",
        i.id AS "messageId", i."folderId" AS "inboxId", a.id AS "attachmentId",
        r."fromAddress", r."subjectContains", i."createdAt"
       FROM "MailFilterRule" r
       JOIN "MailItem" i ON i."workspaceId" = r."workspaceId"
         AND i."accountId" = r."accountId"
       JOIN "MailAttachment" a ON a."mailItemId" = i.id
       WHERE r.id = 'phase5-migration-rule'
         AND i.id = 'phase5-migration-message'`,
    );
    assert(
      result.rowCount === 1,
      "Populated Phase 4 sentinel fixture is missing.",
    );
    return result.rows[0];
  });
}

async function ensureWebhookMailboxBaseline(connectionString, workspaceId) {
  await withClient(connectionString, async (client) => {
    await client.query("BEGIN");
    try {
      const existing = await client.query(
        `SELECT id FROM "MailAccount"
         WHERE "workspaceId" = $1 AND kind = 'WEBHOOK'`,
        [workspaceId],
      );
      if (existing.rowCount === 0) {
        const now = new Date("2026-07-20T10:06:00.000Z");
        const accountId = "phase5-runtime-webhook-account";
        await client.query(
          `INSERT INTO "MailAccount" (
            id, "workspaceId", kind, mode, name, email, "syncStatus",
            "createdAt", "updatedAt"
          ) VALUES ($1, $2, 'WEBHOOK', 'REAL', 'Webhook', '', 'IDLE', $3, $3)`,
          [accountId, workspaceId, now],
        );
        await client.query(
          `INSERT INTO "MailFolder" (
            id, "workspaceId", "accountId", "accountWorkspaceId", path, name,
            "specialUse", position, "createdAt", "updatedAt"
          ) VALUES ($1, $2, $3, $2, 'INBOX', 'Входящие', 'INBOX', 0, $4, $4)`,
          ["phase5-runtime-webhook-inbox", workspaceId, accountId, now],
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    }
  });
}

async function seedRollbackRun(connectionString, fixture) {
  await withClient(connectionString, async (client) => {
    await client.query(`DELETE FROM "MailFilterRun" WHERE id = $1`, [
      ROLLBACK_RUN_ID,
    ]);
    await client.query(
      `INSERT INTO "MailFilterRun" (
        id, "workspaceId", "ruleId", "ruleWorkspaceId", "sourceRuleId",
        "snapshotAccountId", "snapshotLabelId", "snapshotFromAddress",
        "snapshotSubjectContains", status, "cutoffCreatedAt", "cutoffId",
        "createdAt", "updatedAt"
      ) VALUES ($1, $2, $3, $2, $3, $4, $5, $6, $7, 'PENDING', $8, $9,
        CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [
        ROLLBACK_RUN_ID,
        fixture.workspaceId,
        fixture.ruleId,
        fixture.accountId,
        fixture.labelId,
        fixture.fromAddress,
        fixture.subjectContains,
        fixture.createdAt,
        fixture.messageId,
      ],
    );
  });
}

async function readRun(connectionString, runId) {
  return withClient(connectionString, async (client) => {
    const result = await client.query(
      `SELECT id, status::text AS status, "processedCount", "matchedCount",
        attempts, "cursorCreatedAt", "cursorId", "leaseToken", "leaseExpiresAt",
        "completedAt"
       FROM "MailFilterRun" WHERE id = $1`,
      [runId],
    );
    assert(result.rowCount === 1, `Run ${runId} is missing.`);
    return result.rows[0];
  });
}

async function seedRestartFixture(connectionString, workspaceId) {
  return withClient(connectionString, async (client) => {
    await client.query("BEGIN");
    try {
      await client.query(`DELETE FROM "MailFilterRun" WHERE id IN ($1, $2)`, [
        ROLLBACK_RUN_ID,
        RESTART.runId,
      ]);
      await client.query(`DELETE FROM "MailFilterRule" WHERE id = $1`, [
        RESTART.ruleId,
      ]);
      await client.query(`DELETE FROM "MailLabel" WHERE id = $1`, [
        RESTART.labelId,
      ]);
      await client.query(`DELETE FROM "MailAccount" WHERE id = $1`, [
        RESTART.accountId,
      ]);

      const base = new Date("2026-07-21T12:00:00.000Z");
      await client.query(
        `INSERT INTO "MailAccount" (
          id, "workspaceId", kind, mode, name, email, "syncStatus",
          "createdAt", "updatedAt"
        ) VALUES ($1, $2, 'IMAP', 'MOCK', 'Phase 5 restart account',
          'restart@example.test', 'IDLE', $3, $3)`,
        [RESTART.accountId, workspaceId, base],
      );
      await client.query(
        `INSERT INTO "MailFolder" (
          id, "workspaceId", "accountId", "accountWorkspaceId", path, name,
          "specialUse", position, "createdAt", "updatedAt"
        ) VALUES ($1, $2, $3, $2, 'INBOX', 'Inbox', 'INBOX', 0, $4, $4)`,
        [RESTART.folderId, workspaceId, RESTART.accountId, base],
      );
      await client.query(
        `INSERT INTO "MailLabel" (
          id, "workspaceId", name, "normalizedName", color, position,
          "createdAt", "updatedAt"
        ) VALUES ($1, $2, 'Restart label', 'restart label', 'GREEN', 50, $3, $3)`,
        [RESTART.labelId, workspaceId, base],
      );
      await client.query(
        `INSERT INTO "MailFilterRule" (
          id, "workspaceId", "accountId", "accountWorkspaceId", "labelId",
          "labelWorkspaceId", name, "fromAddress", "subjectContains",
          "isActive", position, "createdAt", "updatedAt"
        ) VALUES ($1, $2, $3, $2, $4, $2, 'Restart recovery rule',
          'restart@example.test', NULL, true, 50, $5, $5)`,
        [RESTART.ruleId, workspaceId, RESTART.accountId, RESTART.labelId, base],
      );
      await client.query(
        `INSERT INTO "MailItem" (
          id, "workspaceId", "accountId", "accountWorkspaceId", "folderId",
          "folderWorkspaceId", "messageId", "fromAddress", subject,
          "bodyText", snippet, "receivedAt", "createdAt"
        )
        SELECT $1 || lpad(value::text, 3, '0'), $2, $3, $2, $4, $2,
          '<restart-' || value || '@example.test>', 'restart@example.test',
          'Restart message ' || value, 'Restart body ' || value,
          'Restart message ' || value,
          $5::timestamp + (value * interval '1 millisecond'),
          $5::timestamp + (value * interval '1 millisecond')
        FROM generate_series(1, 201) AS value`,
        [
          RESTART.messagePrefix,
          workspaceId,
          RESTART.accountId,
          RESTART.folderId,
          base,
        ],
      );
      const cutoffId = `${RESTART.messagePrefix}201`;
      const cutoffCreatedAt = new Date(base.getTime() + 201);
      await client.query(
        `INSERT INTO "MailFilterRun" (
          id, "workspaceId", "ruleId", "ruleWorkspaceId", "sourceRuleId",
          "snapshotAccountId", "snapshotLabelId", "snapshotFromAddress",
          "snapshotSubjectContains", status, "cutoffCreatedAt", "cutoffId",
          "createdAt", "updatedAt"
        ) VALUES ($1, $2, $3, $2, $3, $4, $5, 'restart@example.test', NULL,
          'PENDING', $6, $7, $8, $8)`,
        [
          RESTART.runId,
          workspaceId,
          RESTART.ruleId,
          RESTART.accountId,
          RESTART.labelId,
          cutoffCreatedAt,
          cutoffId,
          base,
        ],
      );
      await client.query("COMMIT");
      return { cutoffId, cutoffCreatedAt };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
}

async function waitForRun(connectionString, predicate, description, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const run = await readRun(connectionString, RESTART.runId);
    if (predicate(run)) return run;
    await delay(20);
  }
  throw new Error(`Timed out waiting for ${description}.`);
}

async function assignmentIds(connectionString) {
  return withClient(connectionString, async (client) => {
    const result = await client.query(
      `SELECT mil."mailItemId"
       FROM "MailItemLabel" mil
       WHERE mil."labelId" = $1 AND mil."mailItemId" LIKE $2
       ORDER BY mil."mailItemId"`,
      [RESTART.labelId, `${RESTART.messagePrefix}%`],
    );
    return result.rows.map((row) => row.mailItemId);
  });
}

async function expireOnlyRestartLease(connectionString) {
  return withClient(connectionString, async (client) => {
    const before = await client.query(
      `SELECT id, "leaseExpiresAt" FROM "MailFilterRun"
       WHERE status = 'RUNNING' ORDER BY id`,
    );
    const update = await client.query(
      `UPDATE "MailFilterRun"
       SET "leaseExpiresAt" = CURRENT_TIMESTAMP - interval '1 second',
         "updatedAt" = CURRENT_TIMESTAMP
       WHERE id = $1 AND status = 'RUNNING'
       RETURNING id`,
      [RESTART.runId],
    );
    assert(
      update.rowCount === 1,
      "Exactly the restart run lease was not expired.",
    );
    const after = await client.query(
      `SELECT id, "leaseExpiresAt" FROM "MailFilterRun"
       WHERE status = 'RUNNING' ORDER BY id`,
    );
    const otherBefore = before.rows.filter((row) => row.id !== RESTART.runId);
    const otherAfter = after.rows.filter((row) => row.id !== RESTART.runId);
    assert(
      JSON.stringify(otherBefore) === JSON.stringify(otherAfter),
      "A non-target run lease changed.",
    );
    return {
      updatedRows: update.rowCount,
      otherRunningRuns: otherAfter.length,
    };
  });
}

async function schedulerSourceEvidence() {
  const scheduler = await readFile(
    resolve(REPOSITORY_ROOT, "src/lib/services/mail-scheduler.ts"),
    "utf8",
  );
  const instrumentation = await readFile(
    resolve(REPOSITORY_ROOT, "src/instrumentation.ts"),
    "utf8",
  );
  const setIntervalCalls = scheduler.match(/\bsetInterval\s*\(/gu)?.length ?? 0;
  const startCalls =
    instrumentation.match(/\bstartMailScheduler\s*\(\s*\)/gu)?.length ?? 0;
  assert(
    setIntervalCalls === 1,
    "Mail scheduler must own exactly one interval.",
  );
  assert(startCalls === 1, "Instrumentation must start Mail scheduler once.");
  assert(
    scheduler.includes("processFilterRuns()") &&
      scheduler.includes("syncOneAccount"),
    "Filter runs are not integrated into the existing Mail tick.",
  );
  return {
    mailSchedulerSetIntervalCalls: setIntervalCalls,
    instrumentationStartCalls: startCalls,
    integration: "account sync and filter runs share runMailSchedulerTick",
  };
}

function assertExpectedRestartChanges(before, after) {
  const expectedMutable = new Set(["MailFilterRun", "MailItemLabel"]);
  const differences = [];
  for (const [table, left] of Object.entries(before.tables)) {
    if (expectedMutable.has(table)) continue;
    const right = after.tables[table];
    if (!right || left.count !== right.count || left.sha256 !== right.sha256) {
      differences.push(table);
    }
  }
  assert(
    differences.length === 0,
    `Restart changed protected non-target tables: ${differences.join(", ")}`,
  );
}

async function main() {
  const { environment, target } = guardedTestEnvironment();
  assert(environment.OPERATOR_PASSWORD, "Test operator password is required.");
  await Promise.all([
    assertPortFree(CURRENT_PORT),
    assertPortFree(PHASE4_PORT),
  ]);

  const fixture = await loadFixture(environment.DATABASE_URL);
  await ensureWebhookMailboxBaseline(
    environment.DATABASE_URL,
    fixture.workspaceId,
  );
  await seedRollbackRun(environment.DATABASE_URL, fixture);
  const rollbackBefore = await captureDatabaseSnapshot(
    environment.DATABASE_URL,
  );
  const processes = [];
  let activeServer;
  let phase4Derived;
  try {
    activeServer = startServer({
      runtimeDirectory: CURRENT_RUNTIME,
      port: CURRENT_PORT,
      tickMs: 600_000,
      env: environment,
    });
    processes.push({ role: "current-labels-always-on", pid: activeServer.pid });
    await waitForServer(activeServer);
    const labelsAvailable = await verifyLabelsAvailable(
      activeServer.baseUrl,
      environment,
      fixture,
    );
    const currentMailSmoke = await smokeExistingMail(
      activeServer.baseUrl,
      environment,
      fixture,
    );
    const pendingRun = await readRun(environment.DATABASE_URL, ROLLBACK_RUN_ID);
    assert(
      pendingRun.status === "PENDING" &&
        pendingRun.processedCount === 0 &&
        pendingRun.leaseToken === null,
      "Long-interval smoke server unexpectedly processed a filter run.",
    );
    await stopServer(activeServer);
    activeServer = undefined;

    await assertPortFree(PHASE4_PORT);
    phase4Derived = await preparePhase4DerivedRuntime();
    activeServer = startServer({
      runtimeDirectory: phase4Derived.directory,
      port: PHASE4_PORT,
      tickMs: 600_000,
      env: environment,
    });
    processes.push({ role: "phase4-additive-schema", pid: activeServer.pid });
    await waitForServer(activeServer);
    const phase4MailSmoke = await smokeExistingMail(
      activeServer.baseUrl,
      environment,
      fixture,
    );
    await stopServer(activeServer);
    activeServer = undefined;

    const rollbackAfter = await captureDatabaseSnapshot(
      environment.DATABASE_URL,
    );
    const rollbackDifferences = compareAllSnapshotTables(
      rollbackBefore,
      rollbackAfter,
    );
    assert(
      rollbackDifferences.length === 0,
      `Rollback integrity changed:\n${rollbackDifferences.join("\n")}`,
    );

    const restartFixture = await seedRestartFixture(
      environment.DATABASE_URL,
      fixture.workspaceId,
    );
    const restartBefore = await captureDatabaseSnapshot(
      environment.DATABASE_URL,
    );
    const scheduler = await schedulerSourceEvidence();

    await assertPortFree(CURRENT_PORT);
    activeServer = startServer({
      runtimeDirectory: CURRENT_RUNTIME,
      port: CURRENT_PORT,
      tickMs: 5_000,
      env: environment,
    });
    processes.push({ role: "restart-first-process", pid: activeServer.pid });
    await waitForServer(activeServer);
    const firstBatch = await waitForRun(
      environment.DATABASE_URL,
      (run) => run.status === "RUNNING" && run.processedCount === 200,
      "the first exact 200-row batch",
      15_000,
    );
    const firstAssignments = await assignmentIds(environment.DATABASE_URL);
    assert(
      firstAssignments.length === 200,
      "First process did not assign 200 rows.",
    );
    assert(
      firstBatch.cursorId === `${RESTART.messagePrefix}200`,
      "First process cursor did not stop at row 200.",
    );
    const firstPid = activeServer.pid;
    await stopServer(activeServer);
    activeServer = undefined;

    const leaseExpiry = await expireOnlyRestartLease(environment.DATABASE_URL);
    await assertPortFree(CURRENT_PORT);
    activeServer = startServer({
      runtimeDirectory: CURRENT_RUNTIME,
      port: CURRENT_PORT,
      tickMs: 1_000,
      env: environment,
    });
    processes.push({ role: "restart-fresh-process", pid: activeServer.pid });
    assert(activeServer.pid !== firstPid, "Restart did not use a fresh PID.");
    await waitForServer(activeServer);
    const completed = await waitForRun(
      environment.DATABASE_URL,
      (run) => run.status === "COMPLETED" && run.processedCount === 201,
      "fresh-process completion",
      15_000,
    );
    const finalAssignments = await assignmentIds(environment.DATABASE_URL);
    assert(
      finalAssignments.length === 201,
      "Restart did not produce 201 assignments.",
    );
    assert(
      new Set(finalAssignments).size === 201,
      "Restart produced duplicate assignments.",
    );
    const resumedIds = finalAssignments.filter(
      (id) => !new Set(firstAssignments).has(id),
    );
    assert(
      resumedIds.length === 1 && resumedIds[0] === restartFixture.cutoffId,
      "Fresh process did not resume strictly after the committed cursor.",
    );
    assert(
      completed.matchedCount === 201 &&
        completed.cursorId === restartFixture.cutoffId,
      "Completed run counts/cursor are incorrect.",
    );
    await stopServer(activeServer);
    activeServer = undefined;

    const restartAfter = await captureDatabaseSnapshot(
      environment.DATABASE_URL,
    );
    assertExpectedRestartChanges(restartBefore, restartAfter);
    assert(
      restartAfter.tables.MailItemLabel.count ===
        restartBefore.tables.MailItemLabel.count + 201,
      "Restart assignment count delta was not exactly 201.",
    );

    const evidence = {
      status: "PASS",
      measuredAt: new Date().toISOString(),
      target: target.sanitizedTarget,
      ports: { current: CURRENT_PORT, phase4: PHASE4_PORT },
      processes,
      deployment: {
        labelsAvailable,
        currentMailSmoke,
        pendingRun: {
          id: pendingRun.id,
          status: pendingRun.status,
          processedCount: pendingRun.processedCount,
          leaseToken: pendingRun.leaseToken,
        },
      },
      rollback: {
        phase4Runtime: {
          preservedSource: PHASE4_RUNTIME,
          derivedCopy: phase4Derived.directory,
          dependencyJunctionSource: phase4Derived.dependencySource,
          preservedSourceModified: false,
        },
        phase4MailSmoke,
        protectedDifferences: rollbackDifferences,
        before: rollbackBefore,
        after: rollbackAfter,
      },
      restart: {
        fixtureRows: 201,
        batchSize: 200,
        scheduler,
        firstProcess: {
          pid: firstPid,
          status: firstBatch.status,
          processedCount: firstBatch.processedCount,
          matchedCount: firstBatch.matchedCount,
          cursorId: firstBatch.cursorId,
          assignments: firstAssignments.length,
        },
        leaseExpiry,
        freshProcess: {
          pid: processes.at(-1).pid,
          status: completed.status,
          processedCount: completed.processedCount,
          matchedCount: completed.matchedCount,
          cursorId: completed.cursorId,
          assignments: finalAssignments.length,
          resumedIds,
        },
        expectedMutableTables: ["MailFilterRun", "MailItemLabel"],
        before: restartBefore,
        after: restartAfter,
      },
    };
    const path = await writeEvidence("runtime-hardening.json", evidence);
    console.log(
      `[mail-label-phase5] runtime hardening passed; evidence ${path}.`,
    );
  } finally {
    await stopServer(activeServer).catch(() => {});
    await Promise.all([
      assertPortFree(CURRENT_PORT),
      assertPortFree(PHASE4_PORT),
    ]);
    if (phase4Derived) {
      await rm(phase4Derived.cleanupRoot, { recursive: true, force: true });
    }
  }
}

main().catch((error) => {
  console.error(`[mail-label-phase5] ${error.message}`);
  process.exitCode = 1;
});
