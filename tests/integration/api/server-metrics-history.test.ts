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
import type { Operator } from "@/generated/prisma/client";
import { db } from "@/lib/db";

// Contract of the two detail-page read routes. The emphasis is on absence:
// a server with no samples, a range that holds none, an unknown range, and an
// id from another workspace all have to produce an answer, never a crash.

const auth = vi.hoisted(() => ({
  context: null as AuthContext | null,
}));

vi.mock("@/lib/auth/dal", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/dal")>();
  return {
    ...actual,
    requireAuthWithWorkspaceHeader: vi.fn(async () => auth.context!),
  };
});

// No provider credentials exist for these workspaces, so the servers listing
// composes from LocalServer rows alone (no provider fan-out).
vi.mock("@/lib/providers/servers", () => ({
  getServerProvidersForWorkspace: async () => [],
}));

const PREFIX = `smh-api-${randomUUID()}`;
let operator: Operator;
let workspaceId: string;
let otherWorkspaceId: string;
let serverId: string;
let foreignServerId: string;

function request(path: string) {
  return new NextRequest(`http://localhost${path}`, {
    headers: { "X-Inspoter-Workspace": workspaceId },
  });
}

beforeAll(async () => {
  operator = await db.operator.create({
    data: { username: `${PREFIX}-operator` },
  });
  const [main, other] = await Promise.all([
    db.workspace.create({
      data: {
        name: `${PREFIX}-main`,
        slug: `${PREFIX}-main`,
        members: { create: { operatorId: operator.id, role: "OWNER" } },
      },
    }),
    db.workspace.create({
      data: { name: `${PREFIX}-other`, slug: `${PREFIX}-other` },
    }),
  ]);
  workspaceId = main.id;
  otherWorkspaceId = other.id;

  const [mine, foreign] = await Promise.all([
    db.localServer.create({
      data: { workspaceId, origin: "AGENT", displayName: "silent-server" },
    }),
    db.localServer.create({
      data: {
        workspaceId: otherWorkspaceId,
        origin: "AGENT",
        displayName: "foreign-server",
      },
    }),
  ]);
  serverId = mine.id;
  foreignServerId = foreign.id;
});

beforeEach(async () => {
  const workspace = await db.workspace.findUniqueOrThrow({
    where: { id: workspaceId },
  });
  auth.context = { workspace, operator };
});

afterAll(async () => {
  await db.workspace.deleteMany({
    where: { id: { in: [workspaceId, otherWorkspaceId] } },
  });
  await db.operator.deleteMany({ where: { id: operator.id } });
});

async function getServer(id: string) {
  const { GET } = await import("@/app/api/servers/local/[id]/route");
  return GET(request(`/api/servers/local/${id}`), {
    params: Promise.resolve({ id }),
  });
}

async function getHistory(id: string, range: string) {
  const { GET } = await import("@/app/api/servers/local/[id]/metrics/route");
  return GET(request(`/api/servers/local/${id}/metrics?range=${range}`), {
    params: Promise.resolve({ id }),
  });
}

describe("GET /api/servers/local/[id]", () => {
  it("describes a server that has never reported, with null metrics", async () => {
    const response = await getServer(serverId);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      localServerId: serverId,
      origin: "agent",
      name: "silent-server",
      metrics: { state: "not_configured", receivedAt: null, load1: null },
    });
  });

  it("404s for an unknown id instead of failing", async () => {
    const response = await getServer("does-not-exist");
    expect(response.status).toBe(404);
  });

  it("404s for a server owned by another workspace", async () => {
    const response = await getServer(foreignServerId);
    expect(response.status).toBe(404);
  });
});

describe("GET /api/servers/local/[id]/metrics", () => {
  it("returns an empty series for a server with no samples", async () => {
    const response = await getHistory(serverId, "24h");

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.points).toEqual([]);
    expect(body.reboots).toEqual([]);
    expect(body.range).toBe("24h");
    expect(body.bucketSeconds).toBe(600);
  });

  it("returns an empty series when every sample predates the range", async () => {
    await db.serverMetricSample.create({
      data: {
        workspaceId,
        localServerId: serverId,
        capturedAt: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000),
        cpuUsagePercent: 50,
        load1: 1,
        load5: 1,
        load15: 1,
        memoryTotalBytes: BigInt(1024),
        memoryAvailableBytes: BigInt(512),
        swapTotalBytes: BigInt(0),
        swapFreeBytes: BigInt(0),
        filesystemTotalBytes: BigInt(2048),
        filesystemAvailableBytes: BigInt(1024),
        uptimeSeconds: BigInt(60),
      },
    });

    const response = await getHistory(serverId, "24h");

    expect(response.status).toBe(200);
    expect((await response.json()).points).toEqual([]);
  });

  it("rejects an unknown range with 400 and names the valid ones", async () => {
    const response = await getHistory(serverId, "1y");

    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain("24h");
  });

  it("rejects a missing range with 400", async () => {
    const { GET } = await import("@/app/api/servers/local/[id]/metrics/route");
    const response = await GET(
      request(`/api/servers/local/${serverId}/metrics`),
      { params: Promise.resolve({ id: serverId }) },
    );

    expect(response.status).toBe(400);
  });

  it("404s for another workspace's server rather than returning its series", async () => {
    const response = await getHistory(foreignServerId, "24h");
    expect(response.status).toBe(404);
  });
});
