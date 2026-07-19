import {
  createHash,
  createPublicKey,
  verify as verifySignature,
} from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { Client } from "pg";

export const SENTINEL_NAME = "__q13_repair_uncategorized__";
export const SENTINEL_ID_PREFIX = "q13-repair-uncategorized:";
const ENVELOPE_KEYS = ["plan", "signature", "sourceDigest", "version"];
const SIGNATURE_KEYS = ["algorithm", "value"];

export class Q13RepairError extends Error {
  constructor(message) {
    super(message);
    this.name = "Q13RepairError";
  }
}

export function canonicalize(value) {
  if (value === null || typeof value === "boolean" || typeof value === "string")
    return JSON.stringify(value);
  if (typeof value === "number" && Number.isFinite(value))
    return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`)
      .join(",")}}`;
  }
  throw new Q13RepairError("Canonical JSON contains an unsupported value.");
}

export function sourceDigest(snapshot) {
  return `sha256:${createHash("sha256").update(canonicalize(snapshot), "utf8").digest("hex")}`;
}

export function signedPayload(envelope) {
  return canonicalize({
    version: envelope.version,
    sourceDigest: envelope.sourceDigest,
    plan: envelope.plan,
  });
}

export function validateEnvelope(envelope, { allowUnsigned = false } = {}) {
  assertPlainObject(envelope, "manifest");
  assertExactKeys(envelope, ENVELOPE_KEYS, "manifest");
  if (envelope.version !== 1) fail("manifest.version must equal 1.");
  if (!/^sha256:[a-f0-9]{64}$/.test(envelope.sourceDigest))
    fail("manifest.sourceDigest is invalid.");
  assertPlainObject(envelope.plan, "manifest.plan");
  assertExactKeys(envelope.plan, PLAN_KEYS, "manifest.plan");
  assertArray(envelope.plan.memberships, "manifest.plan.memberships");
  assertArray(envelope.plan.sessions, "manifest.plan.sessions");
  assertArray(
    envelope.plan.nullCategoryAlerts,
    "manifest.plan.nullCategoryAlerts",
  );
  assertArray(envelope.plan.orphans, "manifest.plan.orphans");
  assertArray(
    envelope.plan.duplicateAlertCategories,
    "manifest.plan.duplicateAlertCategories",
  );
  assertPlainObject(envelope.plan.roots, "manifest.plan.roots");
  assertExactKeys(envelope.plan.roots, ROOT_MODELS, "manifest.plan.roots");
  for (const model of ROOT_MODELS) {
    assertArray(envelope.plan.roots[model], `manifest.plan.roots.${model}`);
  }
  assertPlainObject(envelope.signature, "manifest.signature");
  assertExactKeys(envelope.signature, SIGNATURE_KEYS, "manifest.signature");
  if (envelope.signature.algorithm !== "Ed25519")
    fail("signature.algorithm must equal Ed25519.");
  if (envelope.signature.value === "") {
    if (!allowUnsigned) fail("signature.value must be canonical base64.");
  } else if (!isCanonicalBase64(envelope.signature.value)) {
    fail("signature.value must be canonical base64.");
  }
  return envelope;
}

export function verifyManifestSignature(envelope, publicKeyPem) {
  validateEnvelope(envelope);
  let publicKey;
  try {
    publicKey = createPublicKey(publicKeyPem);
  } catch {
    fail("Q13_REPAIR_PUBLIC_KEY is not a valid public key.");
  }
  if (publicKey.asymmetricKeyType !== "ed25519")
    fail("Q13_REPAIR_PUBLIC_KEY must be Ed25519.");
  const valid = verifySignature(
    null,
    Buffer.from(signedPayload(envelope), "utf8"),
    publicKey,
    Buffer.from(envelope.signature.value, "base64"),
  );
  if (!valid) fail("manifest signature verification failed.");
}

export function assertMaintenanceMode(environment) {
  if (environment.Q13_MAINTENANCE_MODE !== "1")
    fail("Q13_MAINTENANCE_MODE must equal 1 for apply.");
}

function fail(message) {
  throw new Q13RepairError(message);
}
function assertPlainObject(value, label) {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    fail(`${label} must be an object.`);
}
function assertExactKeys(value, keys, label) {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  )
    fail(`${label} has unknown or missing keys.`);
}
function isCanonicalBase64(value) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
      value,
    )
  )
    return false;
  return Buffer.from(value, "base64").toString("base64") === value;
}

