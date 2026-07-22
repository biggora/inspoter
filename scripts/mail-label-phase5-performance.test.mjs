import { performance } from "node:perf_hooks";
import { afterAll, beforeAll, expect, test } from "vitest";
import { db } from "@/lib/db";
import {
  claimMailFilterRuns,
  MAIL_FILTER_RUN_BATCH_SIZE,
  processClaimedMailFilterRunBatch,
} from "@/lib/services/mail-filter-runs";
import { createMailFilterRule } from "@/lib/services/mail-filter-rules";
import * as mailService from "@/lib/services/mail";
import {
  guardedTestEnvironment,
  writeEvidence,
} from "./mail-label-phase5-evidence-lib.mjs";

const WORKSPACE_ID = "phase5-performance-workspace";
const ACCOUNT_ID = "phase5-performance-account";
const DECOY_ACCOUNT_ID = "phase5-performance-decoy-account";
const INBOX_ID = "phase5-performance-inbox";
const ARCHIVE_ID = "phase5-performance-archive";
const DECOY_INBOX_ID = "phase5-performance-decoy-inbox";
const LABEL_ID = "phase5-performance-label";
const TOTAL_MESSAGES = 20_000;
const ELIGIBLE_MESSAGES = 12_000;
const ARCHIVE_MESSAGES = 4_000;
const DECOY_MESSAGES = 4_000;
const WARMUPS = 5;
const SAMPLES = 30;
const BASE_TIME = Date.parse("2026-01-01T00:00:00.000Z");
let operatorId;

function id(prefix, index) {
  return `${prefix}-${String(index).padStart(6, "0")}`;
}

function percentile(values, quantile) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.ceil(sorted.length * quantile) - 1];
}

function timingSummary(values) {
  return {
    samples: values.length,
    minimumMs: Math.min(...values),
    p50Ms: percentile(values, 0.5),
    p95Ms: percentile(values, 0.95),
    maximumMs: Math.max(...values),
  };
}

async function insertInChunks(model, rows, chunkSize = 1_000) {
  for (let index = 0; index < rows.length; index += chunkSize) {
    await model.createMany({ data: rows.slice(index, index + chunkSize) });
  }
}

function mailRow({ index, accountId, folderId, prefix, eligible }) {
  const createdAt = new Date(BASE_TIME + Math.floor(index / 5) * 1_000);
  const release = eligible && index % 2 === 0;
  return {
    id: id(prefix, index),
    workspaceId: WORKSPACE_ID,
    accountId,
    accountWorkspaceId: WORKSPACE_ID,
    folderId,
    folderWorkspaceId: WORKSPACE_ID,
    fromAddress: release ? "release@example.test" : "noise@example.test",
    subject: release
      ? `Release performance message ${index}`
      : `Noise performance message ${index}`,
    bodyText: `Phase 5 performance body ${prefix} ${index}`,
    snippet: `Phase 5 performance ${prefix} ${index}`,
    isRead: index % 3 === 0,
    receivedAt: createdAt,
    createdAt,
  };
}

function summarizePlanNode(node, summary = []) {
  summary.push({
    nodeType: node["Node Type"],
    relation: node["Relation Name"] ?? null,
    index: node["Index Name"] ?? null,
    actualRows: node["Actual Rows"] ?? null,
    rowsRemovedByFilter: node["Rows Removed by Filter"] ?? 0,
    sharedHitBlocks: node["Shared Hit Blocks"] ?? 0,
    sharedReadBlocks: node["Shared Read Blocks"] ?? 0,
    sortMethod: node["Sort Method"] ?? null,
  });
  for (const child of node.Plans ?? []) summarizePlanNode(child, summary);
  return summary;
}

async function explainListQuery() {
  return db.$queryRawUnsafe(
    `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
     SELECT item.id
     FROM "MailItem" item
     WHERE item."workspaceId" = $1
       AND item."accountId" = $2
       AND item."folderId" = $3
       AND item."isRead" = false
       AND (
         item.subject ILIKE '%' || $5 || '%'
         OR item."fromAddress" ILIKE '%' || $5 || '%'
         OR item."fromName" ILIKE '%' || $5 || '%'
       )
       AND EXISTS (
         SELECT 1 FROM "MailItemLabel" assignment
         WHERE assignment."workspaceId" = $1
           AND assignment."labelId" = $4
           AND assignment."mailItemId" = item.id
       )
     ORDER BY item."receivedAt" DESC, item.id DESC
     LIMIT 51`,
    WORKSPACE_ID,
    ACCOUNT_ID,
    INBOX_ID,
    LABEL_ID,
    "release",
  );
}

