import crypto, { randomUUID } from "node:crypto";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type { OutgoingWebhookFormat } from "@/generated/prisma/client";
import { env } from "@/lib/config/env";
import { db } from "@/lib/db";
import * as service from "@/lib/services/outgoingWebhooks";

// Discord-format egress: DISCORD_EXECUTE bodies, DISCORD_EVENTS envelopes with
// Ed25519 signatures, 429 retry_after and auto-disable
// (specs/discord-webhook-compatibility.md §6-§7).

const TEST_KEY =
  "1c0c78e9d208fb20edac6012a8b1d6e02a4bdc17f2b28593fdffafcafec6c9e5";

let workspaceId: string;

function verifyEd25519(
  publicKeyHex: string,
  timestamp: string,
  body: string,
  signatureHex: string,
): boolean {
  const key = crypto.createPublicKey({
    key: Buffer.concat([
      Buffer.from("302a300506032b6570032100", "hex"), // Ed25519 SPKI prefix
      Buffer.from(publicKeyHex, "hex"),
    ]),
    format: "der",
    type: "spki",
  });
  return crypto.verify(
    null,
    Buffer.from(timestamp + body, "utf-8"),
    key,
    Buffer.from(signatureHex, "hex"),
  );
}

async function makeClaimable(
  format: OutgoingWebhookFormat,
  data: Record<string, unknown> = {
    severity: "critical",
    message: "disk full",
  },
) {
  const created = await service.create(workspaceId, {
    name: `wh-${randomUUID()}`,
    url: "https://example.com/hook",
    events: ["ALERT_CREATED"],
    isActive: true,
    format,
  });
  // create() enqueues a PING for DISCORD_EVENTS; drain it first so the test
  // works with the event delivery it actually cares about.
  const ping = (
    await service.claimDueDeliveries(new Date(), 50, 30_000)
  ).filter((candidate) => candidate.webhook.id === created.id);
  await db.webhookDelivery.deleteMany({
    where: { id: { in: ping.map((candidate) => candidate.delivery.id) } },
  });

  await service.enqueue(workspaceId, "ALERT_CREATED", data);
  const claimed = (
    await service.claimDueDeliveries(new Date(), 50, 30_000)
  ).filter((candidate) => candidate.webhook.id === created.id);
  return { created, claimed };
}

