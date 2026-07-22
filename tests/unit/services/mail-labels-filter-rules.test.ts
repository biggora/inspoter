import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import * as mailService from "@/lib/services/mail";
import { getOrCreateWebhookAccount } from "@/lib/services/mail-accounts";
import * as mailLabelsService from "@/lib/services/mail-labels";
import * as mailLabelAssignmentsService from "@/lib/services/mail-label-assignments";
import * as mailFilterRulesService from "@/lib/services/mail-filter-rules";
import { WorkspaceOwnerRequiredError } from "@/lib/services/workspace-auth";

const PREFIX = `mail-labels-${randomUUID()}`;
let workspaceId: string;
let otherWorkspaceId: string;
let ownerId: string;
let memberId: string;
let webhookAccountId: string;

beforeAll(async () => {
  const [workspace, otherWorkspace, owner, member] = await Promise.all([
    db.workspace.create({
      data: { name: `${PREFIX}-workspace`, slug: `${PREFIX}-workspace` },
    }),
    db.workspace.create({
      data: { name: `${PREFIX}-other`, slug: `${PREFIX}-other` },
    }),
    db.operator.create({ data: { username: `${PREFIX}-owner` } }),
    db.operator.create({ data: { username: `${PREFIX}-member` } }),
  ]);
  workspaceId = workspace.id;
  otherWorkspaceId = otherWorkspace.id;
  ownerId = owner.id;
  memberId = member.id;
  await db.workspaceMember.createMany({
    data: [
      { workspaceId, operatorId: ownerId, role: "OWNER" },
      { workspaceId, operatorId: memberId, role: "MEMBER" },
      { workspaceId: otherWorkspaceId, operatorId: ownerId, role: "OWNER" },
    ],
  });
  webhookAccountId = (await getOrCreateWebhookAccount(workspaceId)).account.id;
  await getOrCreateWebhookAccount(otherWorkspaceId);
});

afterAll(async () => {
  await db.workspace.deleteMany({
    where: { id: { in: [workspaceId, otherWorkspaceId] } },
  });
  await db.operator.deleteMany({
    where: { id: { in: [ownerId, memberId] } },
  });
});

