import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { getOrCreateWebhookAccount } from "@/lib/services/mail-accounts";
import * as rulesService from "@/lib/services/mail-filter-rules";
import {
  runMailAccountTransaction,
  type MailAccountTransactionRunner,
} from "@/lib/services/mail-locks";
import { persistIncomingMail } from "@/lib/services/mail-message-persistence";

interface Deferred {
  promise: Promise<void>;
  resolve: () => void;
}

function deferred(): Deferred {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function barrierRunner(entered: Deferred, release: Deferred) {
  const runner: MailAccountTransactionRunner = (accountId, operation) =>
    runMailAccountTransaction(accountId, async (tx) => {
      entered.resolve();
      await release.promise;
      return operation(tx);
    });
  return runner;
}

const PREFIX = `mail-rule-races-${randomUUID()}`;
let workspaceId: string;
let ownerId: string;
let accountId: string;
let inboxFolderId: string;

beforeAll(async () => {
  const [workspace, owner] = await Promise.all([
    db.workspace.create({
      data: { name: `${PREFIX}-workspace`, slug: `${PREFIX}-workspace` },
    }),
    db.operator.create({ data: { username: `${PREFIX}-owner` } }),
  ]);
  workspaceId = workspace.id;
  ownerId = owner.id;
  await db.workspaceMember.create({
    data: { workspaceId, operatorId: ownerId, role: "OWNER" },
  });
  const webhook = await getOrCreateWebhookAccount(workspaceId);
  accountId = webhook.account.id;
  inboxFolderId = webhook.inboxFolder.id;
});

afterAll(async () => {
  if (workspaceId) {
    await db.workspace.delete({ where: { id: workspaceId } }).catch(() => {});
  }
  if (ownerId) {
    await db.operator.delete({ where: { id: ownerId } }).catch(() => {});
  }
});

async function createLabel(name: string) {
  return db.mailLabel.create({
    data: {
      workspaceId,
      name,
      normalizedName: `${PREFIX}-${name}`.toLocaleLowerCase("en-US"),
      color: "BLUE",
      position: 0,
    },
  });
}

async function persist(sender: string, runner?: MailAccountTransactionRunner) {
  return persistIncomingMail(
    {
      workspaceId,
      accountId,
      folderId: inboxFolderId,
      folderSpecialUse: "INBOX",
      fromAddress: sender,
      subject: "Controlled race",
      bodyText: "body",
    },
    runner,
  );
}

async function assignmentCount(mailItemId: string, labelId: string) {
  return db.mailItemLabel.count({ where: { mailItemId, labelId } });
}

describe("mail filter-rule lock linearization", () => {
  it("linearizes create before/after the post-lock message snapshot", async () => {
    const beforeLabel = await createLabel("create-before");
    const beforeEntered = deferred();
    const beforeRelease = deferred();
    const createBefore = rulesService.createMailFilterRule(
      workspaceId,
      ownerId,
      {
        accountId,
        labelId: beforeLabel.id,
        name: "Create before",
        fromAddress: `${PREFIX}-create-before@example.com`,
      },
      barrierRunner(beforeEntered, beforeRelease),
    );
    await beforeEntered.promise;
    const beforeMail = persist(`${PREFIX}-create-before@example.com`);
    beforeRelease.resolve();
    await createBefore;
    const committedBefore = await beforeMail;
    expect(await assignmentCount(committedBefore.id, beforeLabel.id)).toBe(1);

    const afterLabel = await createLabel("create-after");
    const afterEntered = deferred();
    const afterRelease = deferred();
    const persistedBeforeCreate = persist(
      `${PREFIX}-create-after@example.com`,
      barrierRunner(afterEntered, afterRelease),
    );
    await afterEntered.promise;
    const createAfter = rulesService.createMailFilterRule(
      workspaceId,
      ownerId,
      {
        accountId,
        labelId: afterLabel.id,
        name: "Create after",
        fromAddress: `${PREFIX}-create-after@example.com`,
      },
    );
    afterRelease.resolve();
    const committedAfter = await persistedBeforeCreate;
    await createAfter;
    expect(await assignmentCount(committedAfter.id, afterLabel.id)).toBe(0);
  });

  it("linearizes edit before/after the post-lock message snapshot", async () => {
    const beforeLabel = await createLabel("edit-before");
    const beforeRule = await rulesService.createMailFilterRule(
      workspaceId,
      ownerId,
      {
        accountId,
        labelId: beforeLabel.id,
        name: "Edit before",
        fromAddress: `${PREFIX}-edit-old-before@example.com`,
      },
    );
    const beforeEntered = deferred();
    const beforeRelease = deferred();
    const editBefore = rulesService.updateMailFilterRule(
      workspaceId,
      ownerId,
      beforeRule.id,
      { fromAddress: `${PREFIX}-edit-new-before@example.com` },
      barrierRunner(beforeEntered, beforeRelease),
    );
    await beforeEntered.promise;
    const beforeMail = persist(`${PREFIX}-edit-new-before@example.com`);
    beforeRelease.resolve();
    await editBefore;
    const committedBefore = await beforeMail;
    expect(await assignmentCount(committedBefore.id, beforeLabel.id)).toBe(1);

    const afterLabel = await createLabel("edit-after");
    const afterRule = await rulesService.createMailFilterRule(
      workspaceId,
      ownerId,
      {
        accountId,
        labelId: afterLabel.id,
        name: "Edit after",
        fromAddress: `${PREFIX}-edit-old-after@example.com`,
      },
    );
    const afterEntered = deferred();
    const afterRelease = deferred();
    const persistedBeforeEdit = persist(
      `${PREFIX}-edit-new-after@example.com`,
      barrierRunner(afterEntered, afterRelease),
    );
    await afterEntered.promise;
    const editAfter = rulesService.updateMailFilterRule(
      workspaceId,
      ownerId,
      afterRule.id,
      { fromAddress: `${PREFIX}-edit-new-after@example.com` },
    );
    afterRelease.resolve();
    const committedAfter = await persistedBeforeEdit;
    await editAfter;
    expect(await assignmentCount(committedAfter.id, afterLabel.id)).toBe(0);
  });

  it("linearizes disable before/after snapshot and preserves prior assignments", async () => {
    const beforeLabel = await createLabel("disable-before");
    const beforeRule = await rulesService.createMailFilterRule(
      workspaceId,
      ownerId,
      {
        accountId,
        labelId: beforeLabel.id,
        name: "Disable before",
        fromAddress: `${PREFIX}-disable-before@example.com`,
      },
    );
    const beforeEntered = deferred();
    const beforeRelease = deferred();
    const disableBefore = rulesService.updateMailFilterRule(
      workspaceId,
      ownerId,
      beforeRule.id,
      { isActive: false },
      barrierRunner(beforeEntered, beforeRelease),
    );
    await beforeEntered.promise;
    const beforeMail = persist(`${PREFIX}-disable-before@example.com`);
    beforeRelease.resolve();
    await disableBefore;
    const committedBefore = await beforeMail;
    expect(await assignmentCount(committedBefore.id, beforeLabel.id)).toBe(0);

    const afterLabel = await createLabel("disable-after");
    const afterRule = await rulesService.createMailFilterRule(
      workspaceId,
      ownerId,
      {
        accountId,
        labelId: afterLabel.id,
        name: "Disable after",
        fromAddress: `${PREFIX}-disable-after@example.com`,
      },
    );
    const afterEntered = deferred();
    const afterRelease = deferred();
    const persistedBeforeDisable = persist(
      `${PREFIX}-disable-after@example.com`,
      barrierRunner(afterEntered, afterRelease),
    );
    await afterEntered.promise;
    const disableAfter = rulesService.updateMailFilterRule(
      workspaceId,
      ownerId,
      afterRule.id,
      { isActive: false },
    );
    afterRelease.resolve();
    const committedAfter = await persistedBeforeDisable;
    await disableAfter;
    expect(await assignmentCount(committedAfter.id, afterLabel.id)).toBe(1);
  });

  it("linearizes delete before/after snapshot and preserves prior assignments", async () => {
    const beforeLabel = await createLabel("delete-before");
    const beforeRule = await rulesService.createMailFilterRule(
      workspaceId,
      ownerId,
      {
        accountId,
        labelId: beforeLabel.id,
        name: "Delete before",
        fromAddress: `${PREFIX}-delete-before@example.com`,
      },
    );
    const beforeEntered = deferred();
    const beforeRelease = deferred();
    const deleteBefore = rulesService.deleteMailFilterRule(
      workspaceId,
      ownerId,
      beforeRule.id,
      barrierRunner(beforeEntered, beforeRelease),
    );
    await beforeEntered.promise;
    const beforeMail = persist(`${PREFIX}-delete-before@example.com`);
    beforeRelease.resolve();
    await deleteBefore;
    const committedBefore = await beforeMail;
    expect(await assignmentCount(committedBefore.id, beforeLabel.id)).toBe(0);

    const afterLabel = await createLabel("delete-after");
    const afterRule = await rulesService.createMailFilterRule(
      workspaceId,
      ownerId,
      {
        accountId,
        labelId: afterLabel.id,
        name: "Delete after",
        fromAddress: `${PREFIX}-delete-after@example.com`,
      },
    );
    const afterEntered = deferred();
    const afterRelease = deferred();
    const persistedBeforeDelete = persist(
      `${PREFIX}-delete-after@example.com`,
      barrierRunner(afterEntered, afterRelease),
    );
    await afterEntered.promise;
    const deleteAfter = rulesService.deleteMailFilterRule(
      workspaceId,
      ownerId,
      afterRule.id,
    );
    afterRelease.resolve();
    const committedAfter = await persistedBeforeDelete;
    await deleteAfter;
    expect(await assignmentCount(committedAfter.id, afterLabel.id)).toBe(1);
  });
});
