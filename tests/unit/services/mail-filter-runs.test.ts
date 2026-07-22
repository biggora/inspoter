import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { getOrCreateWebhookAccount } from "@/lib/services/mail-accounts";
import * as rulesService from "@/lib/services/mail-filter-rules";
import * as runsService from "@/lib/services/mail-filter-runs";
import * as labelsService from "@/lib/services/mail-labels";
import { persistIncomingMail } from "@/lib/services/mail-message-persistence";

const PREFIX = `mail-filter-runs-${randomUUID()}`;
let workspaceId: string;
let ownerId: string;
let memberId: string;
let accountId: string;
let inboxId: string;
let labelId: string;

function runtime(now: Date, token: string): runsService.MailFilterRunRuntime {
  return { now: () => now, leaseToken: () => token };
}

async function insertMail(
  id: string,
  createdAt: Date,
  fromAddress: string,
  subject: string,
) {
  return db.mailItem.create({
    data: {
      id,
      workspaceId,
      accountId,
      accountWorkspaceId: workspaceId,
      folderId: inboxId,
      folderWorkspaceId: workspaceId,
      fromAddress,
      subject,
      bodyText: subject,
      receivedAt: createdAt,
      createdAt,
    },
  });
}

beforeAll(async () => {
  const [workspace, owner, member] = await Promise.all([
    db.workspace.create({
      data: { name: `${PREFIX}-workspace`, slug: `${PREFIX}-workspace` },
    }),
    db.operator.create({ data: { username: `${PREFIX}-owner` } }),
    db.operator.create({ data: { username: `${PREFIX}-member` } }),
  ]);
  workspaceId = workspace.id;
  ownerId = owner.id;
  memberId = member.id;
  await db.workspaceMember.createMany({
    data: [
      { workspaceId, operatorId: ownerId, role: "OWNER" },
      { workspaceId, operatorId: memberId, role: "MEMBER" },
    ],
  });
  const account = await getOrCreateWebhookAccount(workspaceId);
  accountId = account.account.id;
  inboxId = (
    await db.mailFolder.findFirstOrThrow({
      where: { workspaceId, accountId, specialUse: "INBOX" },
      select: { id: true },
    })
  ).id;
  const label = await db.mailLabel.create({
    data: {
      workspaceId,
      name: `${PREFIX}-label`,
      normalizedName: `${PREFIX}-label`,
      color: "BLUE",
    },
  });
  labelId = label.id;
});

afterAll(async () => {
  await db.workspace.delete({ where: { id: workspaceId } });
  await db.operator.deleteMany({ where: { id: { in: [ownerId, memberId] } } });
});