export function parseCliArgs(argv, environment = {}) {
  const allowedByCommand = {
    inspect: new Set(["database-url", "out"]),
    canonicalize: new Set(["manifest"]),
    preflight: new Set(["database-url", "manifest", "public-key"]),
    apply: new Set(["database-url", "manifest", "public-key"]),
  };
  if (!Array.isArray(argv) || !Object.hasOwn(allowedByCommand, argv[0])) {
    fail("Unknown Q13 repair command.");
  }

  const command = argv[0];
  const allowed = allowedByCommand[command];
  const values = {};
  for (let index = 1; index < argv.length; index += 2) {
    const token = argv[index];
    if (typeof token !== "string" || !token.startsWith("--")) {
      fail("Unexpected positional Q13 repair argument.");
    }
    const flag = token.slice(2);
    if (!allowed.has(flag)) {
      fail(`Flag --${flag || "<empty>"} is not allowed for ${command}.`);
    }
    if (Object.hasOwn(values, flag)) {
      fail(`Flag --${flag} must not be repeated.`);
    }
    const value = argv[index + 1];
    if (
      typeof value !== "string" ||
      value.length === 0 ||
      value.startsWith("--")
    ) {
      fail(`Flag --${flag} requires a value.`);
    }
    values[flag] = value;
  }

  const parsed = { command };
  if (allowed.has("database-url")) {
    const databaseUrl = values["database-url"] ?? environment.DATABASE_URL;
    if (!databaseUrl) fail("--database-url or DATABASE_URL is required.");
    parsed.databaseUrl = databaseUrl;
  }
  if (allowed.has("manifest")) {
    if (!values.manifest) fail("--manifest is required.");
    parsed.manifestPath = values.manifest;
  }
  if (allowed.has("out")) {
    if (!values.out) fail("--out is required.");
    parsed.outPath = values.out;
  }
  if (allowed.has("public-key")) {
    if (!values["public-key"] && !environment.Q13_REPAIR_PUBLIC_KEY) {
      fail("--public-key or Q13_REPAIR_PUBLIC_KEY is required.");
    }
    parsed.publicKeyPath =
      values["public-key"] ?? environment.Q13_REPAIR_PUBLIC_KEY;
  }
  return Object.freeze(parsed);
}

export async function main(
  argv = process.argv.slice(2),
  environment = process.env,
) {
  const options = parseCliArgs(argv, environment);
  if (options.command === "canonicalize") {
    const manifest = validateEnvelope(
      JSON.parse(await readFile(options.manifestPath, "utf8")),
      { allowUnsigned: true },
    );
    process.stdout.write(`${signedPayload(manifest)}\n`);
    return;
  }

  if (options.command === "apply") assertMaintenanceMode(environment);
  const client = new Client({ connectionString: options.databaseUrl });
  await client.connect();
  try {
    if (options.command === "inspect") {
      const snapshot = await inspectDatabase(client);
      await writeFile(
        options.outPath,
        `${JSON.stringify(createPlanSkeleton(snapshot), null, 2)}\n`,
        { encoding: "utf8", flag: "wx" },
      );
      process.stdout.write("Q13 repair inspect PASS.\n");
      return;
    }

    const manifest = validateEnvelope(
      JSON.parse(await readFile(options.manifestPath, "utf8")),
    );
    const publicKeyPem = await readFile(options.publicKeyPath, "utf8");
    verifyManifestSignature(manifest, publicKeyPem);
    const snapshot = await inspectDatabase(client);
    preflight(snapshot, manifest);
    if (options.command === "preflight") {
      process.stdout.write("Q13 repair preflight PASS.\n");
      return;
    }

    await applyRepair(client, manifest, publicKeyPem);
    process.stdout.write("Q13 repair apply PASS.\n");
  } finally {
    await client.end();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    console.error(
      `[q13-repair] ${error instanceof Q13RepairError ? error.message : "operation failed."}`,
    );
    process.exitCode = 1;
  });
}

// Deterministic inspection, zero-guess preflight, and locked apply follow.

const ROOT_MODELS = [
  "Category",
  "MessageCategory",
  "MailItem",
  "LogEntry",
  "AlertCategory",
  "WebhookToken",
];