describe("Mail label service", () => {
  it("normalizes uniqueness while preserving display casing", async () => {
    const label = await mailLabelsService.createLabel(workspaceId, ownerId, {
      name: "  Build\t Alerts  ",
      color: "#12ab34",
    });
    expect(label.name).toBe("Build Alerts");
    expect(label.color).toBe("#12AB34");

    await expect(
      mailLabelsService.createLabel(workspaceId, ownerId, {
        name: "build   alerts",
        color: "BLUE",
      }),
    ).rejects.toBeInstanceOf(mailLabelsService.MailLabelNameConflictError);
  });

  it("allows only owners to create definitions", async () => {
    await expect(
      mailLabelsService.createLabel(workspaceId, memberId, {
        name: "Member label",
        color: "SLATE",
      }),
    ).rejects.toBeInstanceOf(WorkspaceOwnerRequiredError);
  });

  it("enforces the transactional 100-label limit", async () => {
    const limitWorkspace = await db.workspace.create({
      data: { name: `${PREFIX}-limit`, slug: `${PREFIX}-limit` },
    });
    await db.workspaceMember.create({
      data: {
        workspaceId: limitWorkspace.id,
        operatorId: ownerId,
        role: "OWNER",
      },
    });
    await db.mailLabel.createMany({
      data: Array.from({ length: 100 }, (_, index) => ({
        id: randomUUID(),
        workspaceId: limitWorkspace.id,
        name: `Label ${index}`,
        normalizedName: `label ${index}`,
        color: "SLATE" as const,
        position: index,
      })),
    });

    await expect(
      mailLabelsService.createLabel(limitWorkspace.id, ownerId, {
        name: "One too many",
        color: "RED",
      }),
    ).rejects.toBeInstanceOf(mailLabelsService.MailLabelLimitReachedError);
    await db.workspace.delete({ where: { id: limitWorkspace.id } });
  });

  it("serializes concurrent creates at the 100-label boundary", async () => {
    const limitWorkspace = await db.workspace.create({
      data: { name: `${PREFIX}-race-limit`, slug: `${PREFIX}-race-limit` },
    });
    await db.workspaceMember.create({
      data: {
        workspaceId: limitWorkspace.id,
        operatorId: ownerId,
        role: "OWNER",
      },
    });
    await db.mailLabel.createMany({
      data: Array.from({ length: 99 }, (_, index) => ({
        id: randomUUID(),
        workspaceId: limitWorkspace.id,
        name: `Race label ${index}`,
        normalizedName: `race label ${index}`,
        color: "SLATE" as const,
        position: index,
      })),
    });

    const results = await Promise.allSettled([
      mailLabelsService.createLabel(limitWorkspace.id, ownerId, {
        name: "Concurrent A",
        color: "RED",
      }),
      mailLabelsService.createLabel(limitWorkspace.id, ownerId, {
        name: "Concurrent B",
        color: "BLUE",
      }),
    ]);

    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    const rejection = results.find((result) => result.status === "rejected");
    expect(rejection).toMatchObject({
      reason: expect.any(mailLabelsService.MailLabelLimitReachedError),
    });
    expect(
      await db.mailLabel.count({ where: { workspaceId: limitWorkspace.id } }),
    ).toBe(100);
    await db.workspace.delete({ where: { id: limitWorkspace.id } });
  });

  it("renames, recolors, reorders, and compacts positions atomically", async () => {
    const isolated = await db.workspace.create({
      data: { name: `${PREFIX}-crud`, slug: `${PREFIX}-crud` },
    });
    await db.workspaceMember.create({
      data: { workspaceId: isolated.id, operatorId: ownerId, role: "OWNER" },
    });
    const labels = [];
    for (const [index, color] of ["SLATE", "RED", "AMBER"].entries()) {
      labels.push(
        await mailLabelsService.createLabel(isolated.id, ownerId, {
          name: `CRUD ${index}`,
          color: color as "SLATE" | "RED" | "AMBER",
        }),
      );
    }

    const updated = await mailLabelsService.updateLabel(
      isolated.id,
      ownerId,
      labels[0].id,
      { name: "  Renamed\tLabel ", color: "VIOLET", position: 2 },
    );
    expect(updated).toMatchObject({
      name: "Renamed Label",
      color: "VIOLET",
      position: 2,
    });
    const ordered = await mailLabelsService.listLabels(isolated.id);
    expect(ordered.map(({ id, position }) => [id, position])).toEqual([
      [labels[1].id, 0],
      [labels[2].id, 1],
      [labels[0].id, 2],
    ]);
    await db.workspace.delete({ where: { id: isolated.id } });
  });

  it("rejects deletion for active or inactive rule references", async () => {
    for (const isActive of [true, false]) {
      const label = await mailLabelsService.createLabel(workspaceId, ownerId, {
        name: `Referenced ${isActive} ${randomUUID()}`,
        color: "GREEN",
      });
      await db.mailFilterRule.create({
        data: {
          workspaceId,
          accountId: webhookAccountId,
          accountWorkspaceId: workspaceId,
          labelId: label.id,
          labelWorkspaceId: workspaceId,
          name: `Reference ${isActive}`,
          fromAddress: `${isActive}@example.com`,
          isActive,
        },
      });

      await expect(
        mailLabelsService.deleteLabel(workspaceId, ownerId, label.id),
      ).rejects.toBeInstanceOf(mailLabelsService.MailLabelInUseError);
    }
  });

  it("deletes an unreferenced label and cascades assignments", async () => {
    const label = await mailLabelsService.createLabel(workspaceId, ownerId, {
      name: `Cascade ${randomUUID()}`,
      color: "BLUE",
    });
    const mail = await mailService.create(workspaceId, {
      sender: "cascade@example.com",
      subject: "Cascade",
      body: "body",
    });
    await mailLabelAssignmentsService.assignLabel(
      workspaceId,
      mail.id,
      label.id,
    );

    await mailLabelsService.deleteLabel(workspaceId, ownerId, label.id);

    expect(await db.mailItemLabel.count({ where: { labelId: label.id } })).toBe(
      0,
    );
    expect(
      await db.mailLabel.findUnique({ where: { id: label.id } }),
    ).toBeNull();
  });

  it("returns not-found before the owner gate for a foreign label", async () => {
    const foreign = await mailLabelsService.createLabel(
      otherWorkspaceId,
      ownerId,
      { name: `Foreign update ${randomUUID()}`, color: "RED" },
    );
    await expect(
      mailLabelsService.updateLabel(workspaceId, memberId, foreign.id, {
        color: "BLUE",
      }),
    ).rejects.toBeInstanceOf(mailLabelsService.MailLabelResourceNotFoundError);
  });
});

