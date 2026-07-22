import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Client } from "pg";
import {
  validateTestDatabaseGuard,
  validateTestDatabaseTarget,
} from "./test-db.mjs";
import { loadTestEnvironment } from "./test-env.mjs";
import REPOSITORY_ROOT from "./repository-root.cjs";

export const EVIDENCE_DIRECTORY = resolve(
  REPOSITORY_ROOT,
  "test-results",
  "mail-label-phase5",
);

const PROTECTED_TABLE_QUERIES = Object.freeze({
  MailAccount: `
    SELECT id, "workspaceId", kind::text AS kind, mode::text AS mode, name,
      email, "isActive", "syncStatus"::text AS "syncStatus", "syncError",
      "lastSyncAt", "nextSyncAt", "syncLeaseExpiresAt",
      "syncIntervalSeconds", "createdAt", "updatedAt"
    FROM "MailAccount"
    ORDER BY id
  `,
  MailFolder: `
    SELECT id, "workspaceId", "accountId", "accountWorkspaceId", path,
      name, delimiter, "specialUse"::text AS "specialUse", position,
      "uidValidity"::text AS "uidValidity",
      "lastSeenUid"::text AS "lastSeenUid", "lastSyncAt", "createdAt",
      "updatedAt"
    FROM "MailFolder"
    ORDER BY id
  `,
  MailItem: `
    SELECT id, "workspaceId", "accountId", "accountWorkspaceId", "folderId",
      "folderWorkspaceId", uid::text AS uid, "messageId", "fromAddress",
      "fromName", "toRecipients", "ccRecipients", "bccRecipients",
      "replyToAddress", subject, "bodyText", "bodyHtml", snippet, "isRead",
      "isAnswered", "isFlagged", "hasAttachments", "receivedAt", "createdAt"
    FROM "MailItem"
    ORDER BY id
  `,
  MailAttachment: `
    SELECT id, "mailItemId", "partId", filename, "contentType", "sizeBytes",
      "contentId", "isInline", encode(content, 'base64') AS content,
      "fetchedAt", "createdAt"
    FROM "MailAttachment"
    ORDER BY id
  `,
  MailLabel: `
    SELECT id, "workspaceId", name, "normalizedName", color::text AS color,
      position, "createdAt", "updatedAt"
    FROM "MailLabel"
    ORDER BY id
  `,
  MailItemLabel: `
    SELECT "workspaceId", "mailItemId", "mailItemWorkspaceId", "labelId",
      "labelWorkspaceId", "appliedAt"
    FROM "MailItemLabel"
    ORDER BY "mailItemId", "labelId"
  `,
  MailFilterRule: `
    SELECT id, "workspaceId", "accountId", "accountWorkspaceId", "labelId",
      "labelWorkspaceId", name, "fromAddress", "subjectContains", "isActive",
      position, "createdAt", "updatedAt"
    FROM "MailFilterRule"
    ORDER BY id
  `,
});

const MIGRATION_QUERY = `
  SELECT migration_name, checksum, finished_at, rolled_back_at,
    applied_steps_count
  FROM _prisma_migrations
  ORDER BY started_at, migration_name
`;

const RUN_TABLE_QUERY = `
  SELECT id, "workspaceId", "ruleId", "ruleWorkspaceId", "sourceRuleId",
    "snapshotAccountId", "snapshotLabelId", "snapshotFromAddress",
    "snapshotSubjectContains", status::text AS status, "cutoffCreatedAt",
    "cutoffId", "cursorCreatedAt", "cursorId", "processedCount",
    "matchedCount", attempts, "lastError", "leaseToken", "leaseExpiresAt",
    "startedAt", "completedAt", "createdAt", "updatedAt"
  FROM "MailFilterRun"
  ORDER BY id
`;

function normalizeForHash(value) {
  if (value === null || typeof value !== "object") return value;
  if (Buffer.isBuffer(value)) return { bytesBase64: value.toString("base64") };
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(normalizeForHash);
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, normalizeForHash(value[key])]),
  );
}

function rowsHash(rows) {
  return createHash("sha256")
    .update(JSON.stringify(normalizeForHash(rows)))
    .digest("hex");
}

export function guardedTestEnvironment(baseEnvironment = process.env) {
  const environment = loadTestEnvironment({ baseEnvironment });
  const target = validateTestDatabaseGuard(environment);
  return { environment, target };
}

export function restoreDatabaseUrl(sourceUrl) {
  const source = new URL(sourceUrl);
  source.pathname = "/inspoter_e2e_restore_test";
  return source.toString();
}

