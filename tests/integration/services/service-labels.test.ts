import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { MonitorType } from "@/generated/prisma/client";
import * as servicesService from "@/lib/services/services";
import * as serviceLabelsService from "@/lib/services/service-labels";
import { WorkspaceMemberRequiredError } from "@/lib/services/workspace-auth";

const PREFIX = `service-labels-${randomUUID()}`;
let workspaceId: string;
let otherWorkspaceId: string;
let ownerId: string;
let outsiderId: string;

beforeAll(async () => {
  const [workspace, otherWorkspace, owner, outsider] = await Promise.all([
    db.workspace.create({
      data: { name: `${PREFIX}-workspace`, slug: `${PREFIX}-workspace` },
    }),
    db.workspace.create({
      data: { name: `${PREFIX}-other`, slug: `${PREFIX}-other` },
    }),
    db.operator.create({ data: { username: `${PREFIX}-owner` } }),
    db.operator.create({ data: { username: `${PREFIX}-outsider` } }),
  ]);
  workspaceId = workspace.id;
  otherWorkspaceId = otherWorkspace.id;
  ownerId = owner.id;
  outsiderId = outsider.id;
  await db.workspaceMember.createMany({
    data: [
      { workspaceId, operatorId: ownerId, role: "OWNER" },
      { workspaceId: otherWorkspaceId, operatorId: ownerId, role: "OWNER" },
    ],
  });
});

afterAll(async () => {
  await db.workspace.deleteMany({
    where: { id: { in: [workspaceId, otherWorkspaceId] } },
  });
  await db.operator.deleteMany({
    where: { id: { in: [ownerId, outsiderId] } },
  });
});

let labelSeq = 0;

function uniqueName(hint: string): string {
  labelSeq += 1;
  return `${hint} ${labelSeq}`;
}

async function createLabel(hint: string, color = "SLATE" as const) {
  return serviceLabelsService.createLabel(workspaceId, ownerId, {
    name: uniqueName(hint),
    color,
  });
}

async function createService(
  hint: string,
  overrides: Partial<servicesService.ServiceCreateInput> = {},
) {
  return servicesService.create(workspaceId, {
    name: `${PREFIX}-${hint}-${labelSeq}`,
    monitorType: MonitorType.HTTP,
    url: "https://example.com/health",
    ...overrides,
  });
}

describe("Service label definitions", () => {
  it("normalizes uniqueness while preserving display casing", async () => {
    const label = await serviceLabelsService.createLabel(workspaceId, ownerId, {
      name: "  Prod\t Edge  ",
      color: "#12ab34",
    });
    expect(label.name).toBe("Prod Edge");
    expect(label.color).toBe("#12AB34");

    await expect(
      serviceLabelsService.createLabel(workspaceId, ownerId, {
        name: "prod   edge",
        color: "BLUE",
      }),
    ).rejects.toBeInstanceOf(
      serviceLabelsService.ServiceLabelNameConflictError,
    );
  });

  it("rejects operators who are not workspace members", async () => {
    await expect(
      serviceLabelsService.createLabel(workspaceId, outsiderId, {
        name: uniqueName("Outsider"),
        color: "RED",
      }),
    ).rejects.toBeInstanceOf(WorkspaceMemberRequiredError);
  });

  it("updates name and color", async () => {
    const label = await createLabel("Renamable");
    const updated = await serviceLabelsService.updateLabel(
      workspaceId,
      ownerId,
      label.id,
      { name: "Renamed edge", color: "GREEN" },
    );
    expect(updated).toMatchObject({ name: "Renamed edge", color: "GREEN" });
  });

  it("hides labels from other workspaces behind a not-found error", async () => {
    const foreign = await serviceLabelsService.createLabel(
      otherWorkspaceId,
      ownerId,
      { name: uniqueName("Foreign"), color: "AMBER" },
    );

    await expect(
      serviceLabelsService.updateLabel(workspaceId, ownerId, foreign.id, {
        name: uniqueName("Hijacked"),
      }),
    ).rejects.toBeInstanceOf(serviceLabelsService.ServiceLabelNotFoundError);

    await expect(
      serviceLabelsService.deleteLabel(workspaceId, ownerId, foreign.id),
    ).rejects.toBeInstanceOf(serviceLabelsService.ServiceLabelNotFoundError);

    const listed = await serviceLabelsService.listLabels(workspaceId);
    expect(listed.some((item) => item.id === foreign.id)).toBe(false);
  });

  it("reports how many services carry each label", async () => {
    const label = await createLabel("Counted");
    await createService("counted-a", { labelIds: [label.id] });
    await createService("counted-b", { labelIds: [label.id] });

    const listed = await serviceLabelsService.listLabels(workspaceId);
    expect(listed.find((item) => item.id === label.id)?.serviceCount).toBe(2);
  });
});

