import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { env } from "@/lib/config/env";
import { db } from "@/lib/db";
import * as webhookTokensService from "@/lib/services/webhookTokens";
import {
  executeDiscordWebhook,
  executeSlackWebhook,
  getDiscordWebhook,
} from "@/lib/webhooks/discordPipeline";
import { checkRateLimit } from "@/lib/webhooks/ratelimit";

// specs/discord-webhook-compatibility.md §2-§5.

interface RequestOptions {
  rawBody?: string;
  idempotencyKey?: string;
  query?: string;
  form?: FormData;
}

function request(body: unknown, options: RequestOptions = {}) {
  const headers = new Headers();
  if (!options.form) headers.set("Content-Type", "application/json");
  if (options.idempotencyKey !== undefined) {
    headers.set("Idempotency-Key", options.idempotencyKey);
  }
  return new NextRequest(
    `http://localhost/api/discord/webhooks/id/secret${options.query ?? ""}`,
    {
      method: "POST",
      headers,
      body: options.form ?? options.rawBody ?? JSON.stringify(body),
    },
  );
}

const PREFIX = `discord-pipeline-${randomUUID()}`;
let workspaceId: string;
let channelId: string;
let webhookId: string;
let secret: string;

async function freshWebhook(name: string) {
  const created = await webhookTokensService.createForChannel(
    channelId,
    workspaceId,
    `${PREFIX}-${name}`,
  );
  return {
    id: created.webhook.id,
    secret: created.url.split("/").at(-1)!,
  };
}

beforeAll(async () => {
  const workspace = await db.workspace.create({
    data: {
      name: "Discord Pipeline Workspace",
      slug: `discord-pipeline-${randomUUID()}`,
    },
  });
  workspaceId = workspace.id;
  const category = await db.messageCategory.create({
    data: { workspaceId, name: `${PREFIX}-category`, normalizedName: randomUUID() },
  });
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
  const created = await freshWebhook("CI");
  webhookId = created.id;
  secret = created.secret;
});

afterAll(async () => {
  if (workspaceId) {
    await db.workspace.delete({ where: { id: workspaceId } }).catch(() => {});
  }
});

describe("Discord webhook responses", () => {
  it("answers 204 with no body by default", async () => {
    const content = `${PREFIX}-204-${randomUUID()}`;
    const response = await executeDiscordWebhook(
      request({ content }),
      webhookId,
      secret,
    );
    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await db.message.count({ where: { workspaceId, content } })).toBe(1);
  });

  it("answers 200 with a Discord message object when wait=true", async () => {
    const content = `${PREFIX}-wait-${randomUUID()}`;
    const response = await executeDiscordWebhook(
      request(
        {
          content,
          username: "Release Bot",
          embeds: [{ title: "Build 842", color: 5763719 }],
        },
        { query: "?wait=true" },
      ),
      webhookId,
      secret,
    );
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body).toMatchObject({
      type: 0,
      content,
      tts: false,
      flags: 0,
      pinned: false,
      mention_everyone: false,
      mentions: [],
      mention_roles: [],
      attachments: [],
      edited_timestamp: null,
    });
    // Discord ids are numeric strings; ours are surrogates but keep the shape.
    expect(body.id).toMatch(/^\d+$/);
    expect(body.channel_id).toMatch(/^\d+$/);
    expect(body.author).toMatchObject({ username: "Release Bot", bot: true });
    expect(body.embeds).toEqual([{ title: "Build 842", color: 5763719 }]);
  });

  it("stores the Discord extras on the message row", async () => {
    const content = `${PREFIX}-stored-${randomUUID()}`;
    await executeDiscordWebhook(
      request({
        content,
        username: "Release Bot",
        avatar_url: "https://cdn.example.test/bot.png",
        tts: true,
        embeds: [
          {
            title: "Build 842",
            fields: [{ name: "branch", value: "main", inline: true }],
          },
        ],
      }),
      webhookId,
      secret,
    );

    const stored = await db.message.findFirst({
      where: { workspaceId, content },
    });
    expect(stored).toMatchObject({
      author: "Release Bot",
      origin: "WEBHOOK",
      avatarUrl: "https://cdn.example.test/bot.png",
      tts: true,
      flags: 0,
    });
    expect(stored?.embeds).toEqual([
      {
        title: "Build 842",
        fields: [{ name: "branch", value: "main", inline: true }],
      },
    ]);
  });

  it("drops embeds when SUPPRESS_EMBEDS is set but keeps the content", async () => {
    const content = `${PREFIX}-suppress-${randomUUID()}`;
    const response = await executeDiscordWebhook(
      request(
        { content, flags: 4, embeds: [{ title: "hidden" }] },
        { query: "?wait=true" },
      ),
      webhookId,
      secret,
    );
    const body = await response.json();
    expect(body.flags).toBe(4);
    expect(body.embeds).toEqual([]);

    const stored = await db.message.findFirst({
      where: { workspaceId, content },
    });
    expect(stored?.embeds).toEqual([]);
  });

  it("falls back to the webhook name when no username is supplied", async () => {
    const content = `${PREFIX}-default-author-${randomUUID()}`;
    await executeDiscordWebhook(request({ content }), webhookId, secret);
    const stored = await db.message.findFirst({
      where: { workspaceId, content },
    });
    expect(stored?.author).toBe(`${PREFIX}-CI`);
  });
});

