import { randomUUID } from "node:crypto";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { db } from "@/lib/db";
import * as service from "@/lib/services/outgoingWebhooks";

// The TELEGRAM_BOT format. What is worth proving here is where the two pieces
// of configuration live: the bot token inside the AES-256-GCM payload (because
// it is a path segment of the request), the chat id in a plain column (because
// a subscription whose target is invisible cannot be audited).

const TEST_KEY = "a".repeat(64);
const BOT_TOKEN = "123456789:AAFakeTokenForTestsOnly_1234567890";

let workspaceId: string;

beforeAll(async () => {
  const workspace = await db.workspace.create({
    data: {
      name: "Telegram webhook workspace",
      slug: `tg-${randomUUID()}`,
      updatedAt: new Date(),
    },
  });
  workspaceId = workspace.id;
});

afterAll(async () => {
  if (workspaceId) {
    await db.workspace.delete({ where: { id: workspaceId } }).catch(() => {});
  }
});

beforeEach(async () => {
  vi.stubEnv("CREDENTIAL_ENCRYPTION_KEY", TEST_KEY);
  await db.outgoingWebhook.deleteMany({ where: { workspaceId } });
});

function telegramInput(overrides: Record<string, unknown> = {}) {
  return {
    name: `tg-${randomUUID()}`,
    url: "",
    events: ["AGENT_RUN_COMPLETED" as const],
    isActive: true,
    format: "TELEGRAM_BOT" as const,
    botToken: BOT_TOKEN,
    targetChatId: "-1001234567890",
    ...overrides,
  };
}

describe("create() with TELEGRAM_BOT", () => {
  it("encrypts the bot token and stores the chat id in the clear", async () => {
    const created = await service.create(workspaceId, telegramInput());

    const stored = await db.outgoingWebhook.findUniqueOrThrow({
      where: { id: created.id },
    });
    expect(stored.encryptedData).not.toContain(BOT_TOKEN);
    expect(stored.targetChatId).toBe("-1001234567890");
    // No base given, so the public API host is the target.
    expect(stored.url).toBe("https://api.telegram.org");
  });

  it("never returns the bot token from the list", async () => {
    const created = await service.create(workspaceId, telegramInput());
    const found = (await service.list(workspaceId)).find(
      (webhook) => webhook.id === created.id,
    );
    expect(JSON.stringify(found)).not.toContain(BOT_TOKEN);
    expect(found?.targetChatId).toBe("-1001234567890");
  });
});

describe("buildDeliveryRequest for TELEGRAM_BOT", () => {
  it("builds a sendMessage call whose target overrides the stored url", async () => {
    const created = await service.create(workspaceId, telegramInput());
    const webhook = await db.outgoingWebhook.findUniqueOrThrow({
      where: { id: created.id },
    });
    const delivery = await db.webhookDelivery.create({
      data: {
        workspaceId,
        webhookId: webhook.id,
        webhookWorkspaceId: workspaceId,
        event: "AGENT_RUN_COMPLETED",
        payload: {
          agentName: "Night watch",
          status: "SUCCEEDED",
          summary: "All quiet.",
        },
        nextAttemptAt: new Date(),
      },
    });

    const request = service.buildDeliveryRequest({ delivery, webhook });

    expect(request.url).toBe(
      `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,
    );
    const body = JSON.parse(request.body) as Record<string, unknown>;
    expect(body.chat_id).toBe("-1001234567890");
    expect(String(body.text)).toContain("Night watch");
    expect(String(body.text)).toContain("All quiet.");
  });
});

describe("update() with TELEGRAM_BOT", () => {
  it("keeps the stored token when the field is left empty", async () => {
    const created = await service.create(workspaceId, telegramInput());
    const before = await db.outgoingWebhook.findUniqueOrThrow({
      where: { id: created.id },
    });

    await service.update(created.id, workspaceId, {
      targetChatId: "@another_channel",
    });

    const after = await db.outgoingWebhook.findUniqueOrThrow({
      where: { id: created.id },
    });
    expect(after.encryptedData).toBe(before.encryptedData);
    expect(after.targetChatId).toBe("@another_channel");
  });

  it("re-encrypts around the same HMAC secret when the token is rotated", async () => {
    const created = await service.create(workspaceId, telegramInput());
    const before = await db.outgoingWebhook.findUniqueOrThrow({
      where: { id: created.id },
    });

    await service.update(created.id, workspaceId, {
      format: "TELEGRAM_BOT",
      botToken: "987654321:BBAnotherFakeTokenForTests_0987654",
    });

    const after = await db.outgoingWebhook.findUniqueOrThrow({
      where: { id: created.id },
    });
    expect(after.encryptedData).not.toBe(before.encryptedData);
    // The subscription's own secret is unchanged, so nobody has to re-issue it.
    expect(after.secretPrefix).toBe(before.secretPrefix);
  });
});
