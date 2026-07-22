import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type { AuthContext } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { getOrCreateWebhookAccount } from "@/lib/services/mail-accounts";
import * as mailService from "@/lib/services/mail";

const auth = vi.hoisted(() => ({
  context: null as AuthContext | null,
}));

vi.mock("@/lib/auth/dal", () => ({
  requireAuthWithWorkspaceHeader: vi.fn(async () => auth.context!),
}));

const PREFIX = `mail-label-routes-${randomUUID()}`;
let workspaceId: string;
let otherWorkspaceId: string;
let ownerId: string;
let memberId: string;
let accountId: string;

function request(
  path: string,
  init?: ConstructorParameters<typeof NextRequest>[1],
) {
  return new NextRequest(`http://localhost${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "X-Inspoter-Workspace": workspaceId,
      ...Object.fromEntries(new Headers(init?.headers)),
    },
  });
}

function context(operatorId: string, username: string): AuthContext {
  return {
    workspace: {
      id: workspaceId,
      name: `${PREFIX}-workspace`,
      slug: `${PREFIX}-workspace`,
      hiddenSections: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    operator: {
      id: operatorId,
      username,
      email: null,
      passwordHash: null,
      defaultWorkspaceId: null,
      createdAt: new Date(),
    },
  };
}

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
  accountId = (await getOrCreateWebhookAccount(workspaceId)).account.id;
});

beforeEach(() => {
  auth.context = context(ownerId, `${PREFIX}-owner`);
});

afterAll(async () => {
  await db.workspace.deleteMany({
    where: { id: { in: [workspaceId, otherWorkspaceId] } },
  });
  await db.operator.deleteMany({
    where: { id: { in: [ownerId, memberId] } },
  });
});

describe("Mail label routes", () => {
  it("creates a normalized label and lets members list workspace labels", async () => {
    const { GET, POST } = await import("@/app/api/mail/labels/route");
    const createResponse = await POST(
      request("/api/mail/labels", {
        method: "POST",
        body: JSON.stringify({ name: "  API\tAlerts  ", color: "AMBER" }),
      }),
    );
    expect(createResponse.status).toBe(201);
    expect(await createResponse.json()).toMatchObject({
      name: "API Alerts",
      color: "AMBER",
    });

    auth.context = context(memberId, `${PREFIX}-member`);
    const listResponse = await GET(request("/api/mail/labels"));
    expect(listResponse.status).toBe(200);
    expect(await listResponse.json()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "API Alerts",
          color: "AMBER",
          messageCount: 0,
        }),
      ]),
    );
  });

  it("rejects member creation and strict invalid bodies", async () => {
    const { POST } = await import("@/app/api/mail/labels/route");
    auth.context = context(memberId, `${PREFIX}-member`);
    const denied = await POST(
      request("/api/mail/labels", {
        method: "POST",
        body: JSON.stringify({ name: "Denied", color: "SLATE" }),
      }),
    );
    expect(denied.status).toBe(403);

    auth.context = context(ownerId, `${PREFIX}-owner`);
    const invalid = await POST(
      request("/api/mail/labels", {
        method: "POST",
        body: JSON.stringify({
          name: "Unexpected",
          color: "BLUE",
          unexpected: true,
        }),
      }),
    );
    expect(invalid.status).toBe(400);
  });

  it("rejects query parameters on label listing", async () => {
    const { GET } = await import("@/app/api/mail/labels/route");
    const response = await GET(request("/api/mail/labels?unexpected=1"));
    expect(response.status).toBe(400);
    const incompleteScope = await GET(
      request("/api/mail/labels?accountId=account-only"),
    );
    expect(incompleteScope.status).toBe(400);
  });

  it("updates labels and returns LABEL_IN_USE for inactive rule references", async () => {
    const label = await db.mailLabel.create({
      data: {
        workspaceId,
        name: "Patch route",
        normalizedName: `patch-route-${randomUUID()}`,
        color: "SLATE",
      },
    });
    const route = await import("@/app/api/mail/labels/[id]/route");
    const patched = await route.PATCH(
      request(`/api/mail/labels/${label.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: "  Patched\tRoute ",
          color: "VIOLET",
        }),
      }),
      { params: Promise.resolve({ id: label.id }) },
    );
    expect(patched.status).toBe(200);
    expect(await patched.json()).toMatchObject({
      id: label.id,
      name: "Patched Route",
      color: "VIOLET",
    });

    await db.mailFilterRule.create({
      data: {
        workspaceId,
        accountId,
        accountWorkspaceId: workspaceId,
        labelId: label.id,
        labelWorkspaceId: workspaceId,
        name: "Inactive reference",
        fromAddress: "inactive-route@example.com",
        isActive: false,
      },
    });
    const deleted = await route.DELETE(
      request(`/api/mail/labels/${label.id}`, { method: "DELETE" }),
      { params: Promise.resolve({ id: label.id }) },
    );
    expect(deleted.status).toBe(409);
    expect(await deleted.json()).toEqual({ error: "LABEL_IN_USE" });
  });

  it("returns foreign-label 404 before member authorization", async () => {
    const foreign = await db.mailLabel.create({
      data: {
        workspaceId: otherWorkspaceId,
        name: "Foreign member patch",
        normalizedName: `foreign-member-${randomUUID()}`,
        color: "RED",
      },
    });
    auth.context = context(memberId, `${PREFIX}-member`);
    const { PATCH } = await import("@/app/api/mail/labels/[id]/route");
    const response = await PATCH(
      request(`/api/mail/labels/${foreign.id}`, {
        method: "PATCH",
        body: JSON.stringify({ color: "BLUE" }),
      }),
      { params: Promise.resolve({ id: foreign.id }) },
    );
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "RESOURCE_NOT_FOUND" });
  });
});

