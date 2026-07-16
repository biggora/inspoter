import { generateKeyPairSync, sign } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  SENTINEL_ID_PREFIX,
  SENTINEL_NAME,
  applyRepair,
  assertMaintenanceMode,
  canonicalize,
  createPlanSkeleton,
  findDuplicateAlertCategoryGroups,
  findSupportedOrphans,
  inspectDatabase,
  main,
  normalizeSnapshot,
  parseCliArgs,
  preflight,
  signedPayload,
  snapshotDigest,
  sourceDigest,
  validateEnvelope,
  verifyManifestSignature,
} from "../../scripts/q13-repair.mjs";

// External signed JSON is deliberately exercised without compile-time trust.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type JsonRecord = Record<string, any>;

const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const publicKeyPem = publicKey.export({ type: "spki", format: "pem" });

function validSnapshot(): JsonRecord {
  return {
    operators: [{ id: "operator-1" }],
    workspaces: [{ id: "workspace-1" }],
    memberships: [
      {
        id: "membership-1",
        operatorId: "operator-1",
        role: "owner",
        workspaceId: "workspace-1",
      },
    ],
    sessions: [
      {
        id: "session-active",
        operatorId: "operator-1",
        activeWorkspaceId: "workspace-1",
      },
      {
        id: "session-null",
        operatorId: "operator-1",
        activeWorkspaceId: null,
      },
    ],
    roots: {
      Category: [{ id: "category-1", workspaceId: "workspace-1" }],
      MessageCategory: [
        { id: "message-category-1", workspaceId: "workspace-1" },
      ],
      MailItem: [{ id: "mail-1", workspaceId: "workspace-1" }],
      LogEntry: [{ id: "log-1", workspaceId: "workspace-1" }],
      AlertCategory: [{ id: "alert-category-1", workspaceId: "workspace-1" }],
      WebhookToken: [{ id: "token-1", workspaceId: "workspace-1" }],
    },
    alertCategories: [
      {
        id: "alert-category-1",
        name: "General",
        workspaceId: "workspace-1",
      },
    ],
    children: {
      Alert: [
        { id: "alert-1", alertCategoryId: "alert-category-1" },
        { id: "alert-null", alertCategoryId: null },
      ],
      Bookmark: [{ id: "bookmark-1", categoryId: "category-1" }],
      Channel: [{ id: "channel-1", messageCategoryId: "message-category-1" }],
      IdempotencyKey: [{ id: "key-1", tokenId: "token-1" }],
      Message: [{ id: "message-1", channelId: "channel-1" }],
    },
  };
}

function validPlan(snapshot = validSnapshot()): JsonRecord {
  return {
    memberships: snapshot.memberships.map((row: JsonRecord) => ({ ...row })),
    roots: Object.fromEntries(
      Object.entries(snapshot.roots).map(([model, rows]) => [
        model,
        (rows as JsonRecord[]).map((row) => ({ ...row })),
      ]),
    ),
    sessions: snapshot.sessions.map(
      ({ id, activeWorkspaceId }: JsonRecord) => ({
        id,
        activeWorkspaceId,
      }),
    ),
    nullCategoryAlerts: [{ id: "alert-null", workspaceId: "workspace-1" }],
    orphans: [],
    duplicateAlertCategories: [],
  };
}

function signedEnvelope(
  snapshot = validSnapshot(),
  plan = validPlan(snapshot),
  signingKey = privateKey,
): JsonRecord {
  const envelope: JsonRecord = {
    version: 1,
    sourceDigest: snapshotDigest(snapshot),
    plan,
    signature: { algorithm: "Ed25519", value: "pending" },
  };
  envelope.signature.value = sign(
    null,
    Buffer.from(signedPayload(envelope)),
    signingKey,
  ).toString("base64");
  return envelope;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function mockInspectionClient(snapshot: JsonRecord, failTable?: string) {
  const queries: string[] = [];
  const rowsByTable: Record<string, JsonRecord[]> = {
    Operator: snapshot.operators,
    Workspace: snapshot.workspaces,
    WorkspaceMember: snapshot.memberships,
    Session: snapshot.sessions,
    Category: snapshot.roots.Category,
    MessageCategory: snapshot.roots.MessageCategory,
    MailItem: snapshot.roots.MailItem,
    LogEntry: snapshot.roots.LogEntry,
    AlertCategory: snapshot.alertCategories,
    WebhookToken: snapshot.roots.WebhookToken,
    Alert: snapshot.children.Alert,
    Bookmark: snapshot.children.Bookmark,
    Channel: snapshot.children.Channel,
    Message: snapshot.children.Message,
    IdempotencyKey: snapshot.children.IdempotencyKey,
  };
  return {
    queries,
    async query(sql: string) {
      queries.push(sql);
      const table = /FROM "([^"]+)"/u.exec(sql)?.[1];
      if (!table) return { rows: [] };
      if (table === failTable) throw new Error(`failed ${table}`);
      return { rows: clone(rowsByTable[table]) };
    },
  };
}