const PLAN_KEYS = [
  "duplicateAlertCategories",
  "memberships",
  "nullCategoryAlerts",
  "orphans",
  "roots",
  "sessions",
];

export function normalizeSnapshot(snapshot) {
  assertPlainObject(snapshot, "snapshot");
  assertExactKeys(
    snapshot,
    [
      "alertCategories",
      "children",
      "memberships",
      "operators",
      "roots",
      "sessions",
      "workspaces",
    ],
    "snapshot",
  );
  return sortJson(snapshot);
}

export function snapshotDigest(snapshot) {
  return sourceDigest(normalizeSnapshot(snapshot));
}

async function readSnapshot(client) {
  const queries = [
    ["operators", 'SELECT "id" FROM "Operator"'],
    ["workspaces", 'SELECT "id" FROM "Workspace"'],
    [
      "memberships",
      'SELECT "id", "operatorId", "role", "workspaceId" FROM "WorkspaceMember"',
    ],
    [
      "sessions",
      'SELECT "id", "operatorId", "activeWorkspaceId" FROM "Session"',
    ],
    ["categories", 'SELECT "id", "workspaceId" FROM "Category"'],
    ["messageCategories", 'SELECT "id", "workspaceId" FROM "MessageCategory"'],
    ["mailItems", 'SELECT "id", "workspaceId" FROM "MailItem"'],
    ["logEntries", 'SELECT "id", "workspaceId" FROM "LogEntry"'],
    [
      "alertCategories",
      'SELECT "id", "name", "workspaceId" FROM "AlertCategory"',
    ],
    ["webhookTokens", 'SELECT "id", "workspaceId" FROM "WebhookToken"'],
    ["alerts", 'SELECT "id", "alertCategoryId" FROM "Alert"'],
    ["bookmarks", 'SELECT "id", "categoryId" FROM "Bookmark"'],
    ["channels", 'SELECT "id", "messageCategoryId" FROM "Channel"'],
    ["messages", 'SELECT "id", "channelId" FROM "Message"'],
    ["idempotencyKeys", 'SELECT "id", "tokenId" FROM "IdempotencyKey"'],
  ];
  const rows = {};
  for (const [name, sql] of queries)
    rows[name] = (await client.query(sql)).rows;
  return normalizeSnapshot({
    operators: rows.operators,
    workspaces: rows.workspaces,
    memberships: rows.memberships,
    sessions: rows.sessions,
    roots: {
      Category: rows.categories,
      MessageCategory: rows.messageCategories,
      MailItem: rows.mailItems,
      LogEntry: rows.logEntries,
      AlertCategory: rows.alertCategories.map(({ id, workspaceId }) => ({
        id,
        workspaceId,
      })),
      WebhookToken: rows.webhookTokens,
    },
    alertCategories: rows.alertCategories,
    children: {
      Alert: rows.alerts,
      Bookmark: rows.bookmarks,
      Channel: rows.channels,
      Message: rows.messages,
      IdempotencyKey: rows.idempotencyKeys,
    },
  });
}

export async function inspectDatabase(client) {
  let transactionStarted = false;
  try {
    await client.query(
      "BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY",
    );
    transactionStarted = true;
    const snapshot = await readSnapshot(client);
    await client.query("COMMIT");
    return snapshot;
  } catch (error) {
    if (transactionStarted) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // Preserve the inspection error; the caller closes this connection.
      }
    }
    throw error;
  }
}

export function createPlanSkeleton(snapshot) {
  const normalized = normalizeSnapshot(snapshot);
  validateSnapshotShape(normalized);
  const plan = {
    memberships: normalized.memberships.map((row) => ({ ...row })),
    roots: Object.fromEntries(
      ROOT_MODELS.map((model) => [
        model,
        normalized.roots[model].map((row) => ({ ...row })),
      ]),
    ),
    sessions: normalized.sessions.map(({ id, activeWorkspaceId }) => ({
      id,
      activeWorkspaceId,
    })),
    nullCategoryAlerts: normalized.children.Alert.filter(
      ({ alertCategoryId }) => alertCategoryId === null,
    ).map(({ id }) => ({ id, workspaceId: null })),
    orphans: findSupportedOrphans(normalized)
      .map(({ model, id, missingParentId }) => ({
        action: null,
        id,
        missingParentId,
        model,
      }))
      .sort(compareCanonicalRows),
    duplicateAlertCategories: findDuplicateAlertCategoryGroups(normalized)
      .map(({ categoryIds, name, workspaceId }) => ({
        action: null,
        categoryIds,
        name,
        workspaceId,
      }))
      .sort(compareCanonicalRows),
  };
  return {
    version: 1,
    sourceDigest: snapshotDigest(normalized),
    plan,
    signature: { algorithm: "Ed25519", value: "" },
  };
}