describe("durable Mail filter runs", () => {
  it("captures an immutable cutoff and processes canonical matches in 200-row atomic batches", async () => {
    const createdAt = new Date("2026-07-21T10:00:00.000Z");
    const ids = Array.from(
      { length: 201 },
      (_, index) => `${PREFIX}-batch-${String(index).padStart(3, "0")}`,
    );
    await db.mailItem.createMany({
      data: ids.map((id, index) => ({
        id,
        workspaceId,
        accountId,
        accountWorkspaceId: workspaceId,
        folderId: inboxId,
        folderWorkspaceId: workspaceId,
        fromAddress: " sender@example.com ",
        subject: index % 2 === 0 ? " ＡLERT notice " : "ordinary notice",
        bodyText: "body",
        receivedAt: createdAt,
        createdAt,
      })),
    });
    await db.mailItemLabel.create({
      data: {
        workspaceId,
        mailItemId: ids[0],
        mailItemWorkspaceId: workspaceId,
        labelId,
        labelWorkspaceId: workspaceId,
      },
    });

    const rule = await rulesService.createMailFilterRule(workspaceId, ownerId, {
      accountId,
      labelId,
      name: `${PREFIX}-batch-rule`,
      fromAddress: "SENDER@example.com",
      subjectContains: "alert",
      applyToExistingMail: true,
    });
    expect(rule.latestRun?.status).toBe("PENDING");

    // Same timestamp but lexically after the captured cutoff: live-only.
    const postCutoff = await persistIncomingMail({
      workspaceId,
      accountId,
      folderId: inboxId,
      folderSpecialUse: "INBOX",
      fromAddress: "sender@example.com",
      subject: "alert after cutoff",
      bodyText: "live only",
    });

    const now = new Date("2026-07-21T10:01:00.000Z");
    const [claim] = await runsService.claimMailFilterRuns(
      1,
      runtime(now, `${PREFIX}-lease-batch`),
    );
    expect(claim.id).toBe(rule.latestRun?.id);
    expect(
      await runsService.processClaimedMailFilterRunBatch(claim, {
        now: () => now,
      }),
    ).toBe("RUNNING");
    expect(
      await runsService.processClaimedMailFilterRunBatch(claim, {
        now: () => now,
      }),
    ).toBe("COMPLETED");

    const completed = await db.mailFilterRun.findUniqueOrThrow({
      where: { id: claim.id },
    });
    expect(completed.processedCount).toBe(201);
    expect(completed.matchedCount).toBe(101);
    expect(completed.cursorId).toBe(ids.at(-1));
    expect(completed.attempts).toBe(0);
    expect(
      await db.mailItemLabel.count({
        where: { labelId, mailItemId: { in: ids } },
      }),
    ).toBe(101);
    expect(
      await db.mailItemLabel.count({
        where: { labelId, mailItemId: postCutoff.id },
      }),
    ).toBe(1);
  });

  it("rolls back assignments, counts, and cursor when the batch transaction crashes", async () => {
    const item = await insertMail(
      `${PREFIX}-rollback-item`,
      new Date("2026-07-21T11:00:00.000Z"),
      `${PREFIX}-rollback@example.com`,
      "rollback",
    );
    const rule = await rulesService.createMailFilterRule(workspaceId, ownerId, {
      accountId,
      labelId,
      name: `${PREFIX}-rollback-rule`,
      fromAddress: `${PREFIX}-rollback@example.com`,
      applyToExistingMail: true,
    });
    const now = new Date("2026-07-21T11:01:00.000Z");
    const [claim] = await runsService.claimMailFilterRuns(
      1,
      runtime(now, `${PREFIX}-lease-rollback`),
    );
    expect(claim.id).toBe(rule.latestRun?.id);

    await expect(
      db.$transaction(async (tx) => {
        await runsService.processMailFilterRunBatchInTransaction(
          tx,
          claim,
          now,
        );
        throw new Error("simulated process crash before commit");
      }),
    ).rejects.toThrow("simulated process crash");

    const unchanged = await db.mailFilterRun.findUniqueOrThrow({
      where: { id: claim.id },
    });
    expect(unchanged.processedCount).toBe(0);
    expect(unchanged.cursorId).toBeNull();
    expect(
      await db.mailItemLabel.count({
        where: { mailItemId: item.id, labelId },
      }),
    ).toBe(0);

    while (
      (await runsService.processClaimedMailFilterRunBatch(claim, {
        now: () => now,
      })) === "RUNNING"
    ) {
      // Drain the immutable range; the assertion below targets the final row.
    }
    expect(
      await db.mailItemLabel.count({
        where: { mailItemId: item.id, labelId },
      }),
    ).toBe(1);
  });

  it("atomically fences two workers, counts expired leases, and supports bounded manual retry", async () => {
    const rule = await rulesService.createMailFilterRule(workspaceId, ownerId, {
      accountId,
      labelId,
      name: `${PREFIX}-lease-rule`,
      subjectContains: `${PREFIX}-never-match`,
      applyToExistingMail: true,
    });
    const firstNow = new Date("2026-07-21T12:00:00.000Z");
    const [workerA, workerB] = await Promise.all([
      runsService.claimMailFilterRuns(1, runtime(firstNow, `${PREFIX}-a`)),
      runsService.claimMailFilterRuns(1, runtime(firstNow, `${PREFIX}-b`)),
    ]);
    expect([...workerA, ...workerB]).toHaveLength(1);
    const firstClaim = [...workerA, ...workerB][0];
    expect(firstClaim.id).toBe(rule.latestRun?.id);

    const secondNow = new Date(
      firstNow.getTime() + runsService.MAIL_FILTER_RUN_LEASE_MS + 1,
    );
    await runsService.recordMailFilterRunFailure(
      firstClaim,
      new Error("stale worker failure"),
      { now: () => secondNow },
    );
    expect(
      await db.mailFilterRun.findUniqueOrThrow({
        where: { id: firstClaim.id },
        select: { status: true, attempts: true },
      }),
    ).toEqual({ status: "RUNNING", attempts: 0 });
    const [secondClaim] = await runsService.claimMailFilterRuns(
      1,
      runtime(secondNow, `${PREFIX}-takeover-1`),
    );
    expect(secondClaim.id).toBe(firstClaim.id);
    expect(
      await runsService.renewMailFilterRunLease(firstClaim, {
        now: () => secondNow,
      }),
    ).toBe(false);

    const thirdNow = new Date(
      secondNow.getTime() + runsService.MAIL_FILTER_RUN_LEASE_MS + 1,
    );
    const [thirdClaim] = await runsService.claimMailFilterRuns(
      1,
      runtime(thirdNow, `${PREFIX}-takeover-2`),
    );
    expect(thirdClaim.id).toBe(firstClaim.id);

    const fourthNow = new Date(
      thirdNow.getTime() + runsService.MAIL_FILTER_RUN_LEASE_MS + 1,
    );
    expect(
      await runsService.claimMailFilterRuns(
        1,
        runtime(fourthNow, `${PREFIX}-takeover-3`),
      ),
    ).toEqual([]);
    const failed = await db.mailFilterRun.findUniqueOrThrow({
      where: { id: firstClaim.id },
    });
    expect(failed.status).toBe("FAILED");
    expect(failed.attempts).toBe(3);

    await expect(
      runsService.retryMailFilterRun(workspaceId, memberId, failed.id),
    ).rejects.toThrow("Only the workspace owner");
    const retried = await runsService.retryMailFilterRun(
      workspaceId,
      ownerId,
      failed.id,
    );
    expect(retried).toMatchObject({
      status: "PENDING",
      attempts: 0,
      errorCode: null,
    });
    await expect(
      runsService.retryMailFilterRun(workspaceId, ownerId, failed.id),
    ).rejects.toBeInstanceOf(runsService.MailFilterRunRetryConflictError);
    await db.mailFilterRun.delete({ where: { id: failed.id } });
  });

  it("uses an immutable snapshot when the source rule changes and completes empty accounts immediately", async () => {
    const emptyWorkspace = await db.workspace.create({
      data: { name: `${PREFIX}-empty`, slug: `${PREFIX}-empty` },
    });
    await db.workspaceMember.create({
      data: {
        workspaceId: emptyWorkspace.id,
        operatorId: ownerId,
        role: "OWNER",
      },
    });
    const emptyAccount = await getOrCreateWebhookAccount(emptyWorkspace.id);
    const emptyLabel = await db.mailLabel.create({
      data: {
        workspaceId: emptyWorkspace.id,
        name: "Empty",
        normalizedName: `${PREFIX}-empty`,
        color: "SLATE",
      },
    });
    const emptyRule = await rulesService.createMailFilterRule(
      emptyWorkspace.id,
      ownerId,
      {
        accountId: emptyAccount.account.id,
        labelId: emptyLabel.id,
        name: "Empty run",
        fromAddress: "empty@example.com",
        applyToExistingMail: true,
      },
    );
    expect(emptyRule.latestRun).toMatchObject({
      status: "COMPLETED",
      processedCount: 0,
      matchedCount: 0,
    });
    await db.workspace.delete({ where: { id: emptyWorkspace.id } });

    const item = await insertMail(
      `${PREFIX}-snapshot-item`,
      new Date("2026-07-21T13:00:00.000Z"),
      `${PREFIX}-old@example.com`,
      "snapshot",
    );
    const rule = await rulesService.createMailFilterRule(workspaceId, ownerId, {
      accountId,
      labelId,
      name: `${PREFIX}-snapshot-rule`,
      fromAddress: `${PREFIX}-old@example.com`,
      applyToExistingMail: true,
    });
    await rulesService.updateMailFilterRule(workspaceId, ownerId, rule.id, {
      fromAddress: `${PREFIX}-new@example.com`,
    });
    const now = new Date("2026-07-21T13:01:00.000Z");
    const [claim] = await runsService.claimMailFilterRuns(
      1,
      runtime(now, `${PREFIX}-lease-snapshot`),
    );
    expect(claim.id).toBe(rule.latestRun?.id);
    while (
      (await runsService.processClaimedMailFilterRunBatch(claim, {
        now: () => now,
      })) === "RUNNING"
    ) {
      // Drain all keyset pages so the newest snapshot fixture is inspected.
    }
    expect(
      await db.mailItemLabel.count({ where: { mailItemId: item.id, labelId } }),
    ).toBe(1);
  });

  it("keeps the target label protected after an active run loses its source-rule relation", async () => {
    const protectedLabel = await labelsService.createLabel(
      workspaceId,
      ownerId,
      {
        name: `${PREFIX}-protected`,
        color: "AMBER",
      },
    );
    const rule = await rulesService.createMailFilterRule(workspaceId, ownerId, {
      accountId,
      labelId: protectedLabel.id,
      name: `${PREFIX}-protected-rule`,
      subjectContains: `${PREFIX}-protected`,
      applyToExistingMail: true,
    });
    await rulesService.deleteMailFilterRule(workspaceId, ownerId, rule.id);
    expect(
      await db.mailFilterRun.findUniqueOrThrow({
        where: { id: rule.latestRun!.id },
        select: { ruleId: true, sourceRuleId: true },
      }),
    ).toEqual({ ruleId: null, sourceRuleId: rule.id });
    await expect(
      labelsService.deleteLabel(workspaceId, ownerId, protectedLabel.id),
    ).rejects.toBeInstanceOf(labelsService.MailLabelInUseError);
    await db.mailFilterRun.delete({ where: { id: rule.latestRun!.id } });
  });

  it("keeps a live/backfill overlap idempotent while counting the pre-labeled match", async () => {
    const sender = `${PREFIX}-live-overlap@example.com`;
    const rule = await rulesService.createMailFilterRule(workspaceId, ownerId, {
      accountId,
      labelId,
      name: `${PREFIX}-live-overlap-rule`,
      fromAddress: sender,
    });
    const item = await persistIncomingMail({
      workspaceId,
      accountId,
      folderId: inboxId,
      folderSpecialUse: "INBOX",
      fromAddress: sender,
      subject: "Live overlap",
      bodyText: "Live overlap",
    });
    expect(
      await db.mailItemLabel.count({ where: { mailItemId: item.id, labelId } }),
    ).toBe(1);

    const run = await db.$transaction((tx) =>
      runsService.createMailFilterRunInTransaction(tx, workspaceId, {
        id: rule.id,
        accountId,
        labelId,
        fromAddress: sender,
        subjectContains: null,
      }),
    );
    const now = new Date(Date.now() + 1_000);
    const [claim] = await runsService.claimMailFilterRuns(
      1,
      runtime(now, `${PREFIX}-lease-live-overlap`),
    );
    expect(claim.id).toBe(run.id);
    while (
      (await runsService.processClaimedMailFilterRunBatch(claim, {
        now: () => now,
      })) === "RUNNING"
    ) {
      // Drain the account snapshot; only this sender matches this rule.
    }

    const completed = await db.mailFilterRun.findUniqueOrThrow({
      where: { id: run.id },
    });
    expect(completed.matchedCount).toBe(1);
    expect(
      await db.mailItemLabel.count({ where: { mailItemId: item.id, labelId } }),
    ).toBe(1);
  });
});