describe("Assignments", () => {
  it("create() persists the requested labels and get() returns them sorted", async () => {
    const [beta, alpha] = await Promise.all([
      createLabel("Beta"),
      createLabel("Alpha"),
    ]);

    const created = await createService("assign-create", {
      labelIds: [beta.id, alpha.id],
    });
    expect(created.labels.map((label) => label.name)).toEqual(
      [alpha.name, beta.name].sort((a, b) => a.localeCompare(b)),
    );

    const fetched = await servicesService.get(created.id, workspaceId);
    expect(fetched?.labels.map((label) => label.id).sort()).toEqual(
      [alpha.id, beta.id].sort(),
    );
  });

  it("update() replaces the whole set", async () => {
    const [first, second] = await Promise.all([
      createLabel("First"),
      createLabel("Second"),
    ]);
    const service = await createService("assign-replace", {
      labelIds: [first.id],
    });

    const updated = await servicesService.update(service.id, workspaceId, {
      labelIds: [second.id],
    });
    expect(updated.labels.map((label) => label.id)).toEqual([second.id]);
  });

  it("update() with an empty array clears the assignments", async () => {
    const label = await createLabel("Clearable");
    const service = await createService("assign-clear", {
      labelIds: [label.id],
    });

    const updated = await servicesService.update(service.id, workspaceId, {
      labelIds: [],
    });
    expect(updated.labels).toEqual([]);
  });

  it("update() without labelIds leaves the assignments alone", async () => {
    const label = await createLabel("Untouched");
    const service = await createService("assign-untouched", {
      labelIds: [label.id],
    });

    const updated = await servicesService.update(service.id, workspaceId, {
      name: `${service.name}-renamed`,
    });
    expect(updated.labels.map((item) => item.id)).toEqual([label.id]);
  });

  it("rejects a label id from another workspace", async () => {
    const foreign = await serviceLabelsService.createLabel(
      otherWorkspaceId,
      ownerId,
      { name: uniqueName("Cross tenant"), color: "VIOLET" },
    );

    await expect(
      createService("assign-cross-tenant", { labelIds: [foreign.id] }),
    ).rejects.toBeInstanceOf(serviceLabelsService.ServiceLabelNotFoundError);
  });

  it("listOverview() carries the labels alongside the checks", async () => {
    const label = await createLabel("Overview");
    const service = await createService("assign-overview", {
      labelIds: [label.id],
    });

    const overview = await servicesService.listOverview(workspaceId);
    const row = overview.find((item) => item.id === service.id);
    expect(row?.labels.map((item) => item.id)).toEqual([label.id]);
  });
});

describe("Cascades", () => {
  it("deleting a label detaches it and leaves the service intact", async () => {
    const label = await createLabel("Disposable");
    const service = await createService("cascade-label", {
      labelIds: [label.id],
    });

    await serviceLabelsService.deleteLabel(workspaceId, ownerId, label.id);

    const fetched = await servicesService.get(service.id, workspaceId);
    expect(fetched).not.toBeNull();
    expect(fetched?.labels).toEqual([]);
  });

  it("deleting a service removes its assignments", async () => {
    const label = await createLabel("Survivor");
    const service = await createService("cascade-service", {
      labelIds: [label.id],
    });

    await servicesService.remove(service.id, workspaceId);

    const assignments = await db.serviceLabelAssignment.count({
      where: { workspaceId, labelId: label.id },
    });
    expect(assignments).toBe(0);

    const listed = await serviceLabelsService.listLabels(workspaceId);
    expect(listed.some((item) => item.id === label.id)).toBe(true);
  });
});