export async function applyRepair(client, envelope, publicKeyPem) {
  verifyManifestSignature(envelope, publicKeyPem);
  let transactionStarted = false;
  try {
    await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
    transactionStarted = true;
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
      ["inspoter:q13-repair:v1"],
    );
    const snapshot = await readSnapshot(client);
    preflight(snapshot, envelope);

    const joinedAtRows = await client.query(
      'SELECT "id", "joinedAt" FROM "WorkspaceMember"',
    );
    const joinedAtById = new Map(
      joinedAtRows.rows.map((row) => [row.id, row.joinedAt]),
    );
    const deletedMemberships = await client.query(
      'DELETE FROM "WorkspaceMember"',
    );
    if (deletedMemberships.rowCount !== envelope.plan.memberships.length) {
      fail("membership delete row count changed during repair.");
    }
    for (const membership of envelope.plan.memberships) {
      const joinedAt = joinedAtById.get(membership.id);
      if (joinedAt === undefined) {
        fail(`membership ${membership.id} has no preserved joinedAt value.`);
      }
      const result = await client.query(
        `INSERT INTO "WorkspaceMember"
          ("id", "workspaceId", "operatorId", "role", "joinedAt")
         VALUES ($1, $2, $3, $4, $5)`,
        [
          membership.id,
          membership.workspaceId,
          membership.operatorId,
          membership.role,
          joinedAt,
        ],
      );
      if (result.rowCount !== 1)
        fail(`membership ${membership.id} was not inserted.`);
    }

    for (const model of ROOT_MODELS) {
      for (const root of envelope.plan.roots[model]) {
        const result = await client.query(
          `UPDATE "${model}" SET "workspaceId" = $1 WHERE "id" = $2`,
          [root.workspaceId, root.id],
        );
        if (result.rowCount !== 1) fail(`${model} ${root.id} was not updated.`);
      }
    }
    for (const session of envelope.plan.sessions) {
      const result = await client.query(
        'UPDATE "Session" SET "activeWorkspaceId" = $1 WHERE "id" = $2',
        [session.activeWorkspaceId, session.id],
      );
      if (result.rowCount !== 1) fail(`Session ${session.id} was not updated.`);
    }

    const sentinelWorkspaces = [
      ...new Set(
        envelope.plan.nullCategoryAlerts.map((row) => row.workspaceId),
      ),
    ].sort();
    for (const workspaceId of sentinelWorkspaces) {
      const result = await client.query(
        `INSERT INTO "AlertCategory"
          ("id", "workspaceId", "name", "updatedAt")
         VALUES ($1, $2, $3, CURRENT_TIMESTAMP)`,
        [`${SENTINEL_ID_PREFIX}${workspaceId}`, workspaceId, SENTINEL_NAME],
      );
      if (result.rowCount !== 1)
        fail(`Alert sentinel for ${workspaceId} was not inserted.`);
    }
    for (const alert of envelope.plan.nullCategoryAlerts) {
      const result = await client.query(
        'UPDATE "Alert" SET "alertCategoryId" = $1 WHERE "id" = $2',
        [`${SENTINEL_ID_PREFIX}${alert.workspaceId}`, alert.id],
      );
      if (result.rowCount !== 1) fail(`Alert ${alert.id} was not updated.`);
    }

    fail("R2b2 apply completion is required.");
  } catch (error) {
    if (transactionStarted) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // Preserve the original failure; the caller closes this connection.
      }
    }
    throw error;
  }
}

function compareCanonicalRows(left, right) {
  const leftCanonical = canonicalize(left);
  const rightCanonical = canonicalize(right);
  if (leftCanonical < rightCanonical) return -1;
  if (leftCanonical > rightCanonical) return 1;
  return 0;
}

