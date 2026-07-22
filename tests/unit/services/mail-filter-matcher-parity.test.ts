import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { MockMailDriver, resetMockMailStore } from "@/lib/mail/mock";
import * as mailService from "@/lib/services/mail";
import { getOrCreateWebhookAccount } from "@/lib/services/mail-accounts";
import { createMailFilterRule } from "@/lib/services/mail-filter-rules";
import { syncAccount } from "@/lib/services/mail-sync";
import { MAIL_FILTER_MATCH_CONTRACT_CASES } from "../mail/filter-matcher-contract";

const PREFIX = `mail-filter-parity-${randomUUID()}`;
let workspaceId: string;
let ownerId: string;
let webhookAccountId: string;

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
  webhookAccountId = (await getOrCreateWebhookAccount(workspaceId)).account.id;
});

afterAll(async () => {
  resetMockMailStore();
  if (workspaceId) {
    await db.workspace.delete({ where: { id: workspaceId } }).catch(() => {});
  }
  if (ownerId) {
    await db.operator.delete({ where: { id: ownerId } }).catch(() => {});
  }
});

async function installContractRules(accountId: string, scope: string) {
  const installed = new Map<string, string>();
  for (const [position, vector] of MAIL_FILTER_MATCH_CONTRACT_CASES.entries()) {
    const label = await db.mailLabel.create({
      data: {
        workspaceId,
        name: `${scope}-${vector.id}`,
        normalizedName: `${PREFIX}-${scope}-${vector.id}`,
        color: "VIOLET",
        position,
      },
    });
    await createMailFilterRule(workspaceId, ownerId, {
      accountId,
      labelId: label.id,
      name: `${scope}-${vector.id}`,
      ...vector.rule,
    });
    installed.set(vector.id, label.id);
  }
  return installed;
}

describe("shared matcher live-path parity", () => {
  it("runs identical contract vectors through live webhook persistence", async () => {
    const labels = await installContractRules(webhookAccountId, "webhook");

    for (const vector of MAIL_FILTER_MATCH_CONTRACT_CASES) {
      // mailService.create is the production dispatch target for /webhooks/mail.
      const item = await mailService.create(workspaceId, {
        sender: vector.candidate.fromAddress,
        subject: vector.candidate.subject,
        body: `Webhook contract ${vector.id}`,
      });
      expect(
        await db.mailItemLabel.count({
          where: { mailItemId: item.id, labelId: labels.get(vector.id)! },
        }),
        vector.id,
      ).toBe(vector.expected ? 1 : 0);
    }
  });

  it("runs identical contract vectors through live IMAP import", async () => {
    resetMockMailStore();
    const account = await db.mailAccount.create({
      data: {
        workspaceId,
        kind: "IMAP",
        mode: "MOCK",
        name: `${PREFIX}-imap`,
        email: "parity@example.com",
      },
    });
    const labels = await installContractRules(account.id, "imap");
    const driver = new MockMailDriver(account.id);
    for (const vector of MAIL_FILTER_MATCH_CONTRACT_CASES) {
      await driver.append(
        "INBOX",
        Buffer.from(
          [
            `Message-ID: <${vector.id}@contract.test>`,
            `From: ${vector.candidate.fromAddress}`,
            `Subject: ${vector.candidate.subject}`,
            "",
            `IMAP contract ${vector.id}`,
          ].join("\r\n"),
          "utf8",
        ),
        [],
      );
    }

    await expect(syncAccount(account.id, workspaceId)).resolves.toMatchObject({
      status: "synced",
    });
    for (const [index, vector] of MAIL_FILTER_MATCH_CONTRACT_CASES.entries()) {
      const item = await db.mailItem.findFirstOrThrow({
        where: { accountId: account.id, uid: BigInt(31 + index) },
        select: { id: true },
      });
      expect(
        await db.mailItemLabel.count({
          where: { mailItemId: item.id, labelId: labels.get(vector.id)! },
        }),
        vector.id,
      ).toBe(vector.expected ? 1 : 0);
    }
  });
});