describe("Q13 read-only database inspection", () => {
  it("queries every historical table explicitly and returns one normalized snapshot", async () => {
    const source = validSnapshot();
    source.sessions.reverse();
    source.children.Alert.reverse();
    const client = mockInspectionClient(source);

    const result = await inspectDatabase(client);
    const selects = client.queries.filter((sql) => sql.startsWith("SELECT"));

    expect(client.queries[0]).toBe(
      "BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY",
    );
    expect(client.queries.at(-1)).toBe("COMMIT");
    expect(selects).toHaveLength(15);
    expect(selects.every((sql) => !sql.includes("*"))).toBe(true);
    expect(selects).toEqual([
      'SELECT "id" FROM "Operator"',
      'SELECT "id" FROM "Workspace"',
      'SELECT "id", "operatorId", "role", "workspaceId" FROM "WorkspaceMember"',
      'SELECT "id", "operatorId", "activeWorkspaceId" FROM "Session"',
      'SELECT "id", "workspaceId" FROM "Category"',
      'SELECT "id", "workspaceId" FROM "MessageCategory"',
      'SELECT "id", "workspaceId" FROM "MailItem"',
      'SELECT "id", "workspaceId" FROM "LogEntry"',
      'SELECT "id", "name", "workspaceId" FROM "AlertCategory"',
      'SELECT "id", "workspaceId" FROM "WebhookToken"',
      'SELECT "id", "alertCategoryId" FROM "Alert"',
      'SELECT "id", "categoryId" FROM "Bookmark"',
      'SELECT "id", "messageCategoryId" FROM "Channel"',
      'SELECT "id", "channelId" FROM "Message"',
      'SELECT "id", "tokenId" FROM "IdempotencyKey"',
    ]);
    expect(result).toEqual(normalizeSnapshot(source));
    expect(result.roots.AlertCategory).toEqual([
      { id: "alert-category-1", workspaceId: "workspace-1" },
    ]);
    expect(result.alertCategories[0]).toEqual({
      id: "alert-category-1",
      name: "General",
      workspaceId: "workspace-1",
    });
  });

  it("rolls back and rethrows a query failure", async () => {
    const client = mockInspectionClient(validSnapshot(), "Message");

    await expect(inspectDatabase(client)).rejects.toThrow("failed Message");
    expect(client.queries.at(-1)).toBe("ROLLBACK");
    expect(client.queries).not.toContain("COMMIT");
  });
});