describe("Manual label assignment routes", () => {
  it("lets a member add and remove a label idempotently", async () => {
    const label = await db.mailLabel.create({
      data: {
        workspaceId,
        name: "Member assignment",
        normalizedName: `member-assignment-${randomUUID()}`,
        color: "GREEN",
      },
    });
    const mail = await mailService.create(workspaceId, {
      sender: "member-route@example.com",
      subject: "Member route",
      body: "body",
    });
    auth.context = context(memberId, `${PREFIX}-member`);
    const route = await import("@/app/api/mail/[id]/labels/[labelId]/route");
    const routeContext = {
      params: Promise.resolve({ id: mail.id, labelId: label.id }),
    };

    const first = await route.PUT(
      request(`/api/mail/${mail.id}/labels/${label.id}`, { method: "PUT" }),
      routeContext,
    );
    const second = await route.PUT(
      request(`/api/mail/${mail.id}/labels/${label.id}`, { method: "PUT" }),
      routeContext,
    );
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({
      id: label.id,
      name: label.name,
      color: label.color,
    });
    expect(second.status).toBe(200);
    expect(
      await db.mailItemLabel.count({
        where: { mailItemId: mail.id, labelId: label.id },
      }),
    ).toBe(1);

    const removed = await route.DELETE(
      request(`/api/mail/${mail.id}/labels/${label.id}`, {
        method: "DELETE",
      }),
      routeContext,
    );
    const removedAgain = await route.DELETE(
      request(`/api/mail/${mail.id}/labels/${label.id}`, {
        method: "DELETE",
      }),
      routeContext,
    );
    expect(removed.status).toBe(204);
    expect(removedAgain.status).toBe(204);
  });

  it("returns 404 and writes nothing for a foreign label", async () => {
    const foreign = await db.mailLabel.create({
      data: {
        workspaceId: otherWorkspaceId,
        name: "Foreign route assignment",
        normalizedName: `foreign-route-assignment-${randomUUID()}`,
        color: "RED",
      },
    });
    const mail = await mailService.create(workspaceId, {
      sender: "foreign-route@example.com",
      subject: "Foreign route",
      body: "body",
    });
    const { PUT } = await import("@/app/api/mail/[id]/labels/[labelId]/route");
    const response = await PUT(
      request(`/api/mail/${mail.id}/labels/${foreign.id}`, { method: "PUT" }),
      { params: Promise.resolve({ id: mail.id, labelId: foreign.id }) },
    );
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "RESOURCE_NOT_FOUND" });
    expect(
      await db.mailItemLabel.count({
        where: { mailItemId: mail.id, labelId: foreign.id },
      }),
    ).toBe(0);
  });

  it("returns 404 and writes nothing for a foreign message", async () => {
    const label = await db.mailLabel.create({
      data: {
        workspaceId,
        name: "Foreign message route assignment",
        normalizedName: `foreign-message-route-${randomUUID()}`,
        color: "BLUE",
      },
    });
    const foreignMail = await mailService.create(otherWorkspaceId, {
      sender: "foreign-message-route@example.com",
      subject: "Foreign message route",
      body: "body",
    });
    const { PUT } = await import("@/app/api/mail/[id]/labels/[labelId]/route");
    const response = await PUT(
      request(`/api/mail/${foreignMail.id}/labels/${label.id}`, {
        method: "PUT",
      }),
      { params: Promise.resolve({ id: foreignMail.id, labelId: label.id }) },
    );
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "RESOURCE_NOT_FOUND" });
    expect(
      await db.mailItemLabel.count({
        where: { mailItemId: foreignMail.id, labelId: label.id },
      }),
    ).toBe(0);
  });
});

