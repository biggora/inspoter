import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import * as servicesService from "@/lib/services/services";
import { MonitorType, Prisma, ServiceStatus } from "@/generated/prisma/client";

const NAME_PREFIX = `svc-${randomUUID()}`;
let workspaceId: string;
let workspaceBId: string;

beforeAll(async () => {
  const workspace = await db.workspace.create({
    data: {
      name: "Test Workspace",
      slug: `test-${randomUUID()}`,
      updatedAt: new Date(),
    },
  });
  workspaceId = workspace.id;

  const workspaceB = await db.workspace.create({
    data: {
      name: "Test Workspace B",
      slug: `test-b-${randomUUID()}`,
      updatedAt: new Date(),
    },
  });
  workspaceBId = workspaceB.id;
});

afterAll(async () => {
  if (workspaceId) {
    await db.workspace.delete({ where: { id: workspaceId } }).catch(() => {});
  }
  if (workspaceBId) {
    await db.workspace.delete({ where: { id: workspaceBId } }).catch(() => {});
  }
});

function httpInput(
  name: string,
  overrides: Partial<servicesService.ServiceCreateInput> = {},
): servicesService.ServiceCreateInput {
  return {
    name,
    monitorType: MonitorType.HTTP,
    url: "https://example.com/health",
    ...overrides,
  };
}

describe("CRUD", () => {
  it("create() persists a service and get() returns it", async () => {
    const created = await servicesService.create(
      workspaceId,
      httpInput(`${NAME_PREFIX}-crud-create`),
    );
    expect(created.id).toBeDefined();
    expect(created.name).toBe(`${NAME_PREFIX}-crud-create`);
    expect(created.monitorType).toBe(MonitorType.HTTP);
    expect(created.currentStatus).toBe(ServiceStatus.PENDING);

    const fetched = await servicesService.get(created.id, workspaceId);
    expect(fetched?.id).toBe(created.id);
  });

  it("update() persists field changes", async () => {
    const created = await servicesService.create(
      workspaceId,
      httpInput(`${NAME_PREFIX}-crud-update`),
    );
    const updated = await servicesService.update(created.id, workspaceId, {
      name: `${NAME_PREFIX}-crud-update-renamed`,
      description: "updated description",
    });
    expect(updated.name).toBe(`${NAME_PREFIX}-crud-update-renamed`);
    expect(updated.description).toBe("updated description");
  });

  it("remove() deletes the service", async () => {
    const created = await servicesService.create(
      workspaceId,
      httpInput(`${NAME_PREFIX}-crud-remove`),
    );
    await servicesService.remove(created.id, workspaceId);

    const fetched = await servicesService.get(created.id, workspaceId);
    expect(fetched).toBeNull();
  });

  it("list() returns services for the workspace ordered by name", async () => {
    const nameA = `${NAME_PREFIX}-crud-list-b`;
    const nameB = `${NAME_PREFIX}-crud-list-a`;
    await servicesService.create(workspaceId, httpInput(nameA));
    await servicesService.create(workspaceId, httpInput(nameB));

    const all = await servicesService.list(workspaceId);
    const names = all
      .map((s) => s.name)
      .filter((n) => n.startsWith(`${NAME_PREFIX}-crud-list-`));
    expect(names).toEqual([...names].sort());
  });

  it("listOverview() includes the latest 24 checks in descending order", async () => {
    const created = await servicesService.create(
      workspaceId,
      httpInput(`${NAME_PREFIX}-overview`),
    );
    const createdIds: string[] = [];
    const base = Date.now();

    for (let index = 0; index < 26; index++) {
      const check = await db.serviceCheck.create({
        data: {
          workspaceId,
          serviceId: created.id,
          serviceWorkspaceId: workspaceId,
          status: index % 2 === 0 ? ServiceStatus.UP : ServiceStatus.DOWN,
          responseTimeMs: index,
          checkedAt: new Date(base + index * 1000),
        },
      });
      createdIds.push(check.id);
    }

    const overview = await servicesService.listOverview(workspaceId);
    const item = overview.find((service) => service.id === created.id);

    expect(item?.checks).toHaveLength(24);
    expect(item?.checks.map((check) => check.id)).toEqual(
      createdIds.slice(2).reverse(),
    );
  });
});

