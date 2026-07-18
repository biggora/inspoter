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

const PREFIX = `channel-routes-${randomUUID()}`;
let workspaceId: string;
let otherWorkspaceId: string;
let channelId: string;

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
  const category = await db.messageCategory.create({
    data: { workspaceId, name: `${PREFIX}-category` },
  });
  const channel = await db.channel.create({
    data: {
      workspaceId,
      messageCategoryId: category.id,
      messageCategoryWorkspaceId: workspaceId,
      name: `${PREFIX}-channel`,
    },
  });
  channelId = channel.id;
});

beforeEach(async () => {
  const workspace = await db.workspace.findUniqueOrThrow({
    where: { id: workspaceId },
  });
  auth.context = {
    workspace,
    operator: {
      id: "test-operator",
      username: "test-operator",
      email: null,
      passwordHash: null,
      createdAt: new Date(),
    },
  };
});

afterAll(async () => {
  await db.workspace.deleteMany({
    where: { id: { in: [workspaceId, otherWorkspaceId] } },
  });
});

describe("channel webhook management routes", () => {
  it("creates once and lists metadata without returning token material", async () => {
    const { POST, GET } =
      await import("@/app/api/channels/[id]/webhooks/route");
    const createResponse = await POST(
      request(`/api/channels/${channelId}/webhooks`, {
        method: "POST",
        body: JSON.stringify({ name: "CI" }),
      }),
      { params: Promise.resolve({ id: channelId }) },
    );
    const created = await createResponse.json();
    expect(createResponse.status).toBe(201);
    expect(createResponse.headers.get("Cache-Control")).toBe(
      "private, no-store",
    );
    expect(createResponse.headers.get("Referrer-Policy")).toBe("no-referrer");
    expect(created).toMatchObject({
      webhook: { channelId, name: "CI" },
    });
    expect(created.url).toMatch(
      new RegExp(`^/api/webhooks/channels/${created.webhook.id}/[0-9a-f]{48}$`),
    );

    const listResponse = await GET(
      request(`/api/channels/${channelId}/webhooks`),
      { params: Promise.resolve({ id: channelId }) },
    );
    const list = await listResponse.json();
    expect(listResponse.status).toBe(200);
    const listed = list.find(
      (item: { id: string }) => item.id === created.webhook.id,
    );
    expect(listed).toBeTruthy();
    expect(listed).not.toHaveProperty("url");
    expect(listed).not.toHaveProperty("token");
    expect(listed).not.toHaveProperty("tokenHash");
  });

  it("strictly validates the management body and name length", async () => {
    const { POST } = await import("@/app/api/channels/[id]/webhooks/route");
    for (const body of [
      { name: "" },
      { name: "x".repeat(81) },
      { name: "CI", unexpected: true },
    ]) {
      const response = await POST(
        request(`/api/channels/${channelId}/webhooks`, {
          method: "POST",
          body: JSON.stringify(body),
        }),
        { params: Promise.resolve({ id: channelId }) },
      );
      expect(response.status).toBe(400);
    }
  });

  it("returns a non-disclosing 404 for a channel outside the active workspace", async () => {
    const other = await db.workspace.findUniqueOrThrow({
      where: { id: otherWorkspaceId },
    });
    auth.context = { ...auth.context!, workspace: other };
    const { GET } = await import("@/app/api/channels/[id]/webhooks/route");
    const response = await GET(request(`/api/channels/${channelId}/webhooks`), {
      params: Promise.resolve({ id: channelId }),
    });
    expect(response.status).toBe(404);
  });

  it("soft-revokes only the webhook matching channel and workspace", async () => {
    const { POST } = await import("@/app/api/channels/[id]/webhooks/route");
    const createResponse = await POST(
      request(`/api/channels/${channelId}/webhooks`, {
        method: "POST",
        body: JSON.stringify({ name: "Revoke me" }),
      }),
      { params: Promise.resolve({ id: channelId }) },
    );
    const created = await createResponse.json();
    const { DELETE } =
      await import("@/app/api/channels/[id]/webhooks/[webhookId]/route");
    const response = await DELETE(
      request(`/api/channels/${channelId}/webhooks/${created.webhook.id}`, {
        method: "DELETE",
      }),
      {
        params: Promise.resolve({
          id: channelId,
          webhookId: created.webhook.id,
        }),
      },
    );
    expect(response.status).toBe(204);
    expect(
      await db.webhookToken.findUnique({
        where: { id: created.webhook.id },
        select: { revokedAt: true },
      }),
    ).toEqual({ revokedAt: expect.any(Date) });
  });
});

describe("operator message origin", () => {
  it("persists OPERATOR with the authenticated username snapshot", async () => {
    const { POST } = await import("@/app/api/channels/[id]/messages/route");
    const response = await POST(
      request(`/api/channels/${channelId}/messages`, {
        method: "POST",
        body: JSON.stringify({ content: `${PREFIX}-operator-message` }),
      }),
      { params: Promise.resolve({ id: channelId }) },
    );
    const body = await response.json();
    expect(response.status).toBe(201);
    expect(
      await db.message.findUnique({
        where: { id: body.id },
        select: { origin: true, author: true },
      }),
    ).toEqual({ origin: "OPERATOR", author: "test-operator" });
  });
});