function sortJson(value) {
  if (Array.isArray(value)) {
    return value.map(sortJson).sort(compareCanonicalRows);
  }
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, sortJson(value[key])]),
    );
  }
  return value;
}

function assertNonEmptyString(value, label) {
  if (typeof value !== "string" || value.length === 0) {
    fail(`${label} must be a non-empty string.`);
  }
}

function assertArray(value, label) {
  if (!Array.isArray(value)) fail(`${label} must be an array.`);
}

function assertRow(row, keys, label) {
  assertPlainObject(row, label);
  assertExactKeys(row, keys, label);
  assertNonEmptyString(row.id, `${label}.id`);
}

function idSet(rows) {
  return new Set(rows.map((row) => row.id));
}

function assertUniqueIds(rows, label) {
  const ids = new Set();
  for (const row of rows) {
    if (ids.has(row.id)) fail(`${label} contains duplicate id ${row.id}.`);
    ids.add(row.id);
  }
}

function validateSnapshotShape(snapshot) {
  normalizeSnapshot(snapshot);
  const simpleCollections = [
    ["operators", ["id"]],
    ["workspaces", ["id"]],
    ["memberships", ["id", "operatorId", "role", "workspaceId"]],
    ["sessions", ["activeWorkspaceId", "id", "operatorId"]],
    ["alertCategories", ["id", "name", "workspaceId"]],
  ];
  for (const [name, keys] of simpleCollections) {
    assertArray(snapshot[name], `snapshot.${name}`);
    for (const row of snapshot[name]) assertRow(row, keys, `snapshot.${name}`);
    assertUniqueIds(snapshot[name], `snapshot.${name}`);
  }

  assertPlainObject(snapshot.roots, "snapshot.roots");
  assertExactKeys(snapshot.roots, ROOT_MODELS, "snapshot.roots");
  for (const model of ROOT_MODELS) {
    assertArray(snapshot.roots[model], `snapshot.roots.${model}`);
    for (const row of snapshot.roots[model]) {
      assertRow(row, ["id", "workspaceId"], `snapshot.roots.${model}`);
    }
    assertUniqueIds(snapshot.roots[model], `snapshot.roots.${model}`);
  }

  const childFields = {
    Alert: "alertCategoryId",
    Bookmark: "categoryId",
    Channel: "messageCategoryId",
    IdempotencyKey: "tokenId",
    Message: "channelId",
  };
  assertPlainObject(snapshot.children, "snapshot.children");
  assertExactKeys(
    snapshot.children,
    Object.keys(childFields),
    "snapshot.children",
  );
  for (const [model, parentField] of Object.entries(childFields)) {
    assertArray(snapshot.children[model], `snapshot.children.${model}`);
    for (const row of snapshot.children[model]) {
      assertRow(row, ["id", parentField], `snapshot.children.${model}`);
      if (
        row[parentField] !== null &&
        (typeof row[parentField] !== "string" || row[parentField].length === 0)
      ) {
        fail(`snapshot.children.${model} has an invalid parent id.`);
      }
    }
    assertUniqueIds(snapshot.children[model], `snapshot.children.${model}`);
  }

  const categoryIds = idSet(snapshot.alertCategories);
  if (
    categoryIds.size !== snapshot.roots.AlertCategory.length ||
    snapshot.roots.AlertCategory.some((row) => !categoryIds.has(row.id))
  ) {
    fail("snapshot.alertCategories must exactly describe AlertCategory roots.");
  }
}

const ORPHAN_DEFINITIONS = {
  Alert: {
    parentCollection: "alertCategories",
    parentField: "alertCategoryId",
  },
  Bookmark: {
    parentCollection: ["roots", "Category"],
    parentField: "categoryId",
  },
  Channel: {
    parentCollection: ["roots", "MessageCategory"],
    parentField: "messageCategoryId",
  },
  IdempotencyKey: {
    parentCollection: ["roots", "WebhookToken"],
    parentField: "tokenId",
  },
  Message: {
    parentCollection: ["children", "Channel"],
    parentField: "channelId",
  },
};

function collectionAt(snapshot, path) {
  return Array.isArray(path) ? snapshot[path[0]][path[1]] : snapshot[path];
}