describe("Workspace isolation", () => {
  it("get() returns null for a service created in a different workspace", async () => {
    const created = await servicesService.create(
      workspaceId,
      httpInput(`${NAME_PREFIX}-isolation-get`),
    );
    const fetchedFromB = await servicesService.get(created.id, workspaceBId);
    expect(fetchedFromB).toBeNull();
  });

  it("update() throws ServiceNotFoundError when called from a different workspace", async () => {
    const created = await servicesService.create(
      workspaceId,
      httpInput(`${NAME_PREFIX}-isolation-update`),
    );
    await expect(
      servicesService.update(created.id, workspaceBId, { name: "hijacked" }),
    ).rejects.toThrow(servicesService.ServiceNotFoundError);
  });

  it("remove() throws when called from a different workspace and does not delete the service", async () => {
    const created = await servicesService.create(
      workspaceId,
      httpInput(`${NAME_PREFIX}-isolation-remove`),
    );
    await expect(
      servicesService.remove(created.id, workspaceBId),
    ).rejects.toThrow(Prisma.PrismaClientKnownRequestError);

    const stillThere = await servicesService.get(created.id, workspaceId);
    expect(stillThere).not.toBeNull();
  });

  it("listChecks() throws ServiceNotFoundError when called from a different workspace", async () => {
    const created = await servicesService.create(
      workspaceId,
      httpInput(`${NAME_PREFIX}-isolation-listchecks`),
    );
    await expect(
      servicesService.listChecks(created.id, workspaceBId, {}),
    ).rejects.toThrow(servicesService.ServiceNotFoundError);
  });

  it("list() from workspace B does not include workspace A's services", async () => {
    const created = await servicesService.create(
      workspaceId,
      httpInput(`${NAME_PREFIX}-isolation-list`),
    );
    const listB = await servicesService.list(workspaceBId);
    expect(listB.some((s) => s.id === created.id)).toBe(false);
  });
});

describe("listChecks(): keyset pagination", () => {
  it("paginates through check history in descending order with no duplicates/gaps", async () => {
    const created = await servicesService.create(
      workspaceId,
      httpInput(`${NAME_PREFIX}-pagination`),
    );

    // Seed 5 ServiceCheck rows directly (bypassing applyCheckResult, since
    // this test is only about listChecks()'s cursor mechanics) with
    // strictly increasing checkedAt timestamps so ordering is deterministic.
    const createdIds: string[] = [];
    const base = Date.now();
    for (let i = 0; i < 5; i++) {
      const check = await db.serviceCheck.create({
        data: {
          workspaceId,
          serviceId: created.id,
          serviceWorkspaceId: workspaceId,
          status: ServiceStatus.UP,
          responseTimeMs: 10 + i,
          message: `check-${i}`,
          checkedAt: new Date(base + i * 1000),
        },
      });
      createdIds.push(check.id);
    }

    const page1 = await servicesService.listChecks(created.id, workspaceId, {
      pageSize: 2,
    });
    expect(page1.items).toHaveLength(2);
    expect(page1.nextCursor).not.toBeNull();
    // Descending by checkedAt: newest (check-4) first.
    expect(page1.items.map((c) => c.message)).toEqual(["check-4", "check-3"]);

    const page2 = await servicesService.listChecks(created.id, workspaceId, {
      pageSize: 2,
      cursor: page1.nextCursor!,
    });
    expect(page2.items).toHaveLength(2);
    expect(page2.nextCursor).not.toBeNull();
    expect(page2.items.map((c) => c.message)).toEqual(["check-2", "check-1"]);

    const page3 = await servicesService.listChecks(created.id, workspaceId, {
      pageSize: 2,
      cursor: page2.nextCursor!,
    });
    expect(page3.items).toHaveLength(1);
    expect(page3.nextCursor).toBeNull();
    expect(page3.items.map((c) => c.message)).toEqual(["check-0"]);

    const allIds = [...page1.items, ...page2.items, ...page3.items].map(
      (c) => c.id,
    );
    expect(new Set(allIds).size).toBe(5);
    expect(allIds.sort()).toEqual([...createdIds].sort());
  });
});