describe("Mail list route validation", () => {
  it("rejects unknown query parameters strictly", async () => {
    const { GET } = await import("@/app/api/mail/route");
    const response = await GET(request("/api/mail?unexpected=1"));
    expect(response.status).toBe(400);
  });

  it("returns a non-disclosing 404 for a foreign label filter", async () => {
    const foreign = await db.mailLabel.create({
      data: {
        workspaceId: otherWorkspaceId,
        name: "Foreign list filter",
        normalizedName: `foreign-list-${randomUUID()}`,
        color: "AMBER",
      },
    });
    const { GET } = await import("@/app/api/mail/route");
    const response = await GET(request(`/api/mail?labelId=${foreign.id}`));
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "RESOURCE_NOT_FOUND" });
  });
});

describe("Mail filter-rule routes", () => {
  it("creates and lists a stable workspace-scoped rule", async () => {
    const label = await db.mailLabel.create({
      data: {
        workspaceId,
        name: "Route rule",
        normalizedName: `route-rule-${randomUUID()}`,
        color: "GREEN",
      },
    });
    const { GET, POST } = await import("@/app/api/mail/filter-rules/route");
    const createResponse = await POST(
      request("/api/mail/filter-rules", {
        method: "POST",
        body: JSON.stringify({
          accountId,
          labelId: label.id,
          name: "Build sender",
          fromAddress: "  BUILD@example.com  ",
        }),
      }),
    );
    expect(createResponse.status).toBe(201);
    expect(await createResponse.json()).toMatchObject({
      accountId,
      labelId: label.id,
      fromAddress: "BUILD@example.com",
      label: { name: "Route rule", color: "GREEN" },
    });

    const listResponse = await GET(
      request(`/api/mail/filter-rules?accountId=${accountId}`),
    );
    expect(listResponse.status).toBe(200);
    expect(await listResponse.json()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "Build sender", labelId: label.id }),
      ]),
    );
  });

  it("creates a subject-only rule and validates empty/oversized criteria", async () => {
    const label = await db.mailLabel.create({
      data: {
        workspaceId,
        name: "Subject route rule",
        normalizedName: `subject-route-rule-${randomUUID()}`,
        color: "AMBER",
      },
    });
    const { POST } = await import("@/app/api/mail/filter-rules/route");
    const created = await POST(
      request("/api/mail/filter-rules", {
        method: "POST",
        body: JSON.stringify({
          accountId,
          labelId: label.id,
          name: "Subject route",
          subjectContains: "  ＡLERT  ",
        }),
      }),
    );
    expect(created.status).toBe(201);
    expect(await created.json()).toMatchObject({
      fromAddress: null,
      subjectContains: "ALERT",
    });

    for (const body of [
      {
        accountId,
        labelId: label.id,
        name: "Empty",
        fromAddress: " ",
        subjectContains: "",
      },
      {
        accountId,
        labelId: label.id,
        name: "Too long",
        subjectContains: "x".repeat(201),
      },
    ]) {
      const response = await POST(
        request("/api/mail/filter-rules", {
          method: "POST",
          body: JSON.stringify(body),
        }),
      );
      expect(response.status).toBe(400);
    }
  });

  it("patches and deletes rules, rejects members, and validates predicate clearing", async () => {
    const [firstLabel, secondLabel] = await Promise.all([
      db.mailLabel.create({
        data: {
          workspaceId,
          name: "Lifecycle route one",
          normalizedName: `lifecycle-route-one-${randomUUID()}`,
          color: "BLUE",
        },
      }),
      db.mailLabel.create({
        data: {
          workspaceId,
          name: "Lifecycle route two",
          normalizedName: `lifecycle-route-two-${randomUUID()}`,
          color: "VIOLET",
        },
      }),
    ]);
    const rule = await db.mailFilterRule.create({
      data: {
        workspaceId,
        accountId,
        accountWorkspaceId: workspaceId,
        labelId: firstLabel.id,
        labelWorkspaceId: workspaceId,
        name: "Lifecycle route",
        fromAddress: "lifecycle-route@example.com",
      },
    });
    const route = await import("@/app/api/mail/filter-rules/[id]/route");

    const patched = await route.PATCH(
      request(`/api/mail/filter-rules/${rule.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: "Lifecycle updated",
          labelId: secondLabel.id,
          fromAddress: null,
          subjectContains: "incident",
          isActive: false,
          position: 0,
        }),
      }),
      { params: Promise.resolve({ id: rule.id }) },
    );
    expect(patched.status).toBe(200);
    expect(await patched.json()).toMatchObject({
      name: "Lifecycle updated",
      labelId: secondLabel.id,
      fromAddress: null,
      subjectContains: "incident",
      isActive: false,
      position: 0,
    });

    const invalid = await route.PATCH(
      request(`/api/mail/filter-rules/${rule.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          fromAddress: null,
          subjectContains: null,
        }),
      }),
      { params: Promise.resolve({ id: rule.id }) },
    );
    expect(invalid.status).toBe(400);

    auth.context = context(memberId, `${PREFIX}-member`);
    const forbidden = await route.PATCH(
      request(`/api/mail/filter-rules/${rule.id}`, {
        method: "PATCH",
        body: JSON.stringify({ name: "Member edit" }),
      }),
      { params: Promise.resolve({ id: rule.id }) },
    );
    expect(forbidden.status).toBe(403);

    auth.context = context(ownerId, `${PREFIX}-owner`);
    const deleted = await route.DELETE(
      request(`/api/mail/filter-rules/${rule.id}`, { method: "DELETE" }),
      { params: Promise.resolve({ id: rule.id }) },
    );
    expect(deleted.status).toBe(204);
    const missing = await route.DELETE(
      request(`/api/mail/filter-rules/${rule.id}`, { method: "DELETE" }),
      { params: Promise.resolve({ id: rule.id }) },
    );
    expect(missing.status).toBe(404);
  });

  it("returns a non-disclosing 404 for a foreign label", async () => {
    const foreignLabel = await db.mailLabel.create({
      data: {
        workspaceId: otherWorkspaceId,
        name: "Foreign",
        normalizedName: `foreign-${randomUUID()}`,
        color: "RED",
      },
    });
    const { POST } = await import("@/app/api/mail/filter-rules/route");
    const response = await POST(
      request("/api/mail/filter-rules", {
        method: "POST",
        body: JSON.stringify({
          accountId,
          labelId: foreignLabel.id,
          name: "Foreign",
          fromAddress: "foreign@example.com",
        }),
      }),
    );
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "RESOURCE_NOT_FOUND" });
  });

  it("rejects unknown list queries and foreign accounts", async () => {
    const foreignAccount = await db.mailAccount.findFirstOrThrow({
      where: { workspaceId: otherWorkspaceId },
      select: { id: true },
    });
    const { GET } = await import("@/app/api/mail/filter-rules/route");

    const unknown = await GET(
      request(`/api/mail/filter-rules?accountId=${accountId}&unexpected=value`),
    );
    expect(unknown.status).toBe(400);

    const foreign = await GET(
      request(`/api/mail/filter-rules?accountId=${foreignAccount.id}`),
    );
    expect(foreign.status).toBe(404);
    expect(await foreign.json()).toEqual({ error: "RESOURCE_NOT_FOUND" });
  });

  it("returns member+foreign list/create ids as 404 before authorization", async () => {
    const foreignAccount = (await getOrCreateWebhookAccount(otherWorkspaceId))
      .account;
    const [localLabel, foreignLabel] = await Promise.all([
      db.mailLabel.create({
        data: {
          workspaceId,
          name: "Member local route resource",
          normalizedName: `member-local-route-${randomUUID()}`,
          color: "BLUE",
        },
      }),
      db.mailLabel.create({
        data: {
          workspaceId: otherWorkspaceId,
          name: "Member foreign route resource",
          normalizedName: `member-foreign-route-${randomUUID()}`,
          color: "RED",
        },
      }),
    ]);
    auth.context = context(memberId, `${PREFIX}-member`);
    const { GET, POST } = await import("@/app/api/mail/filter-rules/route");

    const foreignList = await GET(
      request(`/api/mail/filter-rules?accountId=${foreignAccount.id}`),
    );
    expect(foreignList.status).toBe(404);
    expect(await foreignList.json()).toEqual({ error: "RESOURCE_NOT_FOUND" });
    const localList = await GET(
      request(`/api/mail/filter-rules?accountId=${accountId}`),
    );
    expect(localList.status).toBe(403);

    for (const input of [
      { accountId: foreignAccount.id, labelId: localLabel.id },
      { accountId, labelId: foreignLabel.id },
    ]) {
      const response = await POST(
        request("/api/mail/filter-rules", {
          method: "POST",
          body: JSON.stringify({
            ...input,
            name: "Member foreign route",
            fromAddress: "member-foreign-route@example.com",
          }),
        }),
      );
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ error: "RESOURCE_NOT_FOUND" });
    }

    const before = await db.mailFilterRule.count({ where: { workspaceId } });
    const forbidden = await POST(
      request("/api/mail/filter-rules", {
        method: "POST",
        body: JSON.stringify({
          accountId,
          labelId: localLabel.id,
          name: "Member local route",
          fromAddress: "member-local-route@example.com",
        }),
      }),
    );
    expect(forbidden.status).toBe(403);
    expect(await db.mailFilterRule.count({ where: { workspaceId } })).toBe(
      before,
    );
  });

  it("creates an optional run and exposes owner-only status and bounded retry routes", async () => {
    auth.context = context(ownerId, `${PREFIX}-owner`);
    const inbox = await db.mailFolder.findFirstOrThrow({
      where: { workspaceId, accountId, specialUse: "INBOX" },
      select: { id: true },
    });
    await db.mailItem.create({
      data: {
        workspaceId,
        accountId,
        accountWorkspaceId: workspaceId,
        folderId: inbox.id,
        folderWorkspaceId: workspaceId,
        fromAddress: "run-route@example.com",
        subject: "Run route",
        bodyText: "Run route",
      },
    });
    const label = await db.mailLabel.create({
      data: {
        workspaceId,
        name: "Run route label",
        normalizedName: `run-route-${randomUUID()}`,
        color: "VIOLET",
      },
    });
    const rulesRoute = await import("@/app/api/mail/filter-rules/route");
    const created = await rulesRoute.POST(
      request("/api/mail/filter-rules", {
        method: "POST",
        body: JSON.stringify({
          accountId,
          labelId: label.id,
          name: "Run route",
          fromAddress: "run-route@example.com",
          applyToExistingMail: true,
        }),
      }),
    );
    expect(created.status).toBe(201);
    const rule = await created.json();
    expect(rule.latestRun).toMatchObject({ status: "PENDING", attempts: 0 });
    expect(rule.latestRun.ruleId).toBe(rule.id);
    expect(rule.latestRun).not.toHaveProperty("sourceRuleId");
    expect(rule.latestRun).not.toHaveProperty("lastError");
    const runId = rule.latestRun.id as string;

    const statusRoute = await import("@/app/api/mail/filter-runs/[id]/route");
    const ownerStatus = await statusRoute.GET(
      request(`/api/mail/filter-runs/${runId}`),
      { params: Promise.resolve({ id: runId }) },
    );
    expect(ownerStatus.status).toBe(200);
    const ownerRun = await ownerStatus.json();
    expect(ownerRun).toMatchObject({ ruleId: rule.id, errorCode: null });
    expect(ownerRun).not.toHaveProperty("sourceRuleId");
    expect(ownerRun).not.toHaveProperty("lastError");

    auth.context = context(memberId, `${PREFIX}-member`);
    const memberStatus = await statusRoute.GET(
      request(`/api/mail/filter-runs/${runId}`),
      { params: Promise.resolve({ id: runId }) },
    );
    expect(memberStatus.status).toBe(403);
    const foreignStatus = await statusRoute.GET(
      request("/api/mail/filter-runs/not-in-this-workspace"),
      { params: Promise.resolve({ id: "not-in-this-workspace" }) },
    );
    expect(foreignStatus.status).toBe(404);

    auth.context = context(ownerId, `${PREFIX}-owner`);
    const retryRoute =
      await import("@/app/api/mail/filter-runs/[id]/retry/route");
    const conflict = await retryRoute.POST(
      request(`/api/mail/filter-runs/${runId}/retry`, { method: "POST" }),
      { params: Promise.resolve({ id: runId }) },
    );
    expect(conflict.status).toBe(409);
    expect(await conflict.json()).toEqual({
      error: "FILTER_RUN_NOT_RETRYABLE",
    });

    await db.mailFilterRun.update({
      where: { id: runId },
      data: { status: "FAILED", attempts: 3, completedAt: new Date() },
    });
    const retried = await retryRoute.POST(
      request(`/api/mail/filter-runs/${runId}/retry`, { method: "POST" }),
      { params: Promise.resolve({ id: runId }) },
    );
    expect(retried.status).toBe(200);
    expect(await retried.json()).toMatchObject({
      status: "PENDING",
      attempts: 0,
    });
  });
});