export function findSupportedOrphans(snapshot) {
  validateSnapshotShape(snapshot);
  const orphans = [];
  for (const [model, definition] of Object.entries(ORPHAN_DEFINITIONS)) {
    const parents = idSet(collectionAt(snapshot, definition.parentCollection));
    for (const row of snapshot.children[model]) {
      const parentId = row[definition.parentField];
      if (parentId !== null && !parents.has(parentId)) {
        orphans.push({ id: row.id, model, missingParentId: parentId });
      }
    }
  }
  return orphans.sort((left, right) =>
    `${left.model}\0${left.id}`.localeCompare(`${right.model}\0${right.id}`),
  );
}
function exactCoverage(items, expectedIds, label, keys) {
  assertArray(items, label);
  const expected = new Set(expectedIds);
  const seen = new Set();
  for (const item of items) {
    assertRow(item, keys, label);
    if (!expected.has(item.id) || seen.has(item.id)) {
      fail(`${label} must cover source ids exactly once with no extras.`);
    }
    seen.add(item.id);
  }
  if (seen.size !== expected.size) {
    fail(`${label} does not cover every source id.`);
  }
}

export function preflight(snapshot, envelope) {
  validateSnapshotShape(snapshot);
  validateEnvelope(envelope);
  if (snapshotDigest(snapshot) !== envelope.sourceDigest) {
    fail("source digest does not match the current repair snapshot.");
  }
  const plan = envelope.plan;
  assertExactKeys(plan, PLAN_KEYS, "manifest.plan");
  const memberships = validateMembershipPlan(snapshot, plan.memberships);
  const rootWorkspaces = validateRootPlan(snapshot, plan.roots);
  validateSessionPlan(snapshot, plan.sessions, memberships);
  validateNullAlertPlan(snapshot, plan.nullCategoryAlerts);
  validateSentinelCollisions(snapshot);
  const orphanActions = validateOrphanPlan(snapshot, plan.orphans);
  validateDuplicatePlan(
    snapshot,
    plan.duplicateAlertCategories,
    rootWorkspaces.AlertCategory,
    orphanActions,
  );
  return { memberships, orphanActions, rootWorkspaces };
}

function validateMembershipPlan(snapshot, items) {
  exactCoverage(
    items,
    snapshot.memberships.map((row) => row.id),
    "plan.memberships",
    ["id", "operatorId", "role", "workspaceId"],
  );
  const operators = idSet(snapshot.operators);
  const workspaces = idSet(snapshot.workspaces);
  const pairs = new Set();
  for (const item of items) {
    if (!operators.has(item.operatorId) || !workspaces.has(item.workspaceId)) {
      fail(
        `membership ${item.id} references an unknown operator or workspace.`,
      );
    }
    if (item.role !== "owner" && item.role !== "member") {
      fail("membership.role must be lowercase owner or member.");
    }
    const pair = `${item.workspaceId}\0${item.operatorId}`;
    if (pairs.has(pair))
      fail("membership workspace/operator pairs must be unique.");
    pairs.add(pair);
  }
  for (const operatorId of operators) {
    if (!items.some((item) => item.operatorId === operatorId)) {
      fail(`operator ${operatorId} must retain at least one membership.`);
    }
  }
  for (const workspaceId of workspaces) {
    if (!items.some((item) => item.workspaceId === workspaceId)) {
      fail(`workspace ${workspaceId} must retain at least one membership.`);
    }
    if (
      !items.some(
        (item) => item.workspaceId === workspaceId && item.role === "owner",
      )
    ) {
      fail(`workspace ${workspaceId} must retain at least one owner.`);
    }
  }
  return { pairs };
}

function validateRootPlan(snapshot, roots) {
  assertPlainObject(roots, "plan.roots");
  assertExactKeys(roots, ROOT_MODELS, "plan.roots");
  const workspaces = idSet(snapshot.workspaces);
  const result = {};
  for (const model of ROOT_MODELS) {
    exactCoverage(
      roots[model],
      snapshot.roots[model].map((row) => row.id),
      `plan.roots.${model}`,
      ["id", "workspaceId"],
    );
    result[model] = new Map();
    for (const item of roots[model]) {
      if (!workspaces.has(item.workspaceId)) {
        fail(`${model} ${item.id} references an unknown workspace.`);
      }
      result[model].set(item.id, item.workspaceId);
    }
  }
  return result;
}