describe("applyCheckResult(): flip detection and Alert integration", () => {
  it("a brand-new service's very first check (success) creates NO Alert row", async () => {
    const created = await servicesService.create(
      workspaceId,
      httpInput(`${NAME_PREFIX}-first-check-success`),
    );
    expect(created.currentStatus).toBe(ServiceStatus.PENDING);

    await servicesService.applyCheckResult(created, {
      ok: true,
      responseTimeMs: 12,
    });

    const alerts = await db.alert.findMany({
      where: { workspaceId, source: created.name },
    });
    expect(alerts).toHaveLength(0);

    const updated = await servicesService.get(created.id, workspaceId);
    expect(updated?.currentStatus).toBe(ServiceStatus.UP);
  });

  it("a brand-new service's very first check (failure, retries exhausted) creates NO Alert row", async () => {
    const created = await servicesService.create(workspaceId, {
      ...httpInput(`${NAME_PREFIX}-first-check-failure`),
      retries: 1,
    });
    expect(created.currentStatus).toBe(ServiceStatus.PENDING);

    await servicesService.applyCheckResult(created, {
      ok: false,
      responseTimeMs: 5,
      message: "boom",
    });

    const alerts = await db.alert.findMany({
      where: { workspaceId, source: created.name },
    });
    expect(alerts).toHaveLength(0);

    const updated = await servicesService.get(created.id, workspaceId);
    expect(updated?.currentStatus).toBe(ServiceStatus.DOWN);
  });

  it("retries=2: one failure keeps the service PENDING with no Alert", async () => {
    const created = await servicesService.create(workspaceId, {
      ...httpInput(`${NAME_PREFIX}-retries-2-partial`),
      retries: 2,
    });

    const afterFirstFailure = await servicesService.applyCheckResult(created, {
      ok: false,
      responseTimeMs: 5,
      message: "timeout",
    });
    expect(afterFirstFailure.currentStatus).toBe(ServiceStatus.PENDING);
    expect(afterFirstFailure.consecutiveFailures).toBe(1);

    const alerts = await db.alert.findMany({
      where: { workspaceId, source: created.name },
    });
    expect(alerts).toHaveLength(0);
  });

  it("retries=2: once UP, two consecutive failures flip to DOWN and create exactly one critical Alert; a following success flips to UP with a second info Alert", async () => {
    // Establishes UP first (a lone success from PENDING is itself never a
    // flip — see service-status.test.ts), then drives two consecutive
    // failures from that known-UP state to actually cross the retries
    // threshold as a flip. Going straight from PENDING to DOWN (as in the
    // "first-check-failure"/"one failure keeps it PENDING" tests above)
    // never counts as a flip regardless of how many failed checks it takes
    // to cross retries, by design (nextState's flipped condition on the
    // failure path is `current.status === UP`) — this test exercises the
    // actual UP -> DOWN flip path instead.
    const serviceName = `${NAME_PREFIX}-retries-2-full-cycle`;
    const created = await servicesService.create(workspaceId, {
      ...httpInput(serviceName),
      retries: 2,
    });

    const afterInitialSuccess = await servicesService.applyCheckResult(
      created,
      { ok: true, responseTimeMs: 9 },
    );
    expect(afterInitialSuccess.currentStatus).toBe(ServiceStatus.UP);
    const alertsAfterInitialSuccess = await db.alert.findMany({
      where: { workspaceId, source: serviceName },
    });
    expect(alertsAfterInitialSuccess).toHaveLength(0);

    const afterFirstFailure = await servicesService.applyCheckResult(
      afterInitialSuccess,
      { ok: false, responseTimeMs: 5, message: "timeout 1" },
    );
    expect(afterFirstFailure.currentStatus).toBe(ServiceStatus.UP);
    expect(afterFirstFailure.consecutiveFailures).toBe(1);

    const afterSecondFailure = await servicesService.applyCheckResult(
      afterFirstFailure,
      { ok: false, responseTimeMs: 5, message: "timeout 2" },
    );
    expect(afterSecondFailure.currentStatus).toBe(ServiceStatus.DOWN);
    expect(afterSecondFailure.consecutiveFailures).toBe(2);

    const alertsAfterDown = await db.alert.findMany({
      where: { workspaceId, source: serviceName },
      include: { alertCategory: true },
    });
    expect(alertsAfterDown).toHaveLength(1);
    expect(alertsAfterDown[0].severity).toBe("critical");
    expect(alertsAfterDown[0].source).toBe(serviceName);
    expect(alertsAfterDown[0].alertCategory?.name).toBe("Services");
    expect(alertsAfterDown[0].alertCategory?.systemKey).toBe("services");
    // The probe explained itself, so its diagnostic is stored verbatim and
    // stays untranslated — there is no key to render it from.
    expect(alertsAfterDown[0].message).toBe("timeout 2");
    expect(alertsAfterDown[0].messageKey).toBeNull();

    const afterSuccess = await servicesService.applyCheckResult(
      afterSecondFailure,
      { ok: true, responseTimeMs: 8 },
    );
    expect(afterSuccess.currentStatus).toBe(ServiceStatus.UP);
    expect(afterSuccess.consecutiveFailures).toBe(0);

    const alertsAfterUp = await db.alert.findMany({
      where: { workspaceId, source: serviceName },
      include: { alertCategory: true },
      orderBy: { timestamp: "asc" },
    });
    expect(alertsAfterUp).toHaveLength(2);
    expect(alertsAfterUp[1].severity).toBe("info");
    expect(alertsAfterUp[1].alertCategory?.name).toBe("Services");
    // A successful probe carries no message of its own, so this one is ours:
    // English in the column, plus the key the UI re-renders it from.
    expect(alertsAfterUp[1].message).toBe("Service is available again");
    expect(alertsAfterUp[1].messageKey).toBe("system.serviceUp");
  });

  it("records a ServiceCheck row for every applyCheckResult call", async () => {
    const created = await servicesService.create(
      workspaceId,
      httpInput(`${NAME_PREFIX}-check-history`),
    );
    await servicesService.applyCheckResult(created, {
      ok: true,
      responseTimeMs: 20,
    });

    const checks = await db.serviceCheck.findMany({
      where: { workspaceId, serviceId: created.id },
    });
    expect(checks).toHaveLength(1);
    expect(checks[0].status).toBe(ServiceStatus.UP);
    expect(checks[0].responseTimeMs).toBe(20);
  });

  // The scheduler only logs a failed check (scheduler.ts checkOneService), so
  // a flip persisted before its Alert would be lost for good — nothing ever
  // re-detects it. Writing the Alert first makes the failure retryable.
  it("leaves the service status untouched when the Alert write fails, so the next check retries the flip", async () => {
    const serviceName = `${NAME_PREFIX}-alert-write-failure`;
    const created = await servicesService.create(
      workspaceId,
      httpInput(serviceName),
    );
    const up = await servicesService.applyCheckResult(created, {
      ok: true,
      responseTimeMs: 11,
    });
    expect(up.currentStatus).toBe(ServiceStatus.UP);

    const alertCreate = vi
      .spyOn(db.alert, "create")
      .mockRejectedValueOnce(new Error("alert write failed"));

    await expect(
      servicesService.applyCheckResult(up, {
        ok: false,
        responseTimeMs: 4,
        message: "down 1",
      }),
    ).rejects.toThrow("alert write failed");
    alertCreate.mockRestore();

    const afterFailure = await db.service.findUniqueOrThrow({
      where: { id: created.id, workspaceId },
    });
    expect(afterFailure.currentStatus).toBe(ServiceStatus.UP);
    expect(afterFailure.consecutiveFailures).toBe(0);

    const retried = await servicesService.applyCheckResult(afterFailure, {
      ok: false,
      responseTimeMs: 4,
      message: "down 2",
    });
    expect(retried.currentStatus).toBe(ServiceStatus.DOWN);

    const alerts = await db.alert.findMany({
      where: { workspaceId, source: serviceName },
    });
    expect(alerts).toHaveLength(1);
    expect(alerts[0].message).toBe("down 2");
  });
});

