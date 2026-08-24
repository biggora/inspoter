import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import * as webhookTokensService from "@/lib/services/webhookTokens";
import * as servicesService from "@/lib/services/services";
import {
  GET as listServices,
  POST as createService,
} from "@/app/api/v1/services/route";
import {
  DELETE as deleteService,
  GET as getService,
  PATCH as updateService,
} from "@/app/api/v1/services/[serviceId]/route";
import { POST as checkServiceNow } from "@/app/api/v1/services/[serviceId]/check-now/route";
import { GET as listServiceChecks } from "@/app/api/v1/services/[serviceId]/checks/route";
import {
  GET as listServiceLabels,
  POST as createServiceLabel,
} from "@/app/api/v1/services/labels/route";
import {
  DELETE as deleteServiceLabel,
  PATCH as updateServiceLabel,
} from "@/app/api/v1/services/labels/[labelId]/route";

// /api/v1/services/** end-to-end: the bearer token is the only authority, it
// carries the workspace, and the scope decides read from write. No session
// cookie and no X-Inspoter-Workspace header are involved anywhere here.

const PREFIX = `v1-services-${randomUUID()}`;
// Service label names cap at 40 chars (validation/services.ts), too short
// for PREFIX plus a suffix, so label tests build names from this instead.
const SHORT = randomUUID().slice(0, 8);

let workspaceId: string;
let otherWorkspaceId: string;
let writeToken: string;
let readToken: string;
let scopelessToken: string;
let revokedToken: string;
let otherWorkspaceToken: string;
let serviceId: string;

function request(
  path: string,
  init: { method?: string; token?: string | null; body?: unknown } = {},
): NextRequest {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (init.token) headers.set("Authorization", `Bearer ${init.token}`);
  return new NextRequest(`http://localhost${path}`, {
    method: init.method ?? "GET",
    headers,
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
  });
}

function params<T extends Record<string, string>>(value: T) {
  return { params: Promise.resolve(value) };
}

async function body<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

beforeAll(async () => {
  const [workspace, otherWorkspace] = await Promise.all([
    db.workspace.create({
      data: { name: `${PREFIX}-workspace`, slug: `${PREFIX}-workspace` },
    }),
    db.workspace.create({
      data: { name: `${PREFIX}-other`, slug: `${PREFIX}-other` },
    }),
  ]);
  workspaceId = workspace.id;
  otherWorkspaceId = otherWorkspace.id;

  writeToken = (
    await webhookTokensService.create(workspaceId, "agent", [
      "services:read",
      "services:write",
    ])
  ).token;
  readToken = (
    await webhookTokensService.create(workspaceId, "agent-ro", [
      "services:read",
    ])
  ).token;
  scopelessToken = (await webhookTokensService.create(workspaceId, "ingest"))
    .token;
  otherWorkspaceToken = (
    await webhookTokensService.create(otherWorkspaceId, "other", [
      "services:read",
      "services:write",
    ])
  ).token;

  const revoked = await webhookTokensService.create(workspaceId, "revoked", [
    "services:write",
  ]);
  await webhookTokensService.revoke(revoked.id, workspaceId);
  revokedToken = revoked.token;

  const service = await servicesService.create(workspaceId, {
    name: `${PREFIX}-seeded`,
    monitorType: "HTTP",
    url: "https://api.example.invalid/health",
  });
  serviceId = service.id;
});

afterAll(async () => {
  await Promise.all([
    db.workspace.delete({ where: { id: workspaceId } }).catch(() => {}),
    db.workspace.delete({ where: { id: otherWorkspaceId } }).catch(() => {}),
  ]);
});