describe("Discord webhook errors", () => {
  it("returns Discord's 401 for a bad secret and for an unknown id alike", async () => {
    const before = await db.message.count({ where: { workspaceId } });

    for (const [id, token] of [
      [webhookId, "invalid"],
      ["does-not-exist", secret],
    ]) {
      const response = await executeDiscordWebhook(
        request({ content: "nope" }),
        id,
        token,
      );
      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({
        message: "401: Unauthorized",
        code: 0,
      });
    }
    expect(await db.message.count({ where: { workspaceId } })).toBe(before);
  });

  it("returns 50006 when the body carries nothing displayable", async () => {
    const response = await executeDiscordWebhook(
      request({ tts: true }),
      webhookId,
      secret,
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: 50006,
      message: "Cannot send an empty message",
    });
  });

  it("returns 50035 with a field tree when a limit is exceeded", async () => {
    const response = await executeDiscordWebhook(
      request({ content: "x".repeat(2001) }),
      webhookId,
      secret,
    );
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.code).toBe(50035);
    expect(body.message).toBe("Invalid Form Body");
    expect(body.errors.content._errors[0].code).toBe("BASE_TYPE_MAX_LENGTH");
  });

  it("returns 50035 on the embeds path when the 6000-character budget is blown", async () => {
    const response = await executeDiscordWebhook(
      request({
        embeds: [
          { description: "x".repeat(4000) },
          { description: "y".repeat(2001) },
        ],
      }),
      webhookId,
      secret,
    );
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.code).toBe(50035);
    expect(body.errors.embeds._errors).toHaveLength(1);
  });

  it("returns 400 for unparseable JSON and 40005 for an oversized body", async () => {
    const malformed = await executeDiscordWebhook(
      request({}, { rawBody: "{bad-json" }),
      webhookId,
      secret,
    );
    expect(malformed.status).toBe(400);
    await expect(malformed.json()).resolves.toMatchObject({ code: 0 });

    const oversized = await executeDiscordWebhook(
      request({}, { rawBody: "x".repeat(env.WEBHOOK_MAX_BODY_BYTES + 1) }),
      webhookId,
      secret,
    );
    expect(oversized.status).toBe(413);
    await expect(oversized.json()).resolves.toMatchObject({ code: 40005 });
  });

  it("accepts unknown properties instead of rejecting them", async () => {
    const content = `${PREFIX}-unknown-${randomUUID()}`;
    const response = await executeDiscordWebhook(
      request({ content, nonce: "42", channelId: "foreign" }),
      webhookId,
      secret,
    );
    // The strict native route answers 400 for exactly this body.
    expect(response.status).toBe(204);
    const stored = await db.message.findFirst({
      where: { workspaceId, content },
    });
    expect(stored?.channelId).toBe(channelId);
  });
});

describe("Discord rate limiting", () => {
  it("emits X-RateLimit headers on a successful delivery", async () => {
    const webhook = await freshWebhook("headers");
    const response = await executeDiscordWebhook(
      request({ content: `${PREFIX}-headers-${randomUUID()}` }),
      webhook.id,
      webhook.secret,
    );
    expect(response.status).toBe(204);
    expect(response.headers.get("X-RateLimit-Limit")).toBe(
      String(env.WEBHOOK_RATE_LIMIT),
    );
    expect(Number(response.headers.get("X-RateLimit-Remaining"))).toBe(
      env.WEBHOOK_RATE_LIMIT - 1,
    );
    expect(response.headers.get("X-RateLimit-Bucket")).toMatch(/^[0-9a-f]{8}$/);
    expect(
      Number(response.headers.get("X-RateLimit-Reset-After")),
    ).toBeGreaterThan(0);
  });

  it("returns Discord's 429 body once the window is exhausted", async () => {
    const webhook = await freshWebhook("rate");
    for (let index = 0; index < env.WEBHOOK_RATE_LIMIT; index += 1) {
      checkRateLimit(webhook.id);
    }
    const response = await executeDiscordWebhook(
      request({ content: "throttled" }),
      webhook.id,
      webhook.secret,
    );
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBeTruthy();
    expect(response.headers.get("X-RateLimit-Scope")).toBe("user");

    const body = await response.json();
    expect(body.message).toBe("You are being rate limited.");
    expect(body.global).toBe(false);
    expect(typeof body.retry_after).toBe("number");
  });
});

