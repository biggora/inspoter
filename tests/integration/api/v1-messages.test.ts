import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import * as webhookTokensService from "@/lib/services/webhookTokens";
import {
  GET as listCategories,
  POST as createCategory,
} from "@/app/api/v1/messages/categories/route";
import { PATCH as renameCategory } from "@/app/api/v1/messages/categories/[categoryId]/route";
import { POST as createChannel } from "@/app/api/v1/messages/channels/route";
import {
  GET as getChannel,
  PATCH as renameChannel,
} from "@/app/api/v1/messages/channels/[channelId]/route";
import { POST as markChannelRead } from "@/app/api/v1/messages/channels/[channelId]/read/route";
import {
  GET as listMessages,
  POST as sendMessage,
} from "@/app/api/v1/messages/channels/[channelId]/messages/route";
import {
  GET as listWebhooks,
  POST as createWebhook,
} from "@/app/api/v1/messages/channels/[channelId]/webhooks/route";
import { DELETE as revokeWebhook } from "@/app/api/v1/messages/channels/[channelId]/webhooks/[webhookId]/route";

// /api/v1/messages/** end-to-end: the bearer token is the only authority, it
// carries the workspace, and the scope decides read from write. No session
// cookie and no X-Inspoter-Workspace header are involved anywhere here.

const PREFIX = `v1-messages-${randomUUID()}`;

let workspaceId: string;
let otherWorkspaceId: string;
let writeToken: string;
let readToken: string;
let scopelessToken: string;
let revokedToken: string;
let channelWebhookToken: string;
let otherWorkspaceToken: string;
let categoryId: string;
let channelId: string;
let otherChannelId: string;

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
      "messages:read",
      "messages:write",
    ])
  ).token;
  readToken = (
    await webhookTokensService.create(workspaceId, "agent-ro", [
      "messages:read",
    ])
  ).token;
  scopelessToken = (await webhookTokensService.create(workspaceId, "ingest"))
    .token;
  otherWorkspaceToken = (
    await webhookTokensService.create(otherWorkspaceId, "other", [
      "messages:read",
      "messages:write",
    ])
  ).token;

  const revoked = await webhookTokensService.create(workspaceId, "revoked", [
    "messages:write",
  ]);
  await webhookTokensService.revoke(revoked.id, workspaceId);
  revokedToken = revoked.token;

  const category = await db.messageCategory.create({
    data: {
      workspaceId,
      name: `${PREFIX}-category`,
      normalizedName: randomUUID(),
    },
  });
  categoryId = category.id;
  const channel = await db.channel.create({
    data: {
      workspaceId,
      messageCategoryId: category.id,
      messageCategoryWorkspaceId: workspaceId,
      normalizedName: randomUUID(),
      name: `${PREFIX}-channel`,
    },
  });
  channelId = channel.id;
  channelWebhookToken = (
    await webhookTokensService.createForChannel(
      channel.id,
      workspaceId,
      "channel",
    )
  ).url
    .split("/")
    .pop() as string;

  const otherCategory = await db.messageCategory.create({
    data: {
      workspaceId: otherWorkspaceId,
      name: `${PREFIX}-other-category`,
      normalizedName: randomUUID(),
    },
  });
  const otherChannel = await db.channel.create({
    data: {
      workspaceId: otherWorkspaceId,
      messageCategoryId: otherCategory.id,
      messageCategoryWorkspaceId: otherWorkspaceId,
      normalizedName: randomUUID(),
      name: `${PREFIX}-other-channel`,
    },
  });
  otherChannelId = otherChannel.id;
});

afterAll(async () => {
  await Promise.all([
    db.workspace.delete({ where: { id: workspaceId } }).catch(() => {}),
    db.workspace.delete({ where: { id: otherWorkspaceId } }).catch(() => {}),
  ]);
});