describe("Manual label assignment service", () => {
  it("assigns and removes idempotently under retries", async () => {
    const label = await mailLabelsService.createLabel(workspaceId, ownerId, {
      name: `Manual ${randomUUID()}`,
      color: "AMBER",
    });
    const mail = await mailService.create(workspaceId, {
      sender: "manual@example.com",
      subject: "Manual",
      body: "body",
    });
    const mailScope = await db.mailItem.findUniqueOrThrow({
      where: { id: mail.id },
      select: { accountId: true, folderId: true },
    });

    await Promise.all(
      Array.from({ length: 5 }, () =>
        mailLabelAssignmentsService.assignLabel(workspaceId, mail.id, label.id),
      ),
    );
    expect(
      await db.mailItemLabel.count({
        where: { mailItemId: mail.id, labelId: label.id },
      }),
    ).toBe(1);
    const scopedLabels = await mailLabelsService.listLabels(workspaceId, {
      accountId: mailScope.accountId,
      folderId: mailScope.folderId,
    });
    expect(
      scopedLabels.find((item) => item.id === label.id)?.messageCount,
    ).toBe(1);

    await mailLabelAssignmentsService.removeLabel(
      workspaceId,
      mail.id,
      label.id,
    );
    await mailLabelAssignmentsService.removeLabel(
      workspaceId,
      mail.id,
      label.id,
    );
    expect(
      await db.mailItemLabel.count({
        where: { mailItemId: mail.id, labelId: label.id },
      }),
    ).toBe(0);
    const labelsAfterRemoval = await mailLabelsService.listLabels(workspaceId, {
      accountId: mailScope.accountId,
      folderId: mailScope.folderId,
    });
    expect(
      labelsAfterRemoval.find((item) => item.id === label.id)?.messageCount,
    ).toBe(0);
  });

  it("rejects foreign message and label ids without writes", async () => {
    const ownLabel = await mailLabelsService.createLabel(workspaceId, ownerId, {
      name: `Own assignment ${randomUUID()}`,
      color: "SLATE",
    });
    const foreignLabel = await mailLabelsService.createLabel(
      otherWorkspaceId,
      ownerId,
      { name: `Foreign assignment ${randomUUID()}`, color: "RED" },
    );
    const ownMail = await mailService.create(workspaceId, {
      sender: "own-assignment@example.com",
      subject: "Own",
      body: "body",
    });
    const foreignMail = await mailService.create(otherWorkspaceId, {
      sender: "foreign-assignment@example.com",
      subject: "Foreign",
      body: "body",
    });

    await expect(
      mailLabelAssignmentsService.assignLabel(
        workspaceId,
        ownMail.id,
        foreignLabel.id,
      ),
    ).rejects.toBeInstanceOf(
      mailLabelAssignmentsService.MailLabelAssignmentResourceNotFoundError,
    );
    await expect(
      mailLabelAssignmentsService.assignLabel(
        workspaceId,
        foreignMail.id,
        ownLabel.id,
      ),
    ).rejects.toBeInstanceOf(
      mailLabelAssignmentsService.MailLabelAssignmentResourceNotFoundError,
    );
    expect(
      await db.mailItemLabel.count({
        where: {
          OR: [{ labelId: foreignLabel.id }, { mailItemId: foreignMail.id }],
        },
      }),
    ).toBe(0);
  });
});