describe("Discord webhook idempotency", () => {
  it("creates the message once and replays the same id", async () => {
    const content = `${PREFIX}-key-${randomUUID()}`;
    const idempotencyKey = `key-${randomUUID()}`;

    const first = await executeDiscordWebhook(
      request({ content }, { idempotencyKey, query: "?wait=true" }),
      webhookId,
      secret,
    );
    const second = await executeDiscordWebhook(
      request({ content }, { idempotencyKey, query: "?wait=true" }),
      webhookId,
      secret,
    );

    const [firstBody, secondBody] = await Promise.all([
      first.json(),
      second.json(),
    ]);
    expect(firstBody.id).toBe(secondBody.id);
    expect(await db.message.count({ where: { workspaceId, content } })).toBe(1);
  });

  it("rejects a malformed Idempotency-Key as a form-body error", async () => {
    const response = await executeDiscordWebhook(
      request({ content: "hello" }, { idempotencyKey: "café" }),
      webhookId,
      secret,
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ code: 50035 });
  });
});

describe("multipart bodies", () => {
  it("rejects an invalid token before parsing a malformed multipart body", async () => {
    const malformed = new NextRequest(
      `http://localhost/api/discord/webhooks/${webhookId}/invalid`,
      {
        method: "POST",
        headers: { "content-type": "multipart/form-data; boundary=broken" },
        body: "this is not a multipart body",
      },
    );
    const response = await executeDiscordWebhook(
      malformed,
      webhookId,
      "invalid",
    );
    expect(response.status).toBe(401);
  });

  it("reads the message from payload_json", async () => {
    const content = `${PREFIX}-multipart-${randomUUID()}`;
    const form = new FormData();
    form.set("payload_json", JSON.stringify({ content, username: "CI" }));

    const response = await executeDiscordWebhook(
      request(null, { form, query: "?wait=true" }),
      webhookId,
      secret,
    );
    expect(response.status).toBe(200);
    expect((await response.json()).content).toBe(content);
  });

  it("accepts a file-only request even though the file is not stored", async () => {
    const form = new FormData();
    form.set("files[0]", new Blob(["log output"]), "build.log");

    const response = await executeDiscordWebhook(
      request(null, { form, query: "?wait=true" }),
      webhookId,
      secret,
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.content).toBe("");
    expect(body.attachments).toEqual([]);
  });
});

describe("Get Webhook with Token", () => {
  it("returns a Discord webhook object", async () => {
    const response = await getDiscordWebhook(
      new NextRequest(
        `http://localhost/api/discord/webhooks/${webhookId}/${secret}`,
      ),
      webhookId,
      secret,
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      type: 1,
      name: `${PREFIX}-CI`,
      avatar: null,
      guild_id: null,
      application_id: null,
      token: secret,
    });
    expect(body.id).toMatch(/^\d+$/);
    expect(body.url).toContain(`/api/discord/webhooks/${webhookId}/`);
  });

  it("returns 401 for a bad secret", async () => {
    const response = await getDiscordWebhook(
      new NextRequest("http://localhost/api/discord/webhooks/id/secret"),
      webhookId,
      "invalid",
    );
    expect(response.status).toBe(401);
  });
});

describe("Slack-compatible suffix", () => {
  it("turns text and attachments into content and embeds, waiting by default", async () => {
    const text = `${PREFIX}-slack-${randomUUID()}`;
    const response = await executeSlackWebhook(
      request({
        text,
        username: "CI",
        attachments: [
          {
            title: "Build 842",
            text: "passed",
            color: "good",
            fields: [{ title: "branch", value: "main", short: true }],
          },
        ],
      }),
      webhookId,
      secret,
    );

    // Discord's /slack endpoint defaults wait to true.
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.content).toBe(text);
    expect(body.author.username).toBe("CI");
    expect(body.embeds[0]).toMatchObject({
      title: "Build 842",
      description: "passed",
      color: 0x57f287,
      fields: [{ name: "branch", value: "main", inline: true }],
    });
  });

  it("honours an explicit wait=false", async () => {
    const response = await executeSlackWebhook(
      request(
        { text: `${PREFIX}-slack-nowait-${randomUUID()}` },
        { query: "?wait=false" },
      ),
      webhookId,
      secret,
    );
    expect(response.status).toBe(204);
  });
});