describe("authentication and scopes", () => {
  it("rejects a request with no Authorization header", async () => {
    const response = await listCategories(
      request("/api/v1/messages/categories"),
    );

    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toContain("Bearer");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("rejects unknown, revoked, channel-scoped and scopeless tokens", async () => {
    for (const token of [
      "not-a-real-token",
      revokedToken,
      channelWebhookToken,
      scopelessToken,
    ]) {
      const response = await listCategories(
        request("/api/v1/messages/categories", { token }),
      );
      expect(response.status).toBe(401);
    }
  });

  it("rejects a read-only token on a write operation", async () => {
    const response = await createCategory(
      request("/api/v1/messages/categories", {
        method: "POST",
        token: readToken,
        body: { name: "Should not exist" },
      }),
    );

    expect(response.status).toBe(403);
    expect((await body<{ error: { code: string } }>(response)).error.code).toBe(
      "FORBIDDEN",
    );
    expect(
      await db.messageCategory.count({ where: { name: "Should not exist" } }),
    ).toBe(0);
  });

  it("rejects a malformed body with the zod issues attached", async () => {
    const response = await createCategory(
      request("/api/v1/messages/categories", {
        method: "POST",
        token: writeToken,
        body: { name: "" },
      }),
    );

    expect(response.status).toBe(400);
    const payload = await body<{
      error: { code: string; issues: unknown[] };
    }>(response);
    expect(payload.error.code).toBe("VALIDATION_FAILED");
    expect(payload.error.issues.length).toBeGreaterThan(0);
  });

  it("rejects an unknown field rather than ignoring it", async () => {
    const response = await createCategory(
      request("/api/v1/messages/categories", {
        method: "POST",
        token: writeToken,
        body: { name: "Strict", unexpected: true },
      }),
    );

    expect(response.status).toBe(400);
  });
});

describe("categories and channels", () => {
  it("creates a category once and answers 200 on a repeat call", async () => {
    const first = await createCategory(
      request("/api/v1/messages/categories", {
        method: "POST",
        token: writeToken,
        body: { name: "Deployments" },
      }),
    );
    const created = await body<{ id: string }>(first);
    expect(first.status).toBe(201);

    // Matching is case-insensitive, so this returns the same row.
    const second = await createCategory(
      request("/api/v1/messages/categories", {
        method: "POST",
        token: writeToken,
        body: { name: "deployments" },
      }),
    );
    expect(second.status).toBe(200);
    expect((await body<{ id: string }>(second)).id).toBe(created.id);
  });

  it("lists categories with their channels", async () => {
    const response = await listCategories(
      request("/api/v1/messages/categories", { token: readToken }),
    );
    const categories =
      await body<Array<{ id: string; channels: Array<{ id: string }> }>>(
        response,
      );

    expect(response.status).toBe(200);
    const seeded = categories.find((entry) => entry.id === categoryId);
    expect(seeded?.channels.map((channel) => channel.id)).toEqual([channelId]);
  });

  it("renames a category and a channel", async () => {
    const category = await renameCategory(
      request(`/api/v1/messages/categories/${categoryId}`, {
        method: "PATCH",
        token: writeToken,
        body: { name: `${PREFIX}-category-renamed` },
      }),
      params({ categoryId }),
    );
    expect((await body<{ name: string }>(category)).name).toBe(
      `${PREFIX}-category-renamed`,
    );

    const channel = await renameChannel(
      request(`/api/v1/messages/channels/${channelId}`, {
        method: "PATCH",
        token: writeToken,
        body: { name: `${PREFIX}-channel-renamed` },
      }),
      params({ channelId }),
    );
    expect((await body<{ name: string }>(channel)).name).toBe(
      `${PREFIX}-channel-renamed`,
    );
  });

  it("returns 409 when a rename collides after normalization", async () => {
    const firstCategoryResponse = await createCategory(
      request("/api/v1/messages/categories", {
        method: "POST",
        token: writeToken,
        body: { name: "Release notes" },
      }),
    );
    const secondCategoryResponse = await createCategory(
      request("/api/v1/messages/categories", {
        method: "POST",
        token: writeToken,
        body: { name: "Incidents archive" },
      }),
    );
    const firstCategory = await body<{ id: string }>(firstCategoryResponse);
    const secondCategory = await body<{ id: string }>(secondCategoryResponse);

    const categoryConflict = await renameCategory(
      request(`/api/v1/messages/categories/${secondCategory.id}`, {
        method: "PATCH",
        token: writeToken,
        body: { name: "  RELEASE   NOTES  " },
      }),
      params({ categoryId: secondCategory.id }),
    );
    expect(categoryConflict.status).toBe(409);
    expect(
      (await body<{ error: { code: string } }>(categoryConflict)).error.code,
    ).toBe("MESSAGE_NAME_CONFLICT");

    const firstChannelResponse = await createChannel(
      request("/api/v1/messages/channels", {
        method: "POST",
        token: writeToken,
        body: { categoryId: firstCategory.id, name: "Production" },
      }),
    );
    const secondChannelResponse = await createChannel(
      request("/api/v1/messages/channels", {
        method: "POST",
        token: writeToken,
        body: { categoryId: firstCategory.id, name: "Staging" },
      }),
    );
    const firstChannel = await body<{ id: string }>(firstChannelResponse);
    const secondChannel = await body<{ id: string }>(secondChannelResponse);

    const channelConflict = await renameChannel(
      request(`/api/v1/messages/channels/${secondChannel.id}`, {
        method: "PATCH",
        token: writeToken,
        body: { name: " production " },
      }),
      params({ channelId: secondChannel.id }),
    );
    expect(channelConflict.status).toBe(409);
    expect(
      (await body<{ error: { code: string } }>(channelConflict)).error.code,
    ).toBe("MESSAGE_NAME_CONFLICT");

    expect(firstChannel.id).not.toBe(secondChannel.id);
  });

  it("creates a channel in a category and repeats idempotently", async () => {
    const first = await createChannel(
      request("/api/v1/messages/channels", {
        method: "POST",
        token: writeToken,
        body: { categoryId, name: "incidents" },
      }),
    );
    expect(first.status).toBe(201);
    const created = await body<{ id: string }>(first);

    const second = await createChannel(
      request("/api/v1/messages/channels", {
        method: "POST",
        token: writeToken,
        body: { categoryId, name: "Incidents" },
      }),
    );
    expect(second.status).toBe(200);
    expect((await body<{ id: string }>(second)).id).toBe(created.id);
  });

  it("answers 404 for a category in another workspace", async () => {
    const response = await createChannel(
      request("/api/v1/messages/channels", {
        method: "POST",
        token: otherWorkspaceToken,
        body: { categoryId, name: "cross-tenant" },
      }),
    );

    expect(response.status).toBe(404);
    expect(await db.channel.count({ where: { name: "cross-tenant" } })).toBe(0);
  });
});

describe("messages", () => {
  it("posts a message stamped as agent-written and lists it back", async () => {
    const response = await sendMessage(
      request(`/api/v1/messages/channels/${channelId}/messages`, {
        method: "POST",
        token: writeToken,
        body: { content: "Deploy finished on web-01." },
      }),
      params({ channelId }),
    );
    expect(response.status).toBe(201);
    const { id } = await body<{ id: string }>(response);

    const stored = await db.message.findUnique({ where: { id } });
    expect(stored?.origin).toBe("AGENT");
    // No explicit author, so the token's name identifies the writer.
    expect(stored?.author).toBe("agent");

    const listed = await listMessages(
      request(`/api/v1/messages/channels/${channelId}/messages`, {
        token: readToken,
      }),
      params({ channelId }),
    );
    const page = await body<{ items: Array<{ id: string }> }>(listed);
    expect(page.items.map((item) => item.id)).toContain(id);
  });

  it("keeps an explicit author", async () => {
    const response = await sendMessage(
      request(`/api/v1/messages/channels/${channelId}/messages`, {
        method: "POST",
        token: writeToken,
        body: { content: "Nightly backup done.", author: "backup-bot" },
      }),
      params({ channelId }),
    );
    const { id } = await body<{ id: string }>(response);

    expect((await db.message.findUnique({ where: { id } }))?.author).toBe(
      "backup-bot",
    );
  });

  it("answers 404 for a channel in another workspace", async () => {
    const response = await sendMessage(
      request(`/api/v1/messages/channels/${otherChannelId}/messages`, {
        method: "POST",
        token: writeToken,
        body: { content: "cross-tenant message" },
      }),
      params({ channelId: otherChannelId }),
    );

    expect(response.status).toBe(404);
    expect(
      await db.message.count({ where: { content: "cross-tenant message" } }),
    ).toBe(0);
  });
});

describe("channel webhooks", () => {
  it("issues a webhook url once, lists it without the secret, and revokes it", async () => {
    const created = await createWebhook(
      request(`/api/v1/messages/channels/${channelId}/webhooks`, {
        method: "POST",
        token: writeToken,
        body: { name: "CI pipeline" },
      }),
      params({ channelId }),
    );
    expect(created.status).toBe(201);
    expect(created.headers.get("referrer-policy")).toBe("no-referrer");
    const payload = await body<{
      webhook: { id: string; tokenPrefix: string };
      url: string;
    }>(created);
    expect(payload.url).toContain(
      `/api/webhooks/channels/${payload.webhook.id}/`,
    );

    const listed = await listWebhooks(
      request(`/api/v1/messages/channels/${channelId}/webhooks`, {
        token: readToken,
      }),
      params({ channelId }),
    );
    const webhooks = await body<Array<Record<string, unknown>>>(listed);
    const entry = webhooks.find((item) => item.id === payload.webhook.id);
    expect(entry).toBeDefined();
    expect(entry).not.toHaveProperty("url");
    expect(entry).not.toHaveProperty("tokenHash");

    const revoked = await revokeWebhook(
      request(
        `/api/v1/messages/channels/${channelId}/webhooks/${payload.webhook.id}`,
        { method: "DELETE", token: writeToken },
      ),
      params({ channelId, webhookId: payload.webhook.id }),
    );
    expect(revoked.status).toBe(200);
    expect(
      (await db.webhookToken.findUnique({ where: { id: payload.webhook.id } }))
        ?.revokedAt,
    ).not.toBeNull();
  });

  it("answers 404 when revoking a webhook of another workspace's channel", async () => {
    const response = await revokeWebhook(
      request(
        `/api/v1/messages/channels/${otherChannelId}/webhooks/nonexistent`,
        { method: "DELETE", token: writeToken },
      ),
      params({ channelId: otherChannelId, webhookId: "nonexistent" }),
    );

    expect(response.status).toBe(404);
  });
});

describe("channel lookup and read state", () => {
  it("reads one channel by id", async () => {
    const response = await getChannel(
      request(`/api/v1/messages/channels/${channelId}`, { token: readToken }),
      params({ channelId }),
    );

    expect(response.status).toBe(200);
    expect(await body<{ id: string; name: string }>(response)).toMatchObject({
      id: channelId,
    });
  });

  it("answers 404 for a channel of another workspace", async () => {
    const response = await getChannel(
      request(`/api/v1/messages/channels/${otherChannelId}`, {
        token: readToken,
      }),
      params({ channelId: otherChannelId }),
    );

    expect(response.status).toBe(404);
  });

  it("clears a channel's unread messages", async () => {
    await sendMessage(
      request(`/api/v1/messages/channels/${channelId}/messages`, {
        method: "POST",
        token: writeToken,
        body: { content: "unread until marked" },
      }),
      params({ channelId }),
    );
    expect(
      await db.message.count({ where: { channelId, isRead: false } }),
    ).toBeGreaterThan(0);

    const response = await markChannelRead(
      request(`/api/v1/messages/channels/${channelId}/read`, {
        method: "POST",
        token: writeToken,
      }),
      params({ channelId }),
    );

    expect(response.status).toBe(200);
    expect((await body<{ updated: number }>(response)).updated).toBeGreaterThan(
      0,
    );
    expect(
      await db.message.count({ where: { channelId, isRead: false } }),
    ).toBe(0);
  });

  it("keeps mark-read behind the write scope", async () => {
    const response = await markChannelRead(
      request(`/api/v1/messages/channels/${channelId}/read`, {
        method: "POST",
        token: readToken,
      }),
      params({ channelId }),
    );

    expect(response.status).toBe(403);
  });
});