async function explainBackfillQuery(cutoffCreatedAt, cutoffId) {
  return db.$queryRawUnsafe(
    `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
     SELECT item.id, item."createdAt", item."fromAddress", item.subject
     FROM "MailItem" item
     WHERE item."workspaceId" = $1
       AND item."accountId" = $2
       AND (
         item."createdAt" < $3
         OR (item."createdAt" = $3 AND item.id <= $4)
       )
       AND EXISTS (
         SELECT 1 FROM "MailFolder" folder
         WHERE folder.id = item."folderId"
           AND folder."workspaceId" = item."folderWorkspaceId"
           AND folder."specialUse" = 'INBOX'
       )
     ORDER BY item."createdAt" ASC, item.id ASC
     LIMIT 200`,
    WORKSPACE_ID,
    ACCOUNT_ID,
    cutoffCreatedAt,
    cutoffId,
  );
}

beforeAll(async () => {
  guardedTestEnvironment();
  const operator = await db.operator.findFirst({
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (!operator) throw new Error("Base seed did not create an operator.");
  operatorId = operator.id;
  await db.workspace.deleteMany({ where: { id: WORKSPACE_ID } });
  await db.workspace.create({
    data: {
      id: WORKSPACE_ID,
      name: "Phase 5 performance",
      slug: "phase5-performance",
    },
  });
  await db.workspaceMember.create({
    data: { workspaceId: WORKSPACE_ID, operatorId, role: "OWNER" },
  });
  await db.mailAccount.createMany({
    data: [
      {
        id: ACCOUNT_ID,
        workspaceId: WORKSPACE_ID,
        kind: "IMAP",
        mode: "MOCK",
        name: "Performance account",
        email: "performance@example.test",
      },
      {
        id: DECOY_ACCOUNT_ID,
        workspaceId: WORKSPACE_ID,
        kind: "IMAP",
        mode: "MOCK",
        name: "Performance decoy",
        email: "decoy@example.test",
      },
    ],
  });
  await db.mailFolder.createMany({
    data: [
      {
        id: INBOX_ID,
        workspaceId: WORKSPACE_ID,
        accountId: ACCOUNT_ID,
        accountWorkspaceId: WORKSPACE_ID,
        path: "INBOX",
        name: "Inbox",
        specialUse: "INBOX",
        position: 0,
      },
      {
        id: ARCHIVE_ID,
        workspaceId: WORKSPACE_ID,
        accountId: ACCOUNT_ID,
        accountWorkspaceId: WORKSPACE_ID,
        path: "Archive",
        name: "Archive",
        specialUse: "ARCHIVE",
        position: 1,
      },
      {
        id: DECOY_INBOX_ID,
        workspaceId: WORKSPACE_ID,
        accountId: DECOY_ACCOUNT_ID,
        accountWorkspaceId: WORKSPACE_ID,
        path: "INBOX",
        name: "Inbox",
        specialUse: "INBOX",
        position: 0,
      },
    ],
  });
  await db.mailLabel.create({
    data: {
      id: LABEL_ID,
      workspaceId: WORKSPACE_ID,
      name: "Performance",
      normalizedName: "performance",
      color: "BLUE",
      position: 0,
    },
  });

  const eligibleRows = Array.from({ length: ELIGIBLE_MESSAGES }, (_, index) =>
    mailRow({
      index,
      accountId: ACCOUNT_ID,
      folderId: INBOX_ID,
      prefix: "eligible",
      eligible: true,
    }),
  );
  const archiveRows = Array.from({ length: ARCHIVE_MESSAGES }, (_, index) =>
    mailRow({
      index,
      accountId: ACCOUNT_ID,
      folderId: ARCHIVE_ID,
      prefix: "archive",
      eligible: false,
    }),
  );
  const decoyRows = Array.from({ length: DECOY_MESSAGES }, (_, index) =>
    mailRow({
      index,
      accountId: DECOY_ACCOUNT_ID,
      folderId: DECOY_INBOX_ID,
      prefix: "decoy",
      eligible: false,
    }),
  );
  await insertInChunks(db.mailItem, [
    ...eligibleRows,
    ...archiveRows,
    ...decoyRows,
  ]);
  await insertInChunks(
    db.mailItemLabel,
    eligibleRows
      .filter((_, index) => index % 2 === 0)
      .map((row) => ({
        workspaceId: WORKSPACE_ID,
        mailItemId: row.id,
        mailItemWorkspaceId: WORKSPACE_ID,
        labelId: LABEL_ID,
        labelWorkspaceId: WORKSPACE_ID,
      })),
  );
});

afterAll(async () => {
  await db.workspace.deleteMany({ where: { id: WORKSPACE_ID } });
  await db.$disconnect();
});

test("ML-PERF-001 records 50-row list and real 200-row batch evidence", async () => {
  const listParameters = {
    accountId: ACCOUNT_ID,
    folderId: INBOX_ID,
    labelId: LABEL_ID,
    unreadOnly: true,
    query: "release",
    sort: "desc",
    pageSize: 50,
  };
  for (let index = 0; index < WARMUPS; index += 1) {
    const warmup = await mailService.list(WORKSPACE_ID, listParameters);
    expect(warmup.items).toHaveLength(50);
  }
  const listDurations = [];
  for (let index = 0; index < SAMPLES; index += 1) {
    const startedAt = performance.now();
    const page = await mailService.list(WORKSPACE_ID, listParameters);
    listDurations.push(performance.now() - startedAt);
    expect(page.items).toHaveLength(50);
  }

  const createdRule = await createMailFilterRule(WORKSPACE_ID, operatorId, {
    accountId: ACCOUNT_ID,
    labelId: LABEL_ID,
    name: "Performance backfill",
    subjectContains: "release",
    applyToExistingMail: true,
  });
  expect(createdRule.latestRun).not.toBeNull();
  const run = createdRule.latestRun;
  const claimTime = new Date("2026-07-21T12:00:00.000Z");
  const claims = await claimMailFilterRuns(1, {
    now: () => claimTime,
    leaseToken: () => "phase5-performance-lease",
  });
  expect(claims).toEqual([
    { id: run.id, leaseToken: "phase5-performance-lease" },
  ]);
  const claim = claims[0];
  for (let index = 0; index < WARMUPS; index += 1) {
    const result = await processClaimedMailFilterRunBatch(claim, {
      now: () => new Date(claimTime.getTime() + index + 1),
    });
    expect(result).toBe("RUNNING");
  }
  const batchDurations = [];
  for (let index = 0; index < SAMPLES; index += 1) {
    const startedAt = performance.now();
    const result = await processClaimedMailFilterRunBatch(claim, {
      now: () => new Date(claimTime.getTime() + WARMUPS + index + 1),
    });
    batchDurations.push(performance.now() - startedAt);
    expect(result).toBe("RUNNING");
    const progress = await db.mailFilterRun.findUniqueOrThrow({
      where: { id: run.id },
      select: { processedCount: true },
    });
    expect(progress.processedCount).toBe(
      (WARMUPS + index + 1) * MAIL_FILTER_RUN_BATCH_SIZE,
    );
  }

  const runRow = await db.mailFilterRun.findUniqueOrThrow({
    where: { id: run.id },
    select: {
      cutoffCreatedAt: true,
      cutoffId: true,
      processedCount: true,
      matchedCount: true,
      status: true,
    },
  });
  expect(runRow.processedCount).toBe(
    (WARMUPS + SAMPLES) * MAIL_FILTER_RUN_BATCH_SIZE,
  );
  expect(runRow.status).toBe("RUNNING");
  expect(runRow.cutoffCreatedAt).not.toBeNull();
  expect(runRow.cutoffId).not.toBeNull();

  const [listPlanResult, batchPlanResult, versionResult, tableCounts] =
    await Promise.all([
      explainListQuery(),
      explainBackfillQuery(runRow.cutoffCreatedAt, runRow.cutoffId),
      db.$queryRawUnsafe(`SELECT version() AS version`),
      db.$queryRawUnsafe(
        `
        SELECT
          (SELECT count(*)::int FROM "MailItem" WHERE "workspaceId" = $1)
            AS messages,
          (SELECT count(*)::int FROM "MailItemLabel" WHERE "workspaceId" = $1)
            AS assignments
      `,
        WORKSPACE_ID,
      ),
    ]);
  const listPlan = listPlanResult[0]["QUERY PLAN"][0];
  const batchPlan = batchPlanResult[0]["QUERY PLAN"][0];
  const evidence = {
    status: "MEASURED",
    measuredAt: new Date().toISOString(),
    runtime: {
      node: process.version,
      platform: `${process.platform}/${process.arch}`,
      postgres: versionResult[0].version,
    },
    fixture: {
      totalMessages: TOTAL_MESSAGES,
      eligibleInboxMessages: ELIGIBLE_MESSAGES,
      archiveMessages: ARCHIVE_MESSAGES,
      otherAccountMessages: DECOY_MESSAGES,
      assignments: tableCounts[0].assignments,
      equalTimestampGroupSize: 5,
    },
    list: {
      returnedRows: 50,
      warmups: WARMUPS,
      timing: timingSummary(listDurations),
      planExecutionMs: listPlan["Execution Time"],
      planNodes: summarizePlanNode(listPlan.Plan),
      rawExplain: listPlanResult,
    },
    backfill: {
      batchSize: MAIL_FILTER_RUN_BATCH_SIZE,
      warmups: WARMUPS,
      timing: timingSummary(batchDurations),
      measuredBatches: SAMPLES,
      processedAfterMeasurement: runRow.processedCount,
      matchedAfterMeasurement: runRow.matchedCount,
      planExecutionMs: batchPlan["Execution Time"],
      planNodes: summarizePlanNode(batchPlan.Plan),
      rawExplain: batchPlanResult,
    },
    indexAdjustments: [],
  };
  await writeEvidence("performance.json", evidence);
});