describe("authentication and scopes", () => {
  it("rejects a request with no Authorization header", async () => {
    const response = await listServices(request("/api/v1/services"));

    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toContain("Bearer");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("rejects unknown, revoked and scopeless tokens", async () => {
    for (const token of ["not-a-real-token", revokedToken, scopelessToken]) {
      const response = await listServices(
        request("/api/v1/services", { token }),
      );
      expect(response.status).toBe(401);
    }
  });

  it("rejects a read-only token on a write operation", async () => {
    const response = await createService(
      request("/api/v1/services", {
        method: "POST",
        token: readToken,
        body: { name: "Should not exist", monitorType: "PING", host: "h" },
      }),
    );

    expect(response.status).toBe(403);
    expect(
      await db.service.count({ where: { name: "Should not exist" } }),
    ).toBe(0);
  });
});

describe("services", () => {
  it("lists services with their labels and recent checks", async () => {
    const response = await listServices(
      request("/api/v1/services", { token: readToken }),
    );

    expect(response.status).toBe(200);
    const items =
      await body<Array<{ id: string; checks: unknown[] }>>(response);
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe(serviceId);
    expect(items[0].checks).toEqual([]);
  });

  it("filters the list by status, label and free text", async () => {
    const matching = await listServices(
      request(`/api/v1/services?query=${PREFIX}&status=PENDING`, {
        token: readToken,
      }),
    );
    expect(await body<unknown[]>(matching)).toHaveLength(1);

    const missing = await listServices(
      request("/api/v1/services?query=nothing-matches-this", {
        token: readToken,
      }),
    );
    expect(await body<unknown[]>(missing)).toHaveLength(0);
  });

  it("rejects an unknown query parameter", async () => {
    const response = await listServices(
      request("/api/v1/services?unexpected=1", { token: readToken }),
    );

    expect(response.status).toBe(400);
    expect(await body<{ error: { code: string } }>(response)).toMatchObject({
      error: { code: "VALIDATION_FAILED" },
    });
  });

  it("creates, reads, updates and deletes a monitor and journals each write", async () => {
    const created = await createService(
      request("/api/v1/services", {
        method: "POST",
        token: writeToken,
        body: {
          name: `${PREFIX}-tcp`,
          monitorType: "TCP",
          host: "127.0.0.1",
          port: 1,
          timeoutMs: 1000,
        },
      }),
    );
    expect(created.status).toBe(201);
    const { id } = await body<{ id: string }>(created);

    const read = await getService(
      request(`/api/v1/services/${id}`, { token: readToken }),
      params({ serviceId: id }),
    );
    expect(read.status).toBe(200);
    expect(await body<{ port: number }>(read)).toMatchObject({ port: 1 });

    const updated = await updateService(
      request(`/api/v1/services/${id}`, {
        method: "PATCH",
        token: writeToken,
        body: { isActive: false },
      }),
      params({ serviceId: id }),
    );
    expect(updated.status).toBe(200);
    expect(await body<{ isActive: boolean }>(updated)).toMatchObject({
      isActive: false,
    });

    const removed = await deleteService(
      request(`/api/v1/services/${id}`, {
        method: "DELETE",
        token: writeToken,
      }),
      params({ serviceId: id }),
    );
    expect(removed.status).toBe(200);
    expect(await body(removed)).toEqual({ deleted: id });
    expect(await db.service.findUnique({ where: { id } })).toBeNull();

    // Writes are journalled under the token's own name, so the Activity page
    // shows agent-made edits next to operator-made ones.
    const activity = await db.activity.findMany({
      where: { workspaceId, entityType: "service", entityId: id },
      select: { action: true, operatorName: true },
    });
    expect(activity.map((entry) => entry.action).sort()).toEqual([
      "create",
      "delete",
      "update",
    ]);
    expect(new Set(activity.map((entry) => entry.operatorName))).toEqual(
      new Set(["agent"]),
    );
  });

  it("rejects a monitor missing its type-specific target", async () => {
    const response = await createService(
      request("/api/v1/services", {
        method: "POST",
        token: writeToken,
        body: { name: `${PREFIX}-no-target`, monitorType: "HTTP" },
      }),
    );

    expect(response.status).toBe(400);
    const payload = await body<{ error: { code: string; issues: unknown[] } }>(
      response,
    );
    expect(payload.error.code).toBe("VALIDATION_FAILED");
    expect(payload.error.issues.length).toBeGreaterThan(0);
  });

  it("runs an on-demand check and records it in the history", async () => {
    const created = await createService(
      request("/api/v1/services", {
        method: "POST",
        token: writeToken,
        body: {
          name: `${PREFIX}-check-now`,
          monitorType: "TCP",
          host: "127.0.0.1",
          port: 1,
          timeoutMs: 1000,
        },
      }),
    );
    const { id } = await body<{ id: string }>(created);

    const checked = await checkServiceNow(
      request(`/api/v1/services/${id}/check-now`, {
        method: "POST",
        token: writeToken,
      }),
      params({ serviceId: id }),
    );
    expect(checked.status).toBe(200);
    expect(
      await body<{ lastCheckedAt: string | null }>(checked),
    ).toHaveProperty("lastCheckedAt", expect.any(String));

    const history = await listServiceChecks(
      request(`/api/v1/services/${id}/checks`, { token: readToken }),
      params({ serviceId: id }),
    );
    const page = await body<{ items: unknown[]; nextCursor: string | null }>(
      history,
    );
    expect(page.items).toHaveLength(1);
    expect(page.nextCursor).toBeNull();
  });

  it("answers 404 for an id belonging to another workspace", async () => {
    const response = await getService(
      request(`/api/v1/services/${serviceId}`, {
        token: otherWorkspaceToken,
      }),
      params({ serviceId }),
    );

    expect(response.status).toBe(404);
    expect(await body<{ error: { code: string } }>(response)).toMatchObject({
      error: { code: "NOT_FOUND" },
    });
  });

  it("refuses to update or delete a service of another workspace", async () => {
    const updated = await updateService(
      request(`/api/v1/services/${serviceId}`, {
        method: "PATCH",
        token: otherWorkspaceToken,
        body: { name: "Cross-tenant rename" },
      }),
      params({ serviceId }),
    );
    expect(updated.status).toBe(404);

    const removed = await deleteService(
      request(`/api/v1/services/${serviceId}`, {
        method: "DELETE",
        token: otherWorkspaceToken,
      }),
      params({ serviceId }),
    );
    expect(removed.status).toBe(404);
    expect(await db.service.findUnique({ where: { id: serviceId } })).not.toBe(
      null,
    );
  });
});

describe("service labels", () => {
  it("creates, lists, renames and deletes a label", async () => {
    const created = await createServiceLabel(
      request("/api/v1/services/labels", {
        method: "POST",
        token: writeToken,
        body: { name: `${SHORT}-critical`, color: "RED" },
      }),
    );
    expect(created.status).toBe(201);
    const { id } = await body<{ id: string }>(created);

    const listed = await listServiceLabels(
      request("/api/v1/services/labels", { token: readToken }),
    );
    expect(
      await body<Array<{ id: string; serviceCount: number }>>(listed),
    ).toEqual([expect.objectContaining({ id, serviceCount: 0 })]);

    const renamed = await updateServiceLabel(
      request(`/api/v1/services/labels/${id}`, {
        method: "PATCH",
        token: writeToken,
        body: { color: "AMBER" },
      }),
      params({ labelId: id }),
    );
    expect(await body<{ color: string }>(renamed)).toMatchObject({
      color: "AMBER",
    });

    const removed = await deleteServiceLabel(
      request(`/api/v1/services/labels/${id}`, {
        method: "DELETE",
        token: writeToken,
      }),
      params({ labelId: id }),
    );
    expect(removed.status).toBe(200);
    expect(await body(removed)).toEqual({ deleted: id });
  });

  it("answers 409 on a duplicate label name", async () => {
    const first = await createServiceLabel(
      request("/api/v1/services/labels", {
        method: "POST",
        token: writeToken,
        body: { name: `${SHORT}-edge`, color: "BLUE" },
      }),
    );
    const { id } = await body<{ id: string }>(first);

    const duplicate = await createServiceLabel(
      request("/api/v1/services/labels", {
        method: "POST",
        token: writeToken,
        body: { name: `${SHORT}-EDGE`, color: "GREEN" },
      }),
    );
    expect(duplicate.status).toBe(409);
    expect(await body<{ error: { code: string } }>(duplicate)).toMatchObject({
      error: { code: "LABEL_NAME_CONFLICT" },
    });

    await deleteServiceLabel(
      request(`/api/v1/services/labels/${id}`, {
        method: "DELETE",
        token: writeToken,
      }),
      params({ labelId: id }),
    );
  });

  it("answers 404 for a label of another workspace", async () => {
    const created = await createServiceLabel(
      request("/api/v1/services/labels", {
        method: "POST",
        token: writeToken,
        body: { name: `${SHORT}-private`, color: "VIOLET" },
      }),
    );
    const { id } = await body<{ id: string }>(created);

    const response = await deleteServiceLabel(
      request(`/api/v1/services/labels/${id}`, {
        method: "DELETE",
        token: otherWorkspaceToken,
      }),
      params({ labelId: id }),
    );

    expect(response.status).toBe(404);
    expect(await db.serviceLabel.findUnique({ where: { id } })).not.toBe(null);
  });
});
