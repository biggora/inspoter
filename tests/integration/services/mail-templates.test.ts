import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import * as mailTemplates from "@/lib/services/mail-templates";
import { WorkspaceMemberRequiredError } from "@/lib/services/workspace-auth";

const PREFIX = `mail-templates-${randomUUID()}`;
let workspaceId: string;
let otherWorkspaceId: string;
let ownerId: string;
let memberId: string;

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
});

afterAll(async () => {
  await db.workspace.deleteMany({
    where: { id: { in: [workspaceId, otherWorkspaceId] } },
  });
  await db.operator.deleteMany({
    where: { id: { in: [ownerId, memberId] } },
  });
});

describe("mail template service", () => {
  it("lets members create tagged templates and list them by search/tag/star", async () => {
    const tag = await mailTemplates.createMailTemplateTag(
      workspaceId,
      memberId,
      { name: " Billing ", color: "#12ab34" },
    );
    const template = await mailTemplates.createMailTemplate(
      workspaceId,
      memberId,
      {
        name: " Invoice reminder ",
        subject: "Invoice {{number}}",
        bodyText: "Hello {{name}}",
        bodyHtml: '<p>Hello {{name}}<script>alert("x")</script></p>',
        starred: true,
        tagIds: [tag.id],
      },
    );

    expect(template.name).toBe("Invoice reminder");
    expect(template.bodyHtml).not.toContain("script");
    expect(template.variables).toEqual(["number", "name"]);
    await expect(
      mailTemplates.createMailTemplate(workspaceId, ownerId, {
        name: "invoice   reminder",
        subject: "Duplicate",
        bodyText: "Duplicate",
        bodyHtml: "<p>Duplicate</p>",
        starred: false,
        tagIds: [],
      }),
    ).rejects.toBeInstanceOf(mailTemplates.MailTemplateNameConflictError);

    const result = await mailTemplates.listMailTemplates(workspaceId, {
      query: "invoice",
      tagId: tag.id,
      starred: true,
      page: 1,
      pageSize: 24,
    });
    expect(result.items.map((item) => item.id)).toContain(template.id);
  });

  it("isolates reads and writes by workspace", async () => {
    const created = await mailTemplates.createMailTemplate(
      workspaceId,
      ownerId,
      {
        name: `Isolated ${randomUUID()}`,
        subject: "Subject",
        bodyText: "Body",
        bodyHtml: "<p>Body</p>",
        starred: false,
        tagIds: [],
      },
    );
    await expect(
      mailTemplates.getMailTemplate(otherWorkspaceId, created.id),
    ).rejects.toBeInstanceOf(mailTemplates.MailTemplateNotFoundError);
    await expect(
      mailTemplates.updateMailTemplate(workspaceId, randomUUID(), created.id, {
        starred: true,
      }),
    ).rejects.toBeInstanceOf(WorkspaceMemberRequiredError);
  });

  it("orders starred templates first and paginates deterministically", async () => {
    const search = `Ordering ${randomUUID()}`;
    const older = await mailTemplates.createMailTemplate(workspaceId, ownerId, {
      name: `${search} older`,
      subject: search,
      bodyText: "Older",
      bodyHtml: "<p>Older</p>",
      starred: false,
      tagIds: [],
    });
    const newer = await mailTemplates.createMailTemplate(workspaceId, ownerId, {
      name: `${search} newer`,
      subject: search,
      bodyText: "Newer",
      bodyHtml: "<p>Newer</p>",
      starred: false,
      tagIds: [],
    });
    const starred = await mailTemplates.createMailTemplate(
      workspaceId,
      ownerId,
      {
        name: `${search} starred`,
        subject: search,
        bodyText: "Starred",
        bodyHtml: "<p>Starred</p>",
        starred: true,
        tagIds: [],
      },
    );
    await Promise.all([
      db.mailTemplate.update({
        where: { id: older.id },
        data: { updatedAt: new Date("2026-01-01T00:00:00.000Z") },
      }),
      db.mailTemplate.update({
        where: { id: newer.id },
        data: { updatedAt: new Date("2026-01-03T00:00:00.000Z") },
      }),
      db.mailTemplate.update({
        where: { id: starred.id },
        data: { updatedAt: new Date("2026-01-02T00:00:00.000Z") },
      }),
    ]);

    const firstPage = await mailTemplates.listMailTemplates(workspaceId, {
      query: search,
      page: 1,
      pageSize: 2,
    });
    const secondPage = await mailTemplates.listMailTemplates(workspaceId, {
      query: search,
      page: 2,
      pageSize: 2,
    });
    expect(firstPage.total).toBe(3);
    expect(firstPage.items.map((template) => template.id)).toEqual([
      starred.id,
      newer.id,
    ]);
    expect(secondPage.items.map((template) => template.id)).toEqual([older.id]);
  });

  it("updates tags and cascades tag/template deletions", async () => {
    const tag = await mailTemplates.createMailTemplateTag(
      workspaceId,
      ownerId,
      {
        name: `Operations ${randomUUID()}`,
        color: "BLUE",
      },
    );
    const template = await mailTemplates.createMailTemplate(
      workspaceId,
      ownerId,
      {
        name: `Maintenance ${randomUUID()}`,
        subject: "Maintenance",
        bodyText: "Body",
        bodyHtml: "<p>Body</p>",
        starred: false,
        tagIds: [tag.id],
      },
    );
    const updated = await mailTemplates.updateMailTemplate(
      workspaceId,
      memberId,
      template.id,
      { starred: true },
    );
    expect(updated.starred).toBe(true);
    expect(updated.tags.map((candidate) => candidate.id)).toEqual([tag.id]);

    await mailTemplates.deleteMailTemplateTag(workspaceId, ownerId, tag.id);
    expect(
      await db.mailTemplateTagLink.count({
        where: { workspaceId, templateId: template.id },
      }),
    ).toBe(0);

    const secondTag = await mailTemplates.createMailTemplateTag(
      workspaceId,
      ownerId,
      { name: `Cleanup ${randomUUID()}`, color: "GREEN" },
    );
    await mailTemplates.updateMailTemplate(workspaceId, ownerId, template.id, {
      tagIds: [secondTag.id],
    });
    await mailTemplates.deleteMailTemplate(workspaceId, ownerId, template.id);
    expect(
      await db.mailTemplateTagLink.count({
        where: { workspaceId, templateId: template.id },
      }),
    ).toBe(0);
    await expect(
      mailTemplates.getMailTemplate(workspaceId, template.id),
    ).rejects.toBeInstanceOf(mailTemplates.MailTemplateNotFoundError);
  });
});