beforeAll(async () => {
  const workspace = await db.workspace.create({
    data: {
      name: "OWH Discord Workspace",
      slug: `owh-discord-${randomUUID()}`,
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

beforeEach(() => {
  vi.stubEnv("CREDENTIAL_ENCRYPTION_KEY", TEST_KEY);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("format selection", () => {
  it("defaults to INSPOT and mints no key pair", async () => {
    const created = await service.create(workspaceId, {
      name: `wh-${randomUUID()}`,
      url: "https://example.com/hook",
      events: ["ALERT_CREATED"],
      isActive: true,
    });
    const stored = await db.outgoingWebhook.findUniqueOrThrow({
      where: { id: created.id },
    });
    expect(stored.format).toBe("INSPOT");
    expect(stored.publicKey).toBeNull();
    expect(created.publicKey).toBeNull();
  });

  it("mints an Ed25519 key pair for DISCORD_EVENTS and keeps the private half encrypted", async () => {
    const created = await service.create(workspaceId, {
      name: `wh-${randomUUID()}`,
      url: "https://example.com/hook",
      events: ["ALERT_CREATED"],
      isActive: true,
      format: "DISCORD_EVENTS",
    });
    expect(created.publicKey).toMatch(/^[0-9a-f]{64}$/);

    const stored = await db.outgoingWebhook.findUniqueOrThrow({
      where: { id: created.id },
    });
    expect(stored.publicKey).toBe(created.publicKey);
    expect(stored.encryptedData).not.toContain(created.publicKey);
  });

  it("enqueues a PING when a DISCORD_EVENTS webhook is created", async () => {
    const created = await service.create(workspaceId, {
      name: `wh-${randomUUID()}`,
      url: "https://example.com/hook",
      events: ["ALERT_CREATED"],
      isActive: true,
      format: "DISCORD_EVENTS",
    });
    const delivery = await db.webhookDelivery.findFirstOrThrow({
      where: { webhookId: created.id },
    });
    expect(delivery.payload).toEqual({ ping: true });
  });

  it("mints the key pair when an existing webhook switches to DISCORD_EVENTS", async () => {
    const created = await service.create(workspaceId, {
      name: `wh-${randomUUID()}`,
      url: "https://example.com/hook",
      events: ["ALERT_CREATED"],
      isActive: true,
    });
    const updated = await service.update(created.id, workspaceId, {
      format: "DISCORD_EVENTS",
    });
    expect(updated.format).toBe("DISCORD_EVENTS");
    expect(updated.publicKey).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("DISCORD_EXECUTE delivery", () => {
  it("posts an Execute Webhook body with one embed and no signature", async () => {
    const { created, claimed } = await makeClaimable("DISCORD_EXECUTE", {
      category: "Disk",
      severity: "critical",
      source: "node-1",
      message: "disk full",
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    await service.deliverClaimed(claimed[0]);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://example.com/hook");
    expect(init.headers["X-Inspot-Signature"]).toBeUndefined();
    expect(init.headers["X-Signature-Ed25519"]).toBeUndefined();

    const body = JSON.parse(init.body);
    expect(body.embeds).toHaveLength(1);
    expect(body.embeds[0]).toMatchObject({
      title: "Disk",
      description: "disk full",
      color: 0xed4245,
    });

    const row = await db.webhookDelivery.findUniqueOrThrow({
      where: { id: claimed[0].delivery.id },
    });
    expect(row.status).toBe("DELIVERED");
    const webhook = await db.outgoingWebhook.findUniqueOrThrow({
      where: { id: created.id },
    });
    expect(webhook.consecutiveFailures).toBe(0);
  });

  it("waits exactly as long as a 429 retry_after says", async () => {
    const { claimed } = await makeClaimable("DISCORD_EXECUTE");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ retry_after: 42, global: false }), {
          status: 429,
        }),
      ),
    );

    const before = Date.now();
    await service.deliverClaimed(claimed[0]);

    const row = await db.webhookDelivery.findUniqueOrThrow({
      where: { id: claimed[0].delivery.id },
    });
    expect(row.status).toBe("PENDING");
    // 42s from the body, far short of the generic ladder's first 30s..6h steps
    // being wrong in either direction.
    const waited = row.nextAttemptAt.getTime() - before;
    expect(waited).toBeGreaterThan(41_000);
    expect(waited).toBeLessThan(50_000);
  });
});

describe("DISCORD_EVENTS delivery", () => {
  it("posts a signed type-1 envelope a Discord receiver can verify", async () => {
    const { created, claimed } = await makeClaimable("DISCORD_EVENTS", {
      severity: "critical",
      message: "disk full",
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    await service.deliverClaimed(claimed[0]);

    const [, init] = fetchMock.mock.calls[0];
    const envelope = JSON.parse(init.body);
    expect(envelope).toMatchObject({
      version: 1,
      type: 1,
      event: {
        type: "ALERT_CREATED",
        data: { severity: "critical", message: "disk full" },
      },
    });
    expect(envelope.application_id).toMatch(/^\d+$/);

    expect(
      verifyEd25519(
        created.publicKey!,
        init.headers["X-Signature-Timestamp"],
        init.body,
        init.headers["X-Signature-Ed25519"],
      ),
    ).toBe(true);
    // Discord's own receivers must answer within 3 seconds.
    expect(init.signal).toBeDefined();
  });

  it("sends a PING as type 0 with no event body", async () => {
    const created = await service.create(workspaceId, {
      name: `wh-${randomUUID()}`,
      url: "https://example.com/hook",
      events: ["ALERT_CREATED"],
      isActive: true,
      format: "DISCORD_EVENTS",
    });
    const claimed = (
      await service.claimDueDeliveries(new Date(), 50, 30_000)
    ).filter((candidate) => candidate.webhook.id === created.id);

    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    await service.deliverClaimed(claimed[0]);

    const envelope = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(envelope.type).toBe(0);
    expect(envelope.event).toBeUndefined();
  });

  it("retries on the tighter Discord ladder", async () => {
    const { claimed } = await makeClaimable("DISCORD_EVENTS");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 500 })),
    );

    const before = Date.now();
    await service.deliverClaimed(claimed[0]);

    const row = await db.webhookDelivery.findUniqueOrThrow({
      where: { id: claimed[0].delivery.id },
    });
    // First step is 1s, not the generic 30s.
    expect(row.nextAttemptAt.getTime() - before).toBeLessThan(5_000);
  });
});

describe("auto-disable", () => {
  it("counts consecutive terminal failures and disables at the threshold", async () => {
    const { created, claimed } = await makeClaimable("DISCORD_EXECUTE");
    await db.outgoingWebhook.update({
      where: { id: created.id },
      data: { consecutiveFailures: env.WEBHOOK_AUTO_DISABLE_AFTER - 1 },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 400 })),
    );

    await service.deliverClaimed(claimed[0]);

    const webhook = await db.outgoingWebhook.findUniqueOrThrow({
      where: { id: created.id },
    });
    expect(webhook.consecutiveFailures).toBe(env.WEBHOOK_AUTO_DISABLE_AFTER);
    expect(webhook.isActive).toBe(false);
  });

  it("re-enabling by hand clears the failure counter", async () => {
    const created = await service.create(workspaceId, {
      name: `wh-${randomUUID()}`,
      url: "https://example.com/hook",
      events: ["ALERT_CREATED"],
      isActive: true,
    });
    await db.outgoingWebhook.update({
      where: { id: created.id },
      data: { consecutiveFailures: 7, isActive: false },
    });

    const updated = await service.update(created.id, workspaceId, {
      isActive: true,
    });
    expect(updated.isActive).toBe(true);
    expect(updated.consecutiveFailures).toBe(0);
  });

  it("leaves the counter alone while a delivery is only retrying", async () => {
    const { created, claimed } = await makeClaimable("DISCORD_EXECUTE");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 500 })),
    );

    await service.deliverClaimed(claimed[0]);

    const webhook = await db.outgoingWebhook.findUniqueOrThrow({
      where: { id: created.id },
    });
    expect(webhook.consecutiveFailures).toBe(0);
    expect(webhook.isActive).toBe(true);
  });
});

describe("INSPOT format is untouched", () => {
  it("still sends the original envelope and HMAC signature", async () => {
    const { claimed } = await makeClaimable("INSPOT");
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await service.deliverClaimed(claimed[0]);

    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers["X-Inspot-Signature"]).toMatch(/^sha256=[0-9a-f]{64}$/);
    expect(init.headers["X-Inspot-Event"]).toBe("ALERT_CREATED");
    expect(JSON.parse(init.body).id).toBe(claimed[0].delivery.id);
  });
});