function mockApplyClient(
  snapshot: JsonRecord,
  options: { failOn?: string; rollbackFails?: boolean } = {},
) {
  const inspection = mockInspectionClient(snapshot);
  const calls: Array<{ sql: string; parameters?: unknown[] }> = [];
  return {
    calls,
    async query(sql: string, parameters?: unknown[]) {
      calls.push({ sql, parameters });
      if (sql === "ROLLBACK" && options.rollbackFails) {
        throw new Error("rollback failure");
      }
      if (options.failOn && sql.includes(options.failOn)) {
        throw new Error("injected write failure");
      }
      if (sql === 'SELECT "id", "joinedAt" FROM "WorkspaceMember"') {
        return {
          rows: snapshot.memberships.map((row: JsonRecord) => ({
            id: row.id,
            joinedAt: `joined:${row.id}`,
          })),
          rowCount: snapshot.memberships.length,
        };
      }
      if (/^SELECT .+ FROM "/u.test(sql)) return inspection.query(sql);
      if (sql.startsWith('DELETE FROM "WorkspaceMember"')) {
        return { rows: [], rowCount: snapshot.memberships.length };
      }
      if (sql.startsWith("INSERT") || sql.startsWith("UPDATE")) {
        return { rows: [], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    },
  };
}

describe("Q13 repair R2b1 rollback-only core", () => {
  it("locks, re-preflights, applies core writes, then deliberately rolls back", async () => {
    const snapshot = validSnapshot();
    snapshot.children.Alert.push({
      id: "alert-null-2",
      alertCategoryId: null,
    });
    const plan = validPlan(snapshot);
    plan.nullCategoryAlerts.push({
      id: "alert-null-2",
      workspaceId: "workspace-1",
    });
    const envelope = signedEnvelope(snapshot, plan);
    const client = mockApplyClient(snapshot);

    await expect(applyRepair(client, envelope, publicKeyPem)).rejects.toThrow(
      "R2b2 apply completion is required",
    );

    expect(client.calls[0].sql).toBe("BEGIN ISOLATION LEVEL SERIALIZABLE");
    expect(client.calls[1]).toEqual({
      sql: "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
      parameters: ["inspoter:q13-repair:v1"],
    });
    expect(client.calls.at(-1)?.sql).toBe("ROLLBACK");
    expect(client.calls.some(({ sql }) => sql === "COMMIT")).toBe(false);

    const membershipInsert = client.calls.find(({ sql }) =>
      sql.startsWith('INSERT INTO "WorkspaceMember"'),
    );
    expect(membershipInsert?.parameters).toEqual([
      "membership-1",
      "workspace-1",
      "operator-1",
      "owner",
      "joined:membership-1",
    ]);
    const rootUpdates = client.calls.filter(({ sql }) =>
      /^UPDATE "(?:Category|MessageCategory|MailItem|LogEntry|AlertCategory|WebhookToken)"/u.test(
        sql,
      ),
    );
    expect(rootUpdates).toHaveLength(6);
    expect(
      client.calls.filter(({ sql }) =>
        sql.startsWith('UPDATE "Session" SET "activeWorkspaceId"'),
      ),
    ).toHaveLength(2);
    expect(
      client.calls.filter(({ sql }) =>
        sql.startsWith('INSERT INTO "AlertCategory"'),
      ),
    ).toHaveLength(1);
    const alertUpdates = client.calls.filter(({ sql }) =>
      sql.startsWith('UPDATE "Alert" SET "alertCategoryId"'),
    );
    expect(alertUpdates).toHaveLength(2);
    expect(alertUpdates[0].parameters?.[0]).toBe(
      `${SENTINEL_ID_PREFIX}workspace-1`,
    );
  });

  it("rolls back an injected write error without hiding it if rollback fails", async () => {
    const snapshot = validSnapshot();
    const client = mockApplyClient(snapshot, {
      failOn: 'DELETE FROM "WorkspaceMember"',
      rollbackFails: true,
    });

    await expect(
      applyRepair(client, signedEnvelope(snapshot), publicKeyPem),
    ).rejects.toThrow("injected write failure");
    expect(client.calls.at(-1)?.sql).toBe("ROLLBACK");
  });
});

describe("Q13 zero-guess plan skeleton", () => {
  it("covers existing values while leaving a null Alert workspace unresolved", () => {
    const snapshot = validSnapshot();
    const skeleton = createPlanSkeleton(snapshot);

    expect(skeleton).toMatchObject({
      version: 1,
      sourceDigest: snapshotDigest(snapshot),
      signature: { algorithm: "Ed25519", value: "" },
    });
    expect(skeleton.plan.memberships).toEqual(
      normalizeSnapshot(snapshot).memberships,
    );
    expect(skeleton.plan.roots).toEqual(normalizeSnapshot(snapshot).roots);
    expect(skeleton.plan.sessions).toEqual(
      normalizeSnapshot(snapshot).sessions.map(
        ({ id, activeWorkspaceId }: JsonRecord) => ({ id, activeWorkspaceId }),
      ),
    );
    expect(skeleton.plan.nullCategoryAlerts).toEqual([
      { id: "alert-null", workspaceId: null },
    ]);
  });

  it("emits deterministic fail-closed orphan and duplicate placeholders", () => {
    const snapshot = validSnapshot();
    snapshot.children.Alert = snapshot.children.Alert.filter(
      (row: JsonRecord) => row.alertCategoryId !== null,
    );
    snapshot.children.Bookmark[0].categoryId = "missing-category";
    snapshot.roots.AlertCategory.push({
      id: "alert-category-2",
      workspaceId: "workspace-1",
    });
    snapshot.alertCategories.push({
      id: "alert-category-2",
      name: "General",
      workspaceId: "workspace-1",
    });
    const reversed = clone(snapshot);
    reversed.alertCategories.reverse();
    reversed.roots.AlertCategory.reverse();
    const skeleton = createPlanSkeleton(snapshot);

    expect(canonicalize(createPlanSkeleton(reversed))).toBe(
      canonicalize(skeleton),
    );
    expect(skeleton.plan.orphans).toEqual([
      {
        action: null,
        id: "bookmark-1",
        missingParentId: "missing-category",
        model: "Bookmark",
      },
    ]);
    expect(skeleton.plan.duplicateAlertCategories).toEqual([
      {
        action: null,
        categoryIds: ["alert-category-1", "alert-category-2"],
        name: "General",
        workspaceId: "workspace-1",
      },
    ]);
    skeleton.signature.value = "AA==";
    expect(() => preflight(snapshot, skeleton)).toThrow(
      "orphan disposition action must be attach or delete",
    );

    const duplicateOnly = clone(skeleton) as JsonRecord;
    duplicateOnly.plan.orphans = [
      {
        action: "delete",
        dataLossAcknowledged: true,
        id: "bookmark-1",
        model: "Bookmark",
      },
    ];
    expect(() => preflight(snapshot, duplicateOnly)).toThrow(
      "duplicate AlertCategory action must be merge or rename",
    );
  });
});

describe("Q13 repair canonicalization and signed envelope", () => {
  it("canonicalizes recursive object keys while preserving array order", () => {
    expect(canonicalize({ z: { b: 2, a: 1 }, a: ["second", "first"] })).toBe(
      '{"a":["second","first"],"z":{"a":1,"b":2}}',
    );
    expect(canonicalize({ a: ["first", "second"] })).not.toBe(
      canonicalize({ a: ["second", "first"] }),
    );
  });

  it("uses one normalized digest for reversed inspect rows and preflight", () => {
    const snapshot = validSnapshot();
    const reordered = clone(snapshot);
    reordered.sessions.reverse();
    reordered.children.Alert.reverse();
    const inspectedSnapshot = normalizeSnapshot(reordered);
    const inspectDigest = snapshotDigest(inspectedSnapshot);
    const envelope = signedEnvelope(snapshot);

    expect(inspectedSnapshot).toEqual(normalizeSnapshot(snapshot));
    expect(snapshotDigest(reordered)).toBe(snapshotDigest(snapshot));
    expect(inspectDigest).toBe(envelope.sourceDigest);
    expect(() => preflight(snapshot, envelope)).not.toThrow();
    expect(sourceDigest(snapshot)).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it("orders canonically unequal Unicode rows ordinally and hashes them deterministically", () => {
    const snapshot = validSnapshot();
    snapshot.children.Alert.push(
      { id: "é", alertCategoryId: "alert-category-1" },
      { id: "e\u0301", alertCategoryId: "alert-category-1" },
    );
    const reversed = clone(snapshot);
    reversed.children.Alert.reverse();

    expect(snapshotDigest(reversed)).toBe(snapshotDigest(snapshot));
    const canonicalRows = normalizeSnapshot(reversed)
      .children.Alert.filter(
        (row: JsonRecord) => row.id === "é" || row.id === "e\u0301",
      )
      .map((row: JsonRecord) => canonicalize(row));
    expect(canonicalRows).toHaveLength(2);
    expect(canonicalRows[0]).not.toBe(canonicalRows[1]);
    expect(canonicalRows[0] < canonicalRows[1]).toBe(true);
  });

  it("preserves plan array order in the signed canonical payload", () => {
    const envelope = signedEnvelope();
    const reordered = clone(envelope);
    reordered.plan.sessions.reverse();

    expect(signedPayload(reordered)).not.toBe(signedPayload(envelope));
  });

  it("verifies Ed25519 and rejects tampered payloads and the wrong key", () => {
    const snapshot = validSnapshot();
    const envelope = signedEnvelope(snapshot);
    expect(() => verifyManifestSignature(envelope, publicKeyPem)).not.toThrow();

    const tampered = clone(envelope);
    tampered.plan.sessions[0].activeWorkspaceId = null;
    expect(() => verifyManifestSignature(tampered, publicKeyPem)).toThrow(
      "manifest signature verification failed",
    );

    const wrongKey = generateKeyPairSync("ed25519").publicKey.export({
      type: "spki",
      format: "pem",
    });
    expect(() => verifyManifestSignature(envelope, wrongKey)).toThrow(
      "manifest signature verification failed",
    );
  });

  it("accepts only the closed envelope and canonical base64 signature", () => {
    const envelope = signedEnvelope();
    expect(validateEnvelope(envelope)).toBe(envelope);
    expect(() => validateEnvelope({ ...envelope, extra: true })).toThrow(
      "unknown or missing keys",
    );
    expect(() =>
      validateEnvelope({
        ...envelope,
        signature: { ...envelope.signature, value: "aGVsbG8" },
      }),
    ).toThrow("canonical base64");
  });
});

describe("Q13 repair preflight baseline", () => {
  it("accepts the complete valid zero-guess plan", () => {
    const snapshot = validSnapshot();
    expect(preflight(snapshot, signedEnvelope(snapshot))).toMatchObject({
      memberships: { pairs: expect.any(Set) },
      orphanActions: expect.any(Map),
      rootWorkspaces: { Category: expect.any(Map) },
    });
  });

  it("requires the maintenance gate only when explicitly checked for apply", () => {
    expect(() =>
      assertMaintenanceMode({ Q13_MAINTENANCE_MODE: "1" }),
    ).not.toThrow();
    expect(() => assertMaintenanceMode({})).toThrow(
      "Q13_MAINTENANCE_MODE must equal 1",
    );
  });
});

function expectPreflightFailure(
  snapshot: JsonRecord,
  plan: JsonRecord,
  message: string | RegExp,
) {
  expect(() => preflight(snapshot, signedEnvelope(snapshot, plan))).toThrow(
    message,
  );
}

function coverageMutation(
  rows: JsonRecord[],
  kind: "missing" | "extra" | "duplicate",
) {
  if (kind === "missing") rows.pop();
  if (kind === "extra") rows.push({ ...rows[0], id: "unexpected-id" });
  if (kind === "duplicate") rows.push({ ...rows[0] });
}

describe("Q13 repair exact-once coverage", () => {
  it("rejects a source digest mismatch before accepting the plan", () => {
    const snapshot = validSnapshot();
    const envelope = signedEnvelope(snapshot);
    envelope.sourceDigest = `sha256:${"0".repeat(64)}`;

    expect(() => preflight(snapshot, envelope)).toThrow(
      "source digest does not match",
    );
  });

  it.each(["missing", "extra", "duplicate"] as const)(
    "rejects %s membership coverage",
    (kind) => {
      const snapshot = validSnapshot();
      const plan = validPlan(snapshot);
      coverageMutation(plan.memberships, kind);
      expectPreflightFailure(snapshot, plan, /plan\.memberships/);
    },
  );

  it.each([
    "Category",
    "MessageCategory",
    "MailItem",
    "LogEntry",
    "AlertCategory",
    "WebhookToken",
  ])("rejects missing, extra, and duplicate %s root coverage", (model) => {
    for (const kind of ["missing", "extra", "duplicate"] as const) {
      const snapshot = validSnapshot();
      const plan = validPlan(snapshot);
      coverageMutation(plan.roots[model], kind);
      expectPreflightFailure(
        snapshot,
        plan,
        new RegExp(`plan\\.roots\\.${model}`),
      );
    }
  });

  it.each(["missing", "extra", "duplicate"] as const)(
    "rejects %s Session coverage",
    (kind) => {
      const snapshot = validSnapshot();
      const plan = validPlan(snapshot);
      coverageMutation(plan.sessions, kind);
      expectPreflightFailure(snapshot, plan, /plan\.sessions/);
    },
  );

  it.each(["missing", "extra", "duplicate"] as const)(
    "rejects %s null-category Alert coverage",
    (kind) => {
      const snapshot = validSnapshot();
      const plan = validPlan(snapshot);
      coverageMutation(plan.nullCategoryAlerts, kind);
      expectPreflightFailure(snapshot, plan, /plan\.nullCategoryAlerts/);
    },
  );
});

describe("Q13 repair references and retained access", () => {
  it.each([
    [
      "operator",
      (plan: JsonRecord) =>
        (plan.memberships[0].operatorId = "missing-operator"),
    ],
    [
      "workspace",
      (plan: JsonRecord) =>
        (plan.memberships[0].workspaceId = "missing-workspace"),
    ],
  ])("rejects a membership with an unknown %s", (_label, mutate) => {
    const snapshot = validSnapshot();
    const plan = validPlan(snapshot);
    mutate(plan);
    expectPreflightFailure(snapshot, plan, /unknown operator or workspace/);
  });

  it("requires every source operator to retain a membership", () => {
    const snapshot = validSnapshot();
    snapshot.operators.push({ id: "operator-without-membership" });
    expectPreflightFailure(
      snapshot,
      validPlan(snapshot),
      /must retain at least one membership/,
    );
  });

  it("requires every source workspace to retain a membership and an owner", () => {
    const withoutMembership = validSnapshot();
    withoutMembership.workspaces.push({ id: "workspace-without-membership" });
    expectPreflightFailure(
      withoutMembership,
      validPlan(withoutMembership),
      /must retain at least one membership/,
    );

    const withoutOwner = validSnapshot();
    const plan = validPlan(withoutOwner);
    plan.memberships[0].role = "member";
    expectPreflightFailure(
      withoutOwner,
      plan,
      /must retain at least one owner/,
    );
  });

  it.each([
    "Category",
    "MessageCategory",
    "MailItem",
    "LogEntry",
    "AlertCategory",
    "WebhookToken",
  ])("rejects an unknown workspace for %s", (model) => {
    const snapshot = validSnapshot();
    const plan = validPlan(snapshot);
    plan.roots[model][0].workspaceId = "missing-workspace";
    expectPreflightFailure(snapshot, plan, /references an unknown workspace/);
  });

  it("distinguishes an explicit null Session destination from an omitted key", () => {
    const snapshot = validSnapshot();
    expect(() => preflight(snapshot, signedEnvelope(snapshot))).not.toThrow();

    const plan = validPlan(snapshot);
    delete plan.sessions[1].activeWorkspaceId;
    expectPreflightFailure(snapshot, plan, /unknown or missing keys/);
  });

  it("rejects a Session destination outside its operator memberships", () => {
    const snapshot = validSnapshot();
    snapshot.operators.push({ id: "operator-2" });
    snapshot.workspaces.push({ id: "workspace-2" });
    snapshot.memberships.push({
      id: "membership-2",
      operatorId: "operator-2",
      role: "owner",
      workspaceId: "workspace-2",
    });
    const plan = validPlan(snapshot);
    plan.sessions[0].activeWorkspaceId = "workspace-2";
    expectPreflightFailure(snapshot, plan, /not an operator membership/);
  });

  it("rejects an unknown workspace for a null-category Alert", () => {
    const snapshot = validSnapshot();
    const plan = validPlan(snapshot);
    plan.nullCategoryAlerts[0].workspaceId = "missing-workspace";
    expectPreflightFailure(snapshot, plan, /requires an explicit workspace/);
  });
});

describe("Q13 repair reserved values and closed shapes", () => {
  it.each(["id", "name"])(
    "rejects a reserved sentinel %s collision",
    (field) => {
      const snapshot = validSnapshot();
      if (field === "id") {
        const reservedId = `${SENTINEL_ID_PREFIX}workspace-1`;
        snapshot.alertCategories[0].id = reservedId;
        snapshot.roots.AlertCategory[0].id = reservedId;
        snapshot.children.Alert[0].alertCategoryId = reservedId;
      } else {
        snapshot.alertCategories[0].name = SENTINEL_NAME;
      }
      expectPreflightFailure(
        snapshot,
        validPlan(snapshot),
        /reserved sentinel collision/,
      );
    },
  );

  it.each([
    ["plan", (envelope: JsonRecord) => (envelope.plan.unexpected = true)],
    [
      "membership",
      (envelope: JsonRecord) =>
        (envelope.plan.memberships[0].unexpected = true),
    ],
    [
      "root",
      (envelope: JsonRecord) =>
        (envelope.plan.roots.Category[0].unexpected = true),
    ],
    [
      "session",
      (envelope: JsonRecord) => (envelope.plan.sessions[0].unexpected = true),
    ],
  ])("rejects an unknown %s key", (_label, mutate) => {
    const snapshot = validSnapshot();
    const envelope = signedEnvelope(snapshot);
    mutate(envelope);
    expect(() => preflight(snapshot, envelope)).toThrow(
      /unknown or missing keys/,
    );
  });

  it("rejects an unknown root model", () => {
    const snapshot = validSnapshot();
    const plan = validPlan(snapshot);
    plan.roots.Unknown = [];
    expectPreflightFailure(
      snapshot,
      plan,
      /plan\.roots has unknown or missing keys/,
    );
  });
});

function snapshotWithAllSupportedOrphans(): JsonRecord {
  const snapshot = validSnapshot();
  snapshot.children.Alert[0].alertCategoryId = "missing-alert-category";
  snapshot.children.Bookmark[0].categoryId = "missing-category";
  snapshot.children.Channel[0].messageCategoryId = "missing-message-category";
  snapshot.children.IdempotencyKey[0].tokenId = "missing-token";
  snapshot.children.Message[0].channelId = "missing-channel";
  return snapshot;
}

function orphanDispositions(action: "attach" | "delete"): JsonRecord[] {
  const parents: Record<string, string> = {
    Alert: "alert-category-1",
    Bookmark: "category-1",
    Channel: "message-category-1",
    IdempotencyKey: "token-1",
    Message: "channel-1",
  };
  return ["Alert", "Bookmark", "Channel", "IdempotencyKey", "Message"].map(
    (model) =>
      action === "attach"
        ? {
            action,
            id: `${model === "IdempotencyKey" ? "key" : model.toLowerCase()}-1`,
            model,
            parentId: parents[model],
          }
        : {
            action,
            dataLossAcknowledged: true,
            id: `${model === "IdempotencyKey" ? "key" : model.toLowerCase()}-1`,
            model,
          },
  );
}

describe("Q13 repair orphan dispositions", () => {
  it("detects every supported orphan deterministically", () => {
    expect(findSupportedOrphans(snapshotWithAllSupportedOrphans())).toEqual([
      {
        id: "alert-1",
        missingParentId: "missing-alert-category",
        model: "Alert",
      },
      {
        id: "bookmark-1",
        missingParentId: "missing-category",
        model: "Bookmark",
      },
      {
        id: "channel-1",
        missingParentId: "missing-message-category",
        model: "Channel",
      },
      {
        id: "key-1",
        missingParentId: "missing-token",
        model: "IdempotencyKey",
      },
      { id: "message-1", missingParentId: "missing-channel", model: "Message" },
    ]);
  });

  it.each(["missing", "extra", "duplicate"] as const)(
    "rejects %s orphan coverage",
    (kind) => {
      const snapshot = snapshotWithAllSupportedOrphans();
      const plan = validPlan(snapshot);
      plan.orphans = orphanDispositions("delete");
      coverageMutation(plan.orphans, kind);
      expectPreflightFailure(snapshot, plan, /orphan dispositions/);
    },
  );

  it("accepts an explicit valid attach parent for every supported model", () => {
    const snapshot = snapshotWithAllSupportedOrphans();
    const plan = validPlan(snapshot);
    plan.orphans = orphanDispositions("attach");
    expect(() =>
      preflight(snapshot, signedEnvelope(snapshot, plan)),
    ).not.toThrow();
  });

  it("rejects an invalid attach parent", () => {
    const snapshot = snapshotWithAllSupportedOrphans();
    const plan = validPlan(snapshot);
    plan.orphans = orphanDispositions("attach");
    plan.orphans[0].parentId = "missing-parent";
    expectPreflightFailure(snapshot, plan, /attach parent is invalid/);
  });

  it("requires exact data-loss acknowledgement and accepts true", () => {
    const snapshot = snapshotWithAllSupportedOrphans();
    const accepted = validPlan(snapshot);
    accepted.orphans = orphanDispositions("delete");
    expect(() =>
      preflight(snapshot, signedEnvelope(snapshot, accepted)),
    ).not.toThrow();

    const rejected = validPlan(snapshot);
    rejected.orphans = orphanDispositions("delete");
    rejected.orphans[0].dataLossAcknowledged = false;
    expectPreflightFailure(snapshot, rejected, /dataLossAcknowledged:true/);
  });

  it.each([
    ["model", (item: JsonRecord) => (item.model = "Unknown")],
    ["action", (item: JsonRecord) => (item.action = "archive")],
    ["key", (item: JsonRecord) => (item.unexpected = true)],
  ])("rejects an unknown orphan %s", (_label, mutate) => {
    const snapshot = snapshotWithAllSupportedOrphans();
    const plan = validPlan(snapshot);
    plan.orphans = orphanDispositions("attach");
    mutate(plan.orphans[0]);
    expectPreflightFailure(
      snapshot,
      plan,
      /unsupported orphan model|action must be attach or delete|unknown or missing keys/,
    );
  });
});

function snapshotWithDuplicateAlertCategories(): JsonRecord {
  const snapshot = validSnapshot();
  snapshot.roots.AlertCategory.push({
    id: "alert-category-2",
    workspaceId: "workspace-1",
  });
  snapshot.alertCategories.push({
    id: "alert-category-2",
    name: "General",
    workspaceId: "workspace-1",
  });
  return snapshot;
}

function mergeDisposition(): JsonRecord {
  return {
    action: "merge",
    categoryIds: ["alert-category-1", "alert-category-2"],
    name: "General",
    targetCategoryId: "alert-category-1",
    workspaceId: "workspace-1",
  };
}

function renameDisposition(): JsonRecord {
  return {
    action: "rename",
    categoryIds: ["alert-category-1", "alert-category-2"],
    name: "General",
    renames: [
      { id: "alert-category-1", name: "General A" },
      { id: "alert-category-2", name: "General B" },
    ],
    workspaceId: "workspace-1",
  };
}

describe("Q13 repair duplicate AlertCategory dispositions", () => {
  it("detects the exact duplicate group and accepts merge or unique renames", () => {
    const snapshot = snapshotWithDuplicateAlertCategories();
    expect(findDuplicateAlertCategoryGroups(snapshot)).toEqual([
      {
        categoryIds: ["alert-category-1", "alert-category-2"],
        name: "General",
        workspaceId: "workspace-1",
      },
    ]);
    for (const disposition of [mergeDisposition(), renameDisposition()]) {
      const plan = validPlan(snapshot);
      plan.duplicateAlertCategories = [disposition];
      expect(() =>
        preflight(snapshot, signedEnvelope(snapshot, plan)),
      ).not.toThrow();
    }
  });

  it.each(["missing", "extra"] as const)(
    "rejects %s duplicate-group disposition coverage",
    (kind) => {
      const snapshot = snapshotWithDuplicateAlertCategories();
      const plan = validPlan(snapshot);
      plan.duplicateAlertCategories =
        kind === "missing" ? [] : [mergeDisposition(), mergeDisposition()];
      expectPreflightFailure(
        snapshot,
        plan,
        /duplicate AlertCategory dispositions/,
      );
    },
  );

  it("rejects a merge target outside the detected group", () => {
    const snapshot = snapshotWithDuplicateAlertCategories();
    const plan = validPlan(snapshot);
    const disposition = mergeDisposition();
    disposition.targetCategoryId = "not-in-group";
    plan.duplicateAlertCategories = [disposition];
    expectPreflightFailure(snapshot, plan, /merge target must belong/);
  });

  it.each([
    [
      "incomplete",
      (item: JsonRecord) => item.renames.pop(),
      /duplicate renames/,
    ],
    [
      "reserved",
      (item: JsonRecord) => (item.renames[0].name = SENTINEL_NAME),
      /reserved sentinel name/,
    ],
    [
      "colliding",
      (item: JsonRecord) => (item.renames[1].name = "General A"),
      /unique final names/,
    ],
  ])("rejects %s rename output", (_label, mutate, message) => {
    const snapshot = snapshotWithDuplicateAlertCategories();
    const plan = validPlan(snapshot);
    const disposition = renameDisposition();
    mutate(disposition);
    plan.duplicateAlertCategories = [disposition];
    expectPreflightFailure(snapshot, plan, message);
  });

  it.each([
    [
      "action",
      (item: JsonRecord) => (item.action = "delete"),
      /action must be merge or rename/,
    ],
    [
      "key",
      (item: JsonRecord) => (item.unexpected = true),
      /unknown or missing keys/,
    ],
  ])(
    "rejects an unknown duplicate disposition %s",
    (_label, mutate, message) => {
      const snapshot = snapshotWithDuplicateAlertCategories();
      const plan = validPlan(snapshot);
      const disposition = mergeDisposition();
      mutate(disposition);
      plan.duplicateAlertCategories = [disposition];
      expectPreflightFailure(snapshot, plan, message);
    },
  );
});

describe("Q13 repair strict CLI", () => {
  it.each([
    [
      "inspect",
      ["inspect", "--database-url", "db", "--out", "plan.json"],
      {
        command: "inspect",
        databaseUrl: "db",
        outPath: "plan.json",
      },
    ],
    [
      "canonicalize",
      ["canonicalize", "--manifest", "plan.json"],
      { command: "canonicalize", manifestPath: "plan.json" },
    ],
    [
      "preflight",
      [
        "preflight",
        "--database-url",
        "db",
        "--manifest",
        "plan.json",
        "--public-key",
        "public.pem",
      ],
      {
        command: "preflight",
        databaseUrl: "db",
        manifestPath: "plan.json",
        publicKeyPath: "public.pem",
      },
    ],
    [
      "apply",
      [
        "apply",
        "--database-url",
        "db",
        "--manifest",
        "plan.json",
        "--public-key",
        "public.pem",
      ],
      {
        command: "apply",
        databaseUrl: "db",
        manifestPath: "plan.json",
        publicKeyPath: "public.pem",
      },
    ],
  ])("parses the exact %s command contract", (_command, argv, expected) => {
    const parsed = parseCliArgs(argv);
    expect(parsed).toEqual(expected);
    expect(Object.isFrozen(parsed)).toBe(true);
  });

  it("prefers flags and supports the documented environment fallbacks", () => {
    const inspectResult = parseCliArgs(
      ["inspect", "--database-url", "flag-db", "--out", "plan.json"],
      { DATABASE_URL: "env-db" } as unknown as NodeJS.ProcessEnv,
    ) as JsonRecord;
    expect(inspectResult.databaseUrl).toBe("flag-db");
    expect(
      parseCliArgs(["preflight", "--manifest", "plan.json"], {
        DATABASE_URL: "env-db",
        Q13_REPAIR_PUBLIC_KEY: "env-public-key.pem",
      } as unknown as NodeJS.ProcessEnv),
    ).toEqual({
      command: "preflight",
      databaseUrl: "env-db",
      manifestPath: "plan.json",
      publicKeyPath: "env-public-key.pem",
    });
  });

  it.each([
    ["unknown command", ["repair"]],
    ["unknown flag", ["inspect", "--unknown", "x", "--out", "p"]],
    ["duplicate flag", ["inspect", "--out", "a", "--out", "b"]],
    ["missing value", ["canonicalize", "--manifest"]],
    ["missing required flag", ["canonicalize"]],
    ["flag not allowed", ["canonicalize", "--out", "x"]],
    ["unexpected positional", ["canonicalize", "plan.json"]],
  ])("rejects %s", (_label, argv) => {
    expect(() => parseCliArgs(argv, { DATABASE_URL: "env-db" })).toThrow();
  });

  it("accepts an unsigned skeleton only for explicit canonicalization", () => {
    const skeleton = createPlanSkeleton(validSnapshot());
    expect(() => validateEnvelope(skeleton)).toThrow("canonical base64");
    expect(validateEnvelope(skeleton, { allowUnsigned: true })).toBe(skeleton);
  });

  it("canonicalizes an unsigned skeleton without database configuration", async () => {
    const directory = await mkdtemp(join(tmpdir(), "q13-repair-"));
    const manifestPath = join(directory, "plan.json");
    const skeleton = createPlanSkeleton(validSnapshot());
    const output = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);
    try {
      await writeFile(manifestPath, JSON.stringify(skeleton), "utf8");
      await main(
        ["canonicalize", "--manifest", manifestPath],
        {} as NodeJS.ProcessEnv,
      );
      expect(output).toHaveBeenCalledWith(`${signedPayload(skeleton)}\n`);
    } finally {
      output.mockRestore();
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("rejects apply without maintenance before file or database access", async () => {
    await expect(
      main(
        [
          "apply",
          "--database-url",
          "postgresql://must-not-connect",
          "--manifest",
          "must-not-read.json",
          "--public-key",
          "must-not-read.pem",
        ],
        {} as NodeJS.ProcessEnv,
      ),
    ).rejects.toThrow("Q13_MAINTENANCE_MODE must equal 1");
  });
});