function validateSessionPlan(snapshot, sessions, memberships) {
  exactCoverage(
    sessions,
    snapshot.sessions.map((row) => row.id),
    "plan.sessions",
    ["activeWorkspaceId", "id"],
  );
  const sourceById = new Map(snapshot.sessions.map((row) => [row.id, row]));
  for (const item of sessions) {
    if (
      item.activeWorkspaceId !== null &&
      (typeof item.activeWorkspaceId !== "string" ||
        item.activeWorkspaceId.length === 0)
    ) {
      fail(`session ${item.id} requires an explicit workspace id or null.`);
    }
    if (item.activeWorkspaceId === null) continue;
    const operatorId = sourceById.get(item.id).operatorId;
    if (!memberships.pairs.has(`${item.activeWorkspaceId}\0${operatorId}`)) {
      fail(
        `session ${item.id} active workspace is not an operator membership.`,
      );
    }
  }
}

function validateNullAlertPlan(snapshot, items) {
  const expected = snapshot.children.Alert.filter(
    (row) => row.alertCategoryId === null,
  ).map((row) => row.id);
  exactCoverage(items, expected, "plan.nullCategoryAlerts", [
    "id",
    "workspaceId",
  ]);
  const workspaces = idSet(snapshot.workspaces);
  for (const item of items) {
    if (!workspaces.has(item.workspaceId)) {
      fail(`null-category Alert ${item.id} requires an explicit workspace.`);
    }
  }
}

function validateSentinelCollisions(snapshot) {
  for (const row of snapshot.alertCategories) {
    if (row.name === SENTINEL_NAME || row.id.startsWith(SENTINEL_ID_PREFIX)) {
      fail(`reserved sentinel collision at AlertCategory ${row.id}.`);
    }
  }
}

function validateOrphanPlan(snapshot, dispositions) {
  assertArray(dispositions, "plan.orphans");
  const expected = findSupportedOrphans(snapshot);
  const expectedKeys = new Set(
    expected.map((item) => `${item.model}\0${item.id}`),
  );
  const seen = new Set();
  const actions = new Map();
  const attachParents = {
    Alert: idSet(snapshot.alertCategories),
    Bookmark: idSet(snapshot.roots.Category),
    Channel: idSet(snapshot.roots.MessageCategory),
    IdempotencyKey: idSet(snapshot.roots.WebhookToken),
    Message: idSet(snapshot.children.Channel),
  };
  for (const item of dispositions) {
    assertPlainObject(item, "orphan disposition");
    assertNonEmptyString(item.model, "orphan disposition.model");
    assertNonEmptyString(item.id, "orphan disposition.id");
    if (!Object.hasOwn(ORPHAN_DEFINITIONS, item.model)) {
      fail(`unsupported orphan model ${item.model}.`);
    }
    const key = `${item.model}\0${item.id}`;
    if (!expectedKeys.has(key) || seen.has(key)) {
      fail(
        "orphan dispositions must cover detected orphans exactly once with no extras.",
      );
    }
    seen.add(key);
    if (item.action === "attach") {
      assertExactKeys(
        item,
        ["action", "id", "model", "parentId"],
        "orphan attach disposition",
      );
      if (!attachParents[item.model].has(item.parentId)) {
        fail(`orphan ${item.model}/${item.id} attach parent is invalid.`);
      }
    } else if (item.action === "delete") {
      assertExactKeys(
        item,
        ["action", "dataLossAcknowledged", "id", "model"],
        "orphan delete disposition",
      );
      if (item.dataLossAcknowledged !== true) {
        fail("orphan delete requires dataLossAcknowledged:true.");
      }
    } else {
      fail("orphan disposition action must be attach or delete.");
    }
    actions.set(key, item);
  }
  if (seen.size !== expectedKeys.size) {
    fail("orphan dispositions do not cover every detected orphan.");
  }

  for (const item of actions.values()) {
    if (item.action !== "attach" || item.model !== "Message") continue;
    const parentAction = actions.get(`Channel\0${item.parentId}`);
    if (parentAction?.action === "delete") {
      fail("orphan Message cannot attach to a Channel scheduled for deletion.");
    }
  }
  return actions;
}

