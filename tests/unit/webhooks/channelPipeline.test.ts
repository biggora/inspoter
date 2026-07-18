import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { env } from "@/lib/config/env";
import { db } from "@/lib/db";
import * as webhookTokensService from "@/lib/services/webhookTokens";
import { processChannelWebhook } from "@/lib/webhooks/channelPipeline";
import { checkRateLimit } from "@/lib/webhooks/ratelimit";

function request(
  body: unknown,
  options: { rawBody?: string; idempotencyKey?: string } = {},
) {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (options.idempotencyKey !== undefined) {
    headers.set("Idempotency-Key", options.idempotencyKey);
  }
  return new NextRequest("http://localhost/api/webhooks/channels/id/secret", {
    method: "POST",
    headers,
    body: options.rawBody ?? JSON.stringify(body),
  });
}

const PREFIX = `channel-pipeline-${randomUUID()}`;
let workspaceId: string;
let channelId: string;
let webhookId: string;
let secret: string;

beforeAll(async () => {
  const workspace = await db.workspace.create({
    data: {
      name: "Channel Pipeline Workspace",
      slug: `channel-pipeline-${randomUUID()}`,
    },
  });
  workspaceId = workspace.id;
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
  const created = await webhookTokensService.createForChannel(
    channelId,
    workspaceId,
    `${PREFIX}-CI`,
  );
  webhookId = created.webhook.id;
  secret = created.url.split("/").at(-1)!;
});

afterAll(async () => {
  if (workspaceId) {
    await db.workspace.delete({ where: { id: workspaceId } }).catch(() => {});
  }
});

describe("channel webhook authentication and validation", () => {
  it("rejects invalid credentials without creating a message", async () => {
    const before = await db.message.count({ where: { workspaceId } });
    const response = await processChannelWebhook(
      request({ content: "hello" }),
      webhookId,
      "invalid",
    );
    expect(response.status).toBe(401);
    expect(await db.message.count({ where: { workspaceId } })).toBe(before);
  });

  it("does not accept a legacy workspace token on the channel route", async () => {
    const legacy = await webhookTokensService.create(
      workspaceId,
      `${PREFIX}-legacy`,
    );
    const response = await processChannelWebhook(
      request({ content: "hello" }),
      legacy.id,
      legacy.token,
    );
    expect(response.status).toBe(401);
  });

  it("rejects attempted destination override and unknown fields", async () => {
    const response = await processChannelWebhook(
      request({ content: "hello", channelId: "foreign" }),
      webhookId,
      secret,
    );
    expect(response.status).toBe(400);
  });

  it("rejects whitespace-only/too-long content and invalid authors", async () => {
    for (const body of [
      { content: "   " },
      { content: "x".repeat(4_001) },
      { content: "valid", author: "   " },
      { content: "valid", author: "x".repeat(81) },
    ]) {
      const response = await processChannelWebhook(
        request(body),
        webhookId,
        secret,
      );
      expect(response.status).toBe(400);
    }
  });

  it("rejects malformed and oversized request bodies before delivery", async () => {
    expect(
      (
        await processChannelWebhook(
          request({}, { rawBody: "{bad-json" }),
          webhookId,
          secret,
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await processChannelWebhook(
          request({}, { rawBody: "x".repeat(env.WEBHOOK_MAX_BODY_BYTES + 1) }),
          webhookId,
          secret,
        )
      ).status,
    ).toBe(413);
  });

  it("validates Idempotency-Key as 1-128 printable ASCII bytes", async () => {
    for (const idempotencyKey of ["", "x".repeat(129), "café"]) {
      const response = await processChannelWebhook(
        request({ content: "hello" }, { idempotencyKey }),
        webhookId,
        secret,
      );
      expect(response.status).toBe(400);
    }
  });
});

describe("channel webhook delivery", () => {
  it("creates a WEBHOOK-origin message in the bound channel using the webhook name by default", async () => {
    const response = await processChannelWebhook(
      request({ content: "  Build deployed  " }),
      webhookId,
      secret,
    );
    const body = await response.json();
    expect(response.status).toBe(201);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("Referrer-Policy")).toBe("no-referrer");

    const stored = await db.message.findUnique({ where: { id: body.id } });
    expect(stored).toMatchObject({
      workspaceId,
      channelId,
      content: "Build deployed",
      author: `${PREFIX}-CI`,
      origin: "WEBHOOK",
    });
  });

  it("persists an explicit author as an immutable display snapshot", async () => {
    const response = await processChannelWebhook(
      request({ content: "hello", author: "Release Bot" }),
      webhookId,
      secret,
    );
    const body = await response.json();
    expect(
      await db.message.findUnique({
        where: { id: body.id },
        select: { author: true },
      }),
    ).toEqual({ author: "Release Bot" });
  });

  it("delivers repeated requests without a key at least once", async () => {
    const content = `${PREFIX}-no-key-${randomUUID()}`;
    const first = await processChannelWebhook(
      request({ content }),
      webhookId,
      secret,
    );
    const second = await processChannelWebhook(
      request({ content }),
      webhookId,
      secret,
    );
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(await db.message.count({ where: { workspaceId, content } })).toBe(2);
  });

  it("rolls back the losing message during a concurrent keyed race", async () => {
    const content = `${PREFIX}-race-${randomUUID()}`;
    const idempotencyKey = `race-${randomUUID()}`;
    const responses = await Promise.all([
      processChannelWebhook(
        request({ content }, { idempotencyKey }),
        webhookId,
        secret,
      ),
      processChannelWebhook(
        request({ content }, { idempotencyKey }),
        webhookId,
        secret,
      ),
    ]);
    const bodies = await Promise.all(
      responses.map((response) => response.json()),
    );

    expect(responses.map((response) => response.status).sort()).toEqual([
      200, 201,
    ]);
    expect(bodies[0].id).toBe(bodies[1].id);
    expect(await db.message.count({ where: { workspaceId, content } })).toBe(1);
    expect(
      await db.idempotencyKey.count({
        where: { tokenId: webhookId, key: idempotencyKey },
      }),
    ).toBe(1);
  });

  it("rejects a revoked credential immediately", async () => {
    const created = await webhookTokensService.createForChannel(
      channelId,
      workspaceId,
      `${PREFIX}-revoked`,
    );
    await webhookTokensService.revokeForChannel(
      channelId,
      created.webhook.id,
      workspaceId,
    );
    const response = await processChannelWebhook(
      request({ content: "not delivered" }),
      created.webhook.id,
      created.url.split("/").at(-1)!,
    );
    expect(response.status).toBe(401);
  });

  it("returns 429 with Retry-After once the per-token limit is exhausted", async () => {
    const created = await webhookTokensService.createForChannel(
      channelId,
      workspaceId,
      `${PREFIX}-rate`,
    );
    for (let index = 0; index < env.WEBHOOK_RATE_LIMIT; index += 1) {
      checkRateLimit(created.webhook.id);
    }
    const response = await processChannelWebhook(
      request({ content: "throttled" }),
      created.webhook.id,
      created.url.split("/").at(-1)!,
    );
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBeTruthy();
  });
});