export function validateRestoreTarget(sourceUrl, restoreUrl) {
  const source = validateTestDatabaseTarget({ DATABASE_URL: sourceUrl });
  const candidate = new URL(restoreUrl);
  if (
    !["localhost", "127.0.0.1"].includes(candidate.hostname) ||
    candidate.port !== "3833" ||
    decodeURIComponent(candidate.pathname.slice(1)) !==
      "inspoter_e2e_restore_test" ||
    candidate.username !== new URL(sourceUrl).username
  ) {
    throw new Error("Restore target is not the dedicated disposable database.");
  }
  return { source, restoreDatabase: "inspoter_e2e_restore_test" };
}

async function tableExists(client, tableName) {
  const result = await client.query(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = $1
     ) AS present`,
    [tableName],
  );
  return result.rows[0]?.present === true;
}

export async function captureDatabaseSnapshot(connectionString) {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    const identity = await client.query(
      `SELECT current_database() AS database, version() AS version`,
    );
    const tables = {};
    for (const [table, query] of Object.entries(PROTECTED_TABLE_QUERIES)) {
      if (!(await tableExists(client, table))) continue;
      const result = await client.query(query);
      tables[table] = {
        count: result.rowCount ?? result.rows.length,
        sha256: rowsHash(result.rows),
      };
    }
    if (await tableExists(client, "MailFilterRun")) {
      const result = await client.query(RUN_TABLE_QUERY);
      tables.MailFilterRun = {
        count: result.rowCount ?? result.rows.length,
        sha256: rowsHash(result.rows),
      };
    }

    const migrations = await client.query(MIGRATION_QUERY);
    return {
      capturedAt: new Date().toISOString(),
      database: identity.rows[0]?.database,
      postgresVersion: identity.rows[0]?.version,
      tables,
      migrations: migrations.rows.map(normalizeForHash),
      migrationsSha256: rowsHash(migrations.rows),
    };
  } finally {
    await client.end();
  }
}

export function compareProtectedSnapshots(before, after) {
  const differences = [];
  for (const table of Object.keys(PROTECTED_TABLE_QUERIES)) {
    const left = before.tables?.[table];
    const right = after.tables?.[table];
    if (!left || !right) {
      differences.push(`${table}: missing from one snapshot`);
      continue;
    }
    if (left.count !== right.count || left.sha256 !== right.sha256) {
      differences.push(
        `${table}: ${left.count}/${left.sha256} -> ${right.count}/${right.sha256}`,
      );
    }
  }
  return differences;
}

export function compareAllSnapshotTables(before, after) {
  const differences = [];
  const tables = new Set([
    ...Object.keys(before.tables ?? {}),
    ...Object.keys(after.tables ?? {}),
  ]);
  for (const table of [...tables].sort()) {
    const left = before.tables?.[table];
    const right = after.tables?.[table];
    if (!left || !right) {
      differences.push(`${table}: missing from one snapshot`);
      continue;
    }
    if (left.count !== right.count || left.sha256 !== right.sha256) {
      differences.push(
        `${table}: ${left.count}/${left.sha256} -> ${right.count}/${right.sha256}`,
      );
    }
  }
  if (before.migrationsSha256 !== after.migrationsSha256) {
    differences.push(
      `_prisma_migrations: ${before.migrationsSha256} -> ${after.migrationsSha256}`,
    );
  }
  return differences;
}

export async function writeEvidence(name, value) {
  await mkdir(EVIDENCE_DIRECTORY, { recursive: true });
  const path = resolve(EVIDENCE_DIRECTORY, name);
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  return path;
}

export async function seedPopulatedPhase4Fixture(connectionString) {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    const workspace = await client.query(
      `SELECT id FROM "Workspace" ORDER BY "createdAt", id LIMIT 1`,
    );
    const workspaceId = workspace.rows[0]?.id;
    if (!workspaceId) {
      throw new Error("Base seed did not create a workspace.");
    }

    const ids = {
      workspaceId,
      accountId: "phase5-migration-account",
      inboxId: "phase5-migration-inbox",
      archiveId: "phase5-migration-archive",
      messageId: "phase5-migration-message",
      attachmentId: "phase5-migration-attachment",
      labelId: "phase5-migration-label",
      ruleId: "phase5-migration-rule",
      inactiveRuleId: "phase5-migration-rule-inactive",
    };

    await client.query("BEGIN");
    await client.query(
      `INSERT INTO "MailAccount" (
        id, "workspaceId", kind, mode, name, email, "syncStatus", "createdAt",
        "updatedAt"
      ) VALUES ($1, $2, 'IMAP', 'MOCK', 'Phase 5 migration account',
        'phase5@example.test', 'IDLE', $3, $3)`,
      [ids.accountId, workspaceId, new Date("2026-07-20T10:00:00.000Z")],
    );
    await client.query(
      `INSERT INTO "MailFolder" (
        id, "workspaceId", "accountId", "accountWorkspaceId", path, name,
        "specialUse", position, "createdAt", "updatedAt"
      ) VALUES
        ($1, $3, $4, $3, 'INBOX', 'Inbox', 'INBOX', 0, $5, $5),
        ($2, $3, $4, $3, 'Archive', 'Archive', 'ARCHIVE', 1, $5, $5)`,
      [
        ids.inboxId,
        ids.archiveId,
        workspaceId,
        ids.accountId,
        new Date("2026-07-20T10:00:00.000Z"),
      ],
    );
    await client.query(
      `INSERT INTO "MailItem" (
        id, "workspaceId", "accountId", "accountWorkspaceId", "folderId",
        "folderWorkspaceId", "messageId", "fromAddress", subject, "bodyText",
        "bodyHtml", snippet, "isRead", "isAnswered", "isFlagged",
        "hasAttachments", "receivedAt", "createdAt"
      ) VALUES ($1, $2, $3, $2, $4, $2, $5, $6, $7, $8, $9, $10,
        true, true, true, true, $11, $11)`,
      [
        ids.messageId,
        workspaceId,
        ids.accountId,
        ids.inboxId,
        "<phase5-migration@example.test>",
        "alerts@example.test",
        "Phase 5 migration sentinel",
        "BODY_PHASE5_MIGRATION_SENTINEL",
        "<p>HTML_PHASE5_MIGRATION_SENTINEL</p>",
        "Phase 5 migration sentinel",
        new Date("2026-07-20T10:01:00.000Z"),
      ],
    );
    await client.query(
      `INSERT INTO "MailAttachment" (
        id, "mailItemId", "partId", filename, "contentType", "sizeBytes",
        "isInline", content, "fetchedAt", "createdAt"
      ) VALUES ($1, $2, '1', 'sentinel.txt', 'text/plain', 25, false, $3, $4, $4)`,
      [
        ids.attachmentId,
        ids.messageId,
        Buffer.from("ATTACHMENT_PHASE5_SENTINEL"),
        new Date("2026-07-20T10:02:00.000Z"),
      ],
    );
    await client.query(
      `INSERT INTO "MailLabel" (
        id, "workspaceId", name, "normalizedName", color, position,
        "createdAt", "updatedAt"
      ) VALUES ($1, $2, 'Migration label', 'migration label', 'BLUE', 0, $3, $3)`,
      [ids.labelId, workspaceId, new Date("2026-07-20T10:03:00.000Z")],
    );
    await client.query(
      `INSERT INTO "MailItemLabel" (
        "workspaceId", "mailItemId", "mailItemWorkspaceId", "labelId",
        "labelWorkspaceId", "appliedAt"
      ) VALUES ($1, $2, $1, $3, $1, $4)`,
      [
        workspaceId,
        ids.messageId,
        ids.labelId,
        new Date("2026-07-20T10:04:00.000Z"),
      ],
    );
    await client.query(
      `INSERT INTO "MailFilterRule" (
        id, "workspaceId", "accountId", "accountWorkspaceId", "labelId",
        "labelWorkspaceId", name, "fromAddress", "subjectContains", "isActive",
        position, "createdAt", "updatedAt"
      ) VALUES
        ($1, $3, $4, $3, $5, $3, 'Active migration rule',
          'alerts@example.test', 'sentinel', true, 0, $6, $6),
        ($2, $3, $4, $3, $5, $3, 'Inactive migration rule',
          NULL, 'archived', false, 1, $6, $6)`,
      [
        ids.ruleId,
        ids.inactiveRuleId,
        workspaceId,
        ids.accountId,
        ids.labelId,
        new Date("2026-07-20T10:05:00.000Z"),
      ],
    );
    await client.query("COMMIT");
    return ids;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    await client.end();
  }
}

export async function verifyPhase5DatabaseContract(connectionString) {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    if (!(await tableExists(client, "MailFilterRun"))) {
      throw new Error("MailFilterRun table is missing.");
    }
    const indexes = await client.query(
      `SELECT indexname, indexdef FROM pg_indexes
       WHERE schemaname = 'public' AND tablename IN ('MailFilterRun', 'MailItem')
       ORDER BY tablename, indexname`,
    );
    const partial = indexes.rows.find(
      (row) =>
        row.indexdef.includes("CREATE UNIQUE INDEX") &&
        row.indexdef.includes("MailFilterRun") &&
        row.indexdef.includes("WHERE") &&
        row.indexdef.includes("PENDING") &&
        row.indexdef.includes("RUNNING"),
    );
    if (!partial) {
      throw new Error("One-active-run partial unique index is missing.");
    }
    const traversalIndex = indexes.rows.find(
      (row) =>
        row.indexdef.includes("MailItem") &&
        row.indexdef.includes('"workspaceId"') &&
        row.indexdef.includes('"accountId"') &&
        row.indexdef.includes('"createdAt"') &&
        row.indexdef.includes("id"),
    );
    if (!traversalIndex) {
      throw new Error("MailItem backfill traversal index is missing.");
    }

    const constraints = await client.query(
      `SELECT conname, pg_get_constraintdef(oid) AS definition
       FROM pg_constraint
       WHERE conrelid = '"MailFilterRun"'::regclass
       ORDER BY conname`,
    );
    const definitions = constraints.rows
      .map((row) => row.definition)
      .join("\n");
    if (
      !definitions.includes("FOREIGN KEY") ||
      !definitions.includes("CHECK")
    ) {
      throw new Error(
        "MailFilterRun workspace/state constraints are incomplete.",
      );
    }

    const rule = await client.query(
      `SELECT id, "workspaceId", "accountId", "labelId", "fromAddress",
        "subjectContains"
       FROM "MailFilterRule"
       ORDER BY "createdAt", id
       LIMIT 1`,
    );
    if (!rule.rows[0]) {
      throw new Error(
        "Populated migration verification requires one filter rule.",
      );
    }
    const candidate = rule.rows[0];
    const now = new Date("2026-07-20T11:00:00.000Z");
    await client.query("BEGIN");
    try {
      const insert = `INSERT INTO "MailFilterRun" (
        id, "workspaceId", "ruleId", "ruleWorkspaceId", "sourceRuleId",
        "snapshotAccountId", "snapshotLabelId", "snapshotFromAddress",
        "snapshotSubjectContains", status, "createdAt", "updatedAt"
      ) VALUES ($1, $2, $3, $2, $3, $4, $5, $6, $7, $8, $9, $9)`;
      const values = [
        "phase5-contract-run-1",
        candidate.workspaceId,
        candidate.id,
        candidate.accountId,
        candidate.labelId,
        candidate.fromAddress,
        candidate.subjectContains,
        "PENDING",
        now,
      ];
      await client.query(insert, values);
      let duplicateRejected = false;
      await client.query("SAVEPOINT duplicate_active_run");
      try {
        await client.query(insert, [
          "phase5-contract-run-2",
          ...values.slice(1),
        ]);
      } catch (error) {
        if (error?.code !== "23505") throw error;
        duplicateRejected = true;
        await client.query("ROLLBACK TO SAVEPOINT duplicate_active_run");
      }
      if (!duplicateRejected) {
        throw new Error("Second active run for one rule was not rejected.");
      }
      let halfNullRuleRejected = false;
      await client.query("SAVEPOINT half_null_rule_reference");
      try {
        await client.query(
          `INSERT INTO "MailFilterRun" (
            id, "workspaceId", "ruleId", "ruleWorkspaceId", "sourceRuleId",
            "snapshotAccountId", "snapshotLabelId", "snapshotFromAddress",
            status, "createdAt", "updatedAt"
          ) VALUES ($1, $2, $3, NULL, $4, $5, $6, $7, 'PENDING', $8, $8)`,
          [
            "phase5-contract-run-half-null",
            candidate.workspaceId,
            candidate.id,
            `${candidate.id}-half-null`,
            candidate.accountId,
            candidate.labelId,
            candidate.fromAddress ?? "half-null@example.test",
            now,
          ],
        );
      } catch (error) {
        if (error?.code !== "23514") throw error;
        halfNullRuleRejected = true;
        await client.query("ROLLBACK TO SAVEPOINT half_null_rule_reference");
      }
      if (!halfNullRuleRejected) {
        throw new Error("Half-null rule reference was not rejected.");
      }
      await client.query(
        `UPDATE "MailFilterRun" SET status = 'COMPLETED', "completedAt" = $2,
          "updatedAt" = $2 WHERE id = $1`,
        ["phase5-contract-run-1", now],
      );
      await client.query(insert, ["phase5-contract-run-3", ...values.slice(1)]);
    } finally {
      await client.query("ROLLBACK");
    }

    return {
      partialUniqueIndex: partial,
      traversalIndex,
      constraints: constraints.rows,
      functionalPartialUniqueCheck: "passed",
      functionalHalfNullRuleCheck: "passed",
    };
  } finally {
    await client.end();
  }
}