export function findDuplicateAlertCategoryGroups(
  snapshot,
  workspaceByCategory = new Map(
    snapshot.alertCategories.map((row) => [row.id, row.workspaceId]),
  ),
) {
  validateSnapshotShape(snapshot);
  const groups = new Map();
  for (const row of snapshot.alertCategories) {
    const workspaceId = workspaceByCategory.get(row.id);
    const key = `${workspaceId}\0${row.name}`;
    if (!groups.has(key)) {
      groups.set(key, { categoryIds: [], name: row.name, workspaceId });
    }
    groups.get(key).categoryIds.push(row.id);
  }
  return [...groups.values()]
    .filter((group) => group.categoryIds.length > 1)
    .map((group) => ({
      ...group,
      categoryIds: group.categoryIds.sort(),
    }))
    .sort((left, right) =>
      `${left.workspaceId}\0${left.name}`.localeCompare(
        `${right.workspaceId}\0${right.name}`,
      ),
    );
}

function assertExactStringSet(actual, expected, label) {
  assertArray(actual, label);
  if (actual.some((value) => typeof value !== "string")) {
    fail(`${label} must contain only strings.`);
  }
  const left = [...actual].sort();
  const right = [...expected].sort();
  if (canonicalize(left) !== canonicalize(right)) {
    fail(`${label} must match the detected group exactly.`);
  }
}

function validateDuplicatePlan(
  snapshot,
  dispositions,
  workspaceByCategory,
  orphanActions,
) {
  assertArray(dispositions, "plan.duplicateAlertCategories");
  const expected = findDuplicateAlertCategoryGroups(
    snapshot,
    workspaceByCategory,
  );
  const expectedByKey = new Map(
    expected.map((group) => [`${group.workspaceId}\0${group.name}`, group]),
  );
  const seen = new Set();
  const finalCategories = new Map(
    snapshot.alertCategories.map((row) => [
      row.id,
      {
        id: row.id,
        name: row.name,
        workspaceId: workspaceByCategory.get(row.id),
      },
    ]),
  );
  const removed = new Set();

  for (const item of dispositions) {
    assertPlainObject(item, "duplicate AlertCategory disposition");
    const key = `${item.workspaceId}\0${item.name}`;
    const group = expectedByKey.get(key);
    if (!group || seen.has(key)) {
      fail(
        "duplicate AlertCategory dispositions must cover groups exactly once with no extras.",
      );
    }
    seen.add(key);
    assertExactStringSet(
      item.categoryIds,
      group.categoryIds,
      "duplicate AlertCategory categoryIds",
    );

    if (item.action === "merge") {
      assertExactKeys(
        item,
        ["action", "categoryIds", "name", "targetCategoryId", "workspaceId"],
        "duplicate merge disposition",
      );
      if (!group.categoryIds.includes(item.targetCategoryId)) {
        fail("duplicate merge target must belong to its group.");
      }
      for (const id of group.categoryIds) {
        if (id !== item.targetCategoryId) {
          removed.add(id);
          finalCategories.delete(id);
        }
      }
    } else if (item.action === "rename") {
      assertExactKeys(
        item,
        ["action", "categoryIds", "name", "renames", "workspaceId"],
        "duplicate rename disposition",
      );
      exactCoverage(item.renames, group.categoryIds, "duplicate renames", [
        "id",
        "name",
      ]);
      for (const rename of item.renames) {
        assertNonEmptyString(rename.name, "duplicate rename name");
        if (rename.name === SENTINEL_NAME) {
          fail("duplicate rename cannot use the reserved sentinel name.");
        }
        finalCategories.get(rename.id).name = rename.name;
      }
    } else {
      fail("duplicate AlertCategory action must be merge or rename.");
    }
  }
  if (seen.size !== expectedByKey.size) {
    fail(
      "duplicate AlertCategory dispositions do not cover every detected group.",
    );
  }

  const finalKeys = new Set();
  for (const category of finalCategories.values()) {
    const key = `${category.workspaceId}\0${category.name}`;
    if (finalKeys.has(key)) {
      fail(
        "duplicate AlertCategory disposition does not produce unique final names.",
      );
    }
    finalKeys.add(key);
  }
  for (const disposition of orphanActions.values()) {
    if (
      disposition.model === "Alert" &&
      disposition.action === "attach" &&
      removed.has(disposition.parentId)
    ) {
      fail("orphan Alert cannot attach to an AlertCategory removed by merge.");
    }
  }
}
