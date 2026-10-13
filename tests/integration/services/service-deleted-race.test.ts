import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { MonitorType } from "@/generated/prisma/client";
import * as servicesService from "@/lib/services/services";

// Rows deleted while the services list is being read. Prisma loads the
// `labels -> label` include with a separate query, so a label deleted between
// the assignment read and the label read used to come back as `label: null`
// and crash listOverview() on `label.color`. The race is forced
// deterministically: a second connection holds an exclusive lock on
// "ServiceLabel" (service and assignment reads still pass, any read of
// "ServiceLabel" waits), deletes the label once the lookup is waiting on the
// lock, and commits.

const PREFIX = `service-deleted-race-${randomUUID()}`;
let workspaceId: string;

// Runs `read` while "ServiceLabel" is locked, deletes `labelId` as soon as
// `read` waits on that lock, then releases it and returns what `read` settled
// with.
async function deleteLabelDuringRead<T>(
  labelId: string,
  read: () => Promise<T>,
): Promise<PromiseSettledResult<T>> {
  const locker = new Client({ connectionString: process.env.DATABASE_URL });
  await locker.connect();
  try {
    await locker.query("BEGIN");
    await locker.query('LOCK TABLE "ServiceLabel" IN ACCESS EXCLUSIVE MODE');
    const pending = read().then(
      (value) => ({ status: "fulfilled", value }) as const,
      (reason: unknown) => ({ status: "rejected", reason }) as const,
    );

    const deadline = Date.now() + 10_000;
    for (;;) {
      const { rows } = await locker.query<{ waiting: number }>(
        `SELECT count(*)::int AS waiting FROM pg_locks
          WHERE NOT granted AND relation = '"ServiceLabel"'::regclass`,
      );
      if (rows[0].waiting > 0) break;
      if (Date.now() > deadline) {
        throw new Error("the lookup never waited on the ServiceLabel lock");
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    await locker.query('DELETE FROM "ServiceLabel" WHERE id = $1', [labelId]);
    await locker.query("COMMIT");
    return await pending;
  } finally {
    await locker.end();
  }
}

async function createLabel(suffix: string) {
  return db.serviceLabel.create({
    data: {
      workspaceId,
      name: `${PREFIX}-${suffix}`,
      normalizedName: `${PREFIX}-${suffix}`,
      color: "SLATE",
    },
  });
}

async function createLabelledService(suffix: string, labelIds: string[]) {
  return servicesService.create(workspaceId, {
    name: `${PREFIX}-${suffix}`,
    monitorType: MonitorType.HTTP,
    url: "https://example.com/health",
    labelIds,
  });
}

beforeAll(async () => {
  const workspace = await db.workspace.create({
    data: { name: PREFIX, slug: PREFIX },
  });
  workspaceId = workspace.id;
});

afterAll(async () => {
  await db.workspace.deleteMany({ where: { id: workspaceId } });
});

describe("a service label deleted mid-read", () => {
  it("listOverview() drops the vanished label instead of crashing", async () => {
    const kept = await createLabel("overview-kept");
    const doomed = await createLabel("overview-doomed");
    const service = await createLabelledService("overview", [
      kept.id,
      doomed.id,
    ]);

    const result = await deleteLabelDuringRead(doomed.id, () =>
      servicesService.listOverview(workspaceId),
    );

    expect(result.status).toBe("fulfilled");
    if (result.status !== "fulfilled") return;
    const item = result.value.find((entry) => entry.id === service.id);
    expect(item?.labels.map((label) => label.id)).toEqual([kept.id]);
  });

  it("list() drops the vanished label instead of crashing", async () => {
    const kept = await createLabel("list-kept");
    const doomed = await createLabel("list-doomed");
    const service = await createLabelledService("list", [kept.id, doomed.id]);

    const result = await deleteLabelDuringRead(doomed.id, () =>
      servicesService.list(workspaceId),
    );

    expect(result.status).toBe("fulfilled");
    if (result.status !== "fulfilled") return;
    const item = result.value.find((entry) => entry.id === service.id);
    expect(item?.labels.map((label) => label.id)).toEqual([kept.id]);
  });
});

describe("a service deleted mid-check", () => {
  it("applyCheckResult() reports the vanished service as not found", async () => {
    const service = await createLabelledService("check", []);
    await db.service.delete({ where: { id: service.id } });

    await expect(
      servicesService.applyCheckResult(service, {
        ok: true,
        responseTimeMs: 12,
      }),
    ).rejects.toBeInstanceOf(servicesService.ServiceNotFoundError);
  });
});