describe("Exact-sender rule service and incoming evaluator", () => {
  it("rejects an account or label from another workspace", async () => {
    const foreignLabel = await mailLabelsService.createLabel(
      otherWorkspaceId,
      ownerId,
      { name: "Foreign", color: "RED" },
    );
    await expect(
      mailFilterRulesService.createExactSenderRule(workspaceId, ownerId, {
        accountId: webhookAccountId,
        labelId: foreignLabel.id,
        name: "Foreign label",
        fromAddress: "foreign@example.com",
      }),
    ).rejects.toBeInstanceOf(
      mailFilterRulesService.MailFilterRuleResourceNotFoundError,
    );
  });

  it("resolves foreign list/create ids before the member owner gate", async () => {
    const foreignAccount = await db.mailAccount.findFirstOrThrow({
      where: { workspaceId: otherWorkspaceId },
      select: { id: true },
    });
    const [localLabel, foreignLabel] = await Promise.all([
      mailLabelsService.createLabel(workspaceId, ownerId, {
        name: "Member local resource",
        color: "BLUE",
      }),
      mailLabelsService.createLabel(otherWorkspaceId, ownerId, {
        name: "Member foreign resource",
        color: "RED",
      }),
    ]);

    await expect(
      mailFilterRulesService.listMailFilterRules(
        workspaceId,
        memberId,
        foreignAccount.id,
      ),
    ).rejects.toBeInstanceOf(
      mailFilterRulesService.MailFilterRuleResourceNotFoundError,
    );
    await expect(
      mailFilterRulesService.listMailFilterRules(
        workspaceId,
        memberId,
        webhookAccountId,
      ),
    ).rejects.toBeInstanceOf(WorkspaceOwnerRequiredError);

    for (const input of [
      { accountId: foreignAccount.id, labelId: localLabel.id },
      { accountId: webhookAccountId, labelId: foreignLabel.id },
    ]) {
      await expect(
        mailFilterRulesService.createMailFilterRule(workspaceId, memberId, {
          ...input,
          name: "Member foreign create",
          fromAddress: "member-foreign@example.com",
        }),
      ).rejects.toBeInstanceOf(
        mailFilterRulesService.MailFilterRuleResourceNotFoundError,
      );
    }

    const before = await db.mailFilterRule.count({ where: { workspaceId } });
    await expect(
      mailFilterRulesService.createMailFilterRule(workspaceId, memberId, {
        accountId: webhookAccountId,
        labelId: localLabel.id,
        name: "Member local create",
        fromAddress: "member-local@example.com",
      }),
    ).rejects.toBeInstanceOf(WorkspaceOwnerRequiredError);
    expect(await db.mailFilterRule.count({ where: { workspaceId } })).toBe(
      before,
    );
  });

  it("maps a concurrent account or label FK failure to resource not found", async () => {
    const transaction = vi.spyOn(db, "$transaction").mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError(
        "Foreign key constraint failed",
        {
          code: "P2003",
          clientVersion: "test",
        },
      ),
    );

    try {
      await expect(
        mailFilterRulesService.createExactSenderRule(workspaceId, ownerId, {
          accountId: webhookAccountId,
          labelId: "concurrently-deleted-label",
          name: "Concurrent delete",
          fromAddress: "concurrent-delete@example.com",
        }),
      ).rejects.toBeInstanceOf(
        mailFilterRulesService.MailFilterRuleResourceNotFoundError,
      );
    } finally {
      transaction.mockRestore();
    }
  });

  it("labels only canonical exact-sender matches", async () => {
    const label = await mailLabelsService.createLabel(workspaceId, ownerId, {
      name: "Exact sender",
      color: "GREEN",
    });
    await mailFilterRulesService.createExactSenderRule(workspaceId, ownerId, {
      accountId: webhookAccountId,
      labelId: label.id,
      name: "Alice",
      fromAddress: "Alice@Example.com",
    });

    const matching = await mailService.create(workspaceId, {
      sender: "  alice@example.COM ",
      subject: "Matching",
      body: "body",
    });
    const nonMatching = await mailService.create(workspaceId, {
      sender: "prefix-alice@example.com",
      subject: "Not matching",
      body: "body",
    });

    const assignments = await db.mailItemLabel.findMany({
      where: { mailItemId: { in: [matching.id, nonMatching.id] } },
    });
    expect(assignments).toEqual([
      expect.objectContaining({ mailItemId: matching.id, labelId: label.id }),
    ]);
  });

  it("matches subject-only and sender-plus-subject rules canonically", async () => {
    const [subjectLabel, andLabel] = await Promise.all([
      mailLabelsService.createLabel(workspaceId, ownerId, {
        name: "Subject only",
        color: "AMBER",
      }),
      mailLabelsService.createLabel(workspaceId, ownerId, {
        name: "Sender and subject",
        color: "RED",
      }),
    ]);
    await mailFilterRulesService.createMailFilterRule(workspaceId, ownerId, {
      accountId: webhookAccountId,
      labelId: subjectLabel.id,
      name: "Unicode subject",
      subjectContains: " ＡLERT ",
    });
    await mailFilterRulesService.createMailFilterRule(workspaceId, ownerId, {
      accountId: webhookAccountId,
      labelId: andLabel.id,
      name: "Canonical AND",
      fromAddress: "Ops@Example.com",
      subjectContains: " incident ",
    });

    const matching = await mailService.create(workspaceId, {
      sender: " ops@example.COM ",
      subject: "Production alert: INCIDENT detected",
      body: "body",
    });
    const wrongSender = await mailService.create(workspaceId, {
      sender: "other@example.com",
      subject: "Production alert: incident detected",
      body: "body",
    });

    expect(
      await db.mailItemLabel.findMany({
        where: { mailItemId: matching.id },
        select: { labelId: true },
        orderBy: { labelId: "asc" },
      }),
    ).toEqual(
      [{ labelId: subjectLabel.id }, { labelId: andLabel.id }].sort((a, b) =>
        a.labelId.localeCompare(b.labelId),
      ),
    );
    expect(
      await db.mailItemLabel.findMany({
        where: { mailItemId: wrongSender.id },
        select: { labelId: true },
      }),
    ).toEqual([{ labelId: subjectLabel.id }]);
  });

  it("edits, disables, enables, reorders, and deletes without removing assignments", async () => {
    const [originalLabel, futureLabel] = await Promise.all([
      mailLabelsService.createLabel(workspaceId, ownerId, {
        name: "Lifecycle original",
        color: "SLATE",
      }),
      mailLabelsService.createLabel(workspaceId, ownerId, {
        name: "Lifecycle future",
        color: "GREEN",
      }),
    ]);
    const sender = `${PREFIX}-lifecycle@example.com`;
    const rule = await mailFilterRulesService.createMailFilterRule(
      workspaceId,
      ownerId,
      {
        accountId: webhookAccountId,
        labelId: originalLabel.id,
        name: "Lifecycle original",
        fromAddress: sender,
      },
    );
    const historical = await mailService.create(workspaceId, {
      sender,
      subject: "Before edit",
      body: "body",
    });

    const updated = await mailFilterRulesService.updateMailFilterRule(
      workspaceId,
      ownerId,
      rule.id,
      {
        name: "Lifecycle updated",
        labelId: futureLabel.id,
        fromAddress: null,
        subjectContains: "future incident",
        isActive: false,
        position: 0,
      },
    );
    expect(updated).toEqual(
      expect.objectContaining({
        name: "Lifecycle updated",
        labelId: futureLabel.id,
        fromAddress: null,
        subjectContains: "future incident",
        isActive: false,
        position: 0,
      }),
    );
    expect(
      await db.mailItemLabel.count({
        where: { mailItemId: historical.id, labelId: originalLabel.id },
      }),
    ).toBe(1);

    const whileDisabled = await mailService.create(workspaceId, {
      sender: "any@example.com",
      subject: "Future incident while disabled",
      body: "body",
    });
    expect(
      await db.mailItemLabel.count({
        where: { mailItemId: whileDisabled.id, labelId: futureLabel.id },
      }),
    ).toBe(0);

    await mailFilterRulesService.updateMailFilterRule(
      workspaceId,
      ownerId,
      rule.id,
      { isActive: true },
    );
    const whileEnabled = await mailService.create(workspaceId, {
      sender: "any@example.com",
      subject: "Future INCIDENT while enabled",
      body: "body",
    });
    expect(
      await db.mailItemLabel.count({
        where: { mailItemId: whileEnabled.id, labelId: futureLabel.id },
      }),
    ).toBe(1);

    await mailFilterRulesService.deleteMailFilterRule(
      workspaceId,
      ownerId,
      rule.id,
    );
    expect(
      await db.mailItemLabel.count({
        where: { mailItemId: whileEnabled.id, labelId: futureLabel.id },
      }),
    ).toBe(1);
    const afterDelete = await mailService.create(workspaceId, {
      sender: "any@example.com",
      subject: "Future incident after delete",
      body: "body",
    });
    expect(
      await db.mailItemLabel.count({
        where: { mailItemId: afterDelete.id, labelId: futureLabel.id },
      }),
    ).toBe(0);
  });

  it("rejects clearing the final predicate", async () => {
    const label = await mailLabelsService.createLabel(workspaceId, ownerId, {
      name: "Predicate required",
      color: "BLUE",
    });
    const rule = await mailFilterRulesService.createMailFilterRule(
      workspaceId,
      ownerId,
      {
        accountId: webhookAccountId,
        labelId: label.id,
        name: "Predicate required",
        fromAddress: "required@example.com",
      },
    );
    await expect(
      mailFilterRulesService.updateMailFilterRule(
        workspaceId,
        ownerId,
        rule.id,
        { fromAddress: null },
      ),
    ).rejects.toBeInstanceOf(
      mailFilterRulesService.MailFilterRulePredicateRequiredError,
    );
  });

  it("deduplicates overlapping rules targeting one label", async () => {
    const label = await mailLabelsService.createLabel(workspaceId, ownerId, {
      name: "Deduplicated",
      color: "VIOLET",
    });
    for (const name of ["First", "Second"]) {
      await mailFilterRulesService.createExactSenderRule(workspaceId, ownerId, {
        accountId: webhookAccountId,
        labelId: label.id,
        name,
        fromAddress: "duplicate@example.com",
      });
    }
    const mail = await mailService.create(workspaceId, {
      sender: "duplicate@example.com",
      subject: "One assignment",
      body: "body",
    });
    expect(
      await db.mailItemLabel.count({
        where: { mailItemId: mail.id, labelId: label.id },
      }),
    ).toBe(1);
  });

  it("returns label metadata while list DTO remains body-free", async () => {
    const label = await mailLabelsService.createLabel(workspaceId, ownerId, {
      name: "DTO label",
      color: "BLUE",
    });
    await mailFilterRulesService.createExactSenderRule(workspaceId, ownerId, {
      accountId: webhookAccountId,
      labelId: label.id,
      name: "DTO sender",
      fromAddress: "dto-label@example.com",
    });
    await mailService.create(workspaceId, {
      sender: "dto-label@example.com",
      subject: "DTO metadata",
      body: `${"Visible snippet ".repeat(12)}FULL_BODY_ONLY_SENTINEL`,
    });

    const result = await mailService.list(workspaceId, {
      from: "dto-label@example.com",
    });
    const dto = mailService.toMailListItemDto(result.items[0]);
    expect(dto.labels).toEqual([
      { id: label.id, name: "DTO label", color: "BLUE" },
    ]);
    expect(dto).not.toHaveProperty("bodyText");
    expect(dto).not.toHaveProperty("bodyHtml");
    expect(JSON.stringify(dto)).not.toContain("FULL_BODY_ONLY_SENTINEL");
  });

  it("enforces the 100-active-rule account limit", async () => {
    const account = await db.mailAccount.create({
      data: {
        workspaceId,
        kind: "IMAP",
        mode: "MOCK",
        name: `${PREFIX}-limit-account`,
        email: "limit@example.com",
      },
    });
    const label = await mailLabelsService.createLabel(workspaceId, ownerId, {
      name: "Rule limit label",
      color: "SLATE",
    });
    await db.mailFilterRule.createMany({
      data: Array.from({ length: 100 }, (_, index) => ({
        id: randomUUID(),
        workspaceId,
        accountId: account.id,
        accountWorkspaceId: workspaceId,
        labelId: label.id,
        labelWorkspaceId: workspaceId,
        name: `Rule ${index}`,
        fromAddress: `sender-${index}@example.com`,
        position: index,
      })),
    });

    await expect(
      mailFilterRulesService.createExactSenderRule(workspaceId, ownerId, {
        accountId: account.id,
        labelId: label.id,
        name: "One too many",
        fromAddress: "overflow@example.com",
      }),
    ).rejects.toBeInstanceOf(
      mailFilterRulesService.ActiveMailFilterRuleLimitReachedError,
    );

    const inactive = await db.mailFilterRule.create({
      data: {
        workspaceId,
        accountId: account.id,
        accountWorkspaceId: workspaceId,
        labelId: label.id,
        labelWorkspaceId: workspaceId,
        name: "Inactive overflow",
        fromAddress: "inactive-overflow@example.com",
        isActive: false,
        position: 100,
      },
    });
    await expect(
      mailFilterRulesService.updateMailFilterRule(
        workspaceId,
        ownerId,
        inactive.id,
        { isActive: true },
      ),
    ).rejects.toBeInstanceOf(
      mailFilterRulesService.ActiveMailFilterRuleLimitReachedError,
    );
  });

  it("serializes concurrent enables at the active-rule boundary", async () => {
    const account = await db.mailAccount.create({
      data: {
        workspaceId,
        kind: "IMAP",
        mode: "MOCK",
        name: `${PREFIX}-concurrent-enable-account`,
        email: "concurrent-enable@example.com",
      },
    });
    const label = await mailLabelsService.createLabel(workspaceId, ownerId, {
      name: "Concurrent enable label",
      color: "GREEN",
    });
    await db.mailFilterRule.createMany({
      data: Array.from({ length: 99 }, (_, index) => ({
        id: randomUUID(),
        workspaceId,
        accountId: account.id,
        accountWorkspaceId: workspaceId,
        labelId: label.id,
        labelWorkspaceId: workspaceId,
        name: `Concurrent active ${index}`,
        fromAddress: `concurrent-active-${index}@example.com`,
        position: index,
      })),
    });
    const inactiveRules = await Promise.all(
      [99, 100].map((position) =>
        db.mailFilterRule.create({
          data: {
            workspaceId,
            accountId: account.id,
            accountWorkspaceId: workspaceId,
            labelId: label.id,
            labelWorkspaceId: workspaceId,
            name: `Concurrent inactive ${position}`,
            fromAddress: `concurrent-inactive-${position}@example.com`,
            isActive: false,
            position,
          },
        }),
      ),
    );

    const results = await Promise.allSettled(
      inactiveRules.map((rule) =>
        mailFilterRulesService.updateMailFilterRule(
          workspaceId,
          ownerId,
          rule.id,
          { isActive: true },
        ),
      ),
    );
    expect(results.filter(({ status }) => status === "fulfilled")).toHaveLength(
      1,
    );
    expect(results.filter(({ status }) => status === "rejected")).toHaveLength(
      1,
    );
    expect(
      await db.mailFilterRule.count({
        where: { accountId: account.id, isActive: true },
      }),
    ).toBe(100);
  });
});