describe("update(): resets consecutiveFailures and pulls nextCheckAt forward on target/interval change", () => {
  it("resets consecutiveFailures and moves nextCheckAt to now when the url changes", async () => {
    const created = await servicesService.create(
      workspaceId,
      httpInput(`${NAME_PREFIX}-update-target-change`),
    );
    // Drive up consecutiveFailures without flipping to DOWN (retries default 1
    // would flip immediately, so bump retries first via update, which itself
    // does not touch the target and should NOT reset nextCheckAt/failures).
    await db.service.update({
      where: { id: created.id, workspaceId },
      data: {
        consecutiveFailures: 3,
        nextCheckAt: new Date(Date.now() + 3600_000),
      },
    });

    const before = Date.now();
    const updated = await servicesService.update(created.id, workspaceId, {
      url: "https://example.com/changed-health",
    });

    expect(updated.consecutiveFailures).toBe(0);
    expect(updated.nextCheckAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(updated.nextCheckAt.getTime()).toBeLessThan(before + 3600_000);
  });

  it("resets consecutiveFailures and moves nextCheckAt to now when intervalSeconds changes", async () => {
    const created = await servicesService.create(
      workspaceId,
      httpInput(`${NAME_PREFIX}-update-interval-change`),
    );
    await db.service.update({
      where: { id: created.id, workspaceId },
      data: {
        consecutiveFailures: 2,
        nextCheckAt: new Date(Date.now() + 3600_000),
      },
    });

    const before = Date.now();
    const updated = await servicesService.update(created.id, workspaceId, {
      intervalSeconds: 120,
    });

    expect(updated.consecutiveFailures).toBe(0);
    expect(updated.nextCheckAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(updated.nextCheckAt.getTime()).toBeLessThan(before + 3600_000);
  });

  it("does NOT reset consecutiveFailures/nextCheckAt when only unrelated fields (e.g. name) change", async () => {
    const created = await servicesService.create(
      workspaceId,
      httpInput(`${NAME_PREFIX}-update-no-target-change`),
    );
    const farFuture = new Date(Date.now() + 3600_000);
    await db.service.update({
      where: { id: created.id, workspaceId },
      data: { consecutiveFailures: 3, nextCheckAt: farFuture },
    });

    const updated = await servicesService.update(created.id, workspaceId, {
      name: `${NAME_PREFIX}-update-no-target-change-renamed`,
    });

    expect(updated.consecutiveFailures).toBe(3);
    expect(updated.nextCheckAt.getTime()).toBe(farFuture.getTime());
  });
});

// The pause control on the service card PATCHes isActive on its own, with no
// other field in the payload — this is the service-layer half of that.
describe("update(): pausing and resuming the scheduled checks", () => {
  it("an isActive-only update leaves the check target intact and moves the service out of (and back into) the scheduler sweep", async () => {
    const created = await servicesService.create(
      workspaceId,
      httpInput(`${NAME_PREFIX}-pause-toggle`, {
        expectedStatusCodes: "200-204",
      }),
    );

    const paused = await servicesService.update(created.id, workspaceId, {
      isActive: false,
    });

    expect(paused.isActive).toBe(false);
    expect(paused.monitorType).toBe(created.monitorType);
    expect(paused.url).toBe(created.url);
    expect(paused.expectedStatusCodes).toBe("200-204");
    expect(paused.intervalSeconds).toBe(created.intervalSeconds);
    expect(
      (await servicesService.listDueForCheck(new Date())).map((s) => s.id),
    ).not.toContain(created.id);

    const resumed = await servicesService.update(created.id, workspaceId, {
      isActive: true,
    });

    expect(resumed.isActive).toBe(true);
    expect(resumed.url).toBe(created.url);
    expect(
      (await servicesService.listDueForCheck(new Date())).map((s) => s.id),
    ).toContain(created.id);
  });

  it("pausing keeps the accumulated failure count and check schedule frozen rather than resetting them", async () => {
    const created = await servicesService.create(
      workspaceId,
      httpInput(`${NAME_PREFIX}-pause-freezes-state`),
    );
    const farFuture = new Date(Date.now() + 3600_000);
    await db.service.update({
      where: { id: created.id, workspaceId },
      data: { consecutiveFailures: 2, nextCheckAt: farFuture },
    });

    const paused = await servicesService.update(created.id, workspaceId, {
      isActive: false,
    });

    expect(paused.consecutiveFailures).toBe(2);
    expect(paused.nextCheckAt.getTime()).toBe(farFuture.getTime());
  });
});

describe("listDueForCheck()", () => {
  it("returns active services whose nextCheckAt has passed, across workspaces (deliberately not workspace-scoped)", async () => {
    const dueA = await servicesService.create(
      workspaceId,
      httpInput(`${NAME_PREFIX}-due-a`),
    );
    const dueB = await servicesService.create(
      workspaceBId,
      httpInput(`${NAME_PREFIX}-due-b`),
    );
    const notDue = await servicesService.create(
      workspaceId,
      httpInput(`${NAME_PREFIX}-not-due`),
    );
    await db.service.update({
      where: { id: notDue.id, workspaceId },
      data: { nextCheckAt: new Date(Date.now() + 3600_000) },
    });
    const inactiveDue = await servicesService.create(workspaceId, {
      ...httpInput(`${NAME_PREFIX}-inactive-due`),
      isActive: false,
    });

    const due = await servicesService.listDueForCheck(new Date());
    const dueIds = due.map((s) => s.id);

    expect(dueIds).toContain(dueA.id);
    expect(dueIds).toContain(dueB.id);
    expect(dueIds).not.toContain(notDue.id);
    expect(dueIds).not.toContain(inactiveDue.id);
  });
});
