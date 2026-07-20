import crypto from "node:crypto";
import { db } from "@/lib/db";
import { env } from "@/lib/config/env";
import {
  Prisma,
  type OutgoingWebhook,
  type WebhookDelivery,
  type OutgoingWebhookEvent,
} from "@/generated/prisma/client";
import {
  encrypt,
  decrypt,
  isEncryptionConfigured,
} from "@/lib/crypto/credentials";
import type {
  CreateOutgoingWebhookInput,
  UpdateOutgoingWebhookInput,
} from "@/lib/validation/outgoingWebhooks";

// Sole Prisma caller for OutgoingWebhook/WebhookDelivery. Signing secret is
// generated once, stored AES-256-GCM encrypted (never returned again), and
// used to HMAC-sign every delivery body. Deliveries are a durable queue drained
// by src/lib/services/webhook-scheduler.ts.

// Exponential backoff between delivery attempts (ms). Coarser than the
// in-request retries of src/lib/providers/http.ts because this is a durable,
// out-of-band queue: 30s, 2m, 10m, 1h, 6h.
const BACKOFF_MS = [30_000, 120_000, 600_000, 3_600_000, 21_600_000] as const;

export class EncryptionNotConfiguredError extends Error {
  code = "ENCRYPTION_NOT_CONFIGURED" as const;
  constructor() {
    super("CREDENTIAL_ENCRYPTION_KEY is not configured");
  }
}

export class OutgoingWebhookNotFoundError extends Error {
  code = "OUTGOING_WEBHOOK_NOT_FOUND" as const;
  constructor() {
    super("Outgoing webhook not found");
  }
}

export class WebhookDeliveryNotFoundError extends Error {
  code = "WEBHOOK_DELIVERY_NOT_FOUND" as const;
  constructor() {
    super("Webhook delivery not found");
  }
}

export interface OutgoingWebhookSummary {
  id: string;
  name: string;
  url: string;
  events: OutgoingWebhookEvent[];
  isActive: boolean;
  secretPrefix: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface WebhookDeliverySummary {
  id: string;
  event: OutgoingWebhookEvent;
  status: WebhookDelivery["status"];
  attempts: number;
  maxAttempts: number;
  lastStatusCode: number | null;
  lastError: string | null;
  lastAttemptAt: Date | null;
  deliveredAt: Date | null;
  nextAttemptAt: Date;
  createdAt: Date;
}

export interface WebhookEnvelope {
  id: string;
  event: OutgoingWebhookEvent;
  workspaceId: string;
  timestamp: string;
  data: Record<string, unknown>;
}

function toSummary(webhook: OutgoingWebhook): OutgoingWebhookSummary {
  return {
    id: webhook.id,
    name: webhook.name,
    url: webhook.url,
    events: webhook.events,
    isActive: webhook.isActive,
    secretPrefix: webhook.secretPrefix,
    createdAt: webhook.createdAt,
    updatedAt: webhook.updatedAt,
  };
}

function toDeliverySummary(delivery: WebhookDelivery): WebhookDeliverySummary {
  return {
    id: delivery.id,
    event: delivery.event,
    status: delivery.status,
    attempts: delivery.attempts,
    maxAttempts: delivery.maxAttempts,
    lastStatusCode: delivery.lastStatusCode,
    lastError: delivery.lastError,
    lastAttemptAt: delivery.lastAttemptAt,
    deliveredAt: delivery.deliveredAt,
    nextAttemptAt: delivery.nextAttemptAt,
    createdAt: delivery.createdAt,
  };
}

function generateSecret(): { secret: string; secretPrefix: string } {
  const secret = `whsec_${crypto.randomBytes(24).toString("hex")}`;
  return { secret, secretPrefix: secret.slice(0, 14) };
}

// HMAC-SHA256 of the exact bytes that go on the wire. Exported for tests.
export function signPayload(secret: string, rawBody: string): string {
  return `sha256=${crypto.createHmac("sha256", secret).update(rawBody).digest("hex")}`;
}

function decryptSecret(webhook: {
  encryptedData: string;
  iv: string;
  authTag: string;
}): string {
  const data = decrypt({
    encryptedData: webhook.encryptedData,
    iv: webhook.iv,
    authTag: webhook.authTag,
  });
  if (data.type !== "WEBHOOK_SECRET") {
    throw new Error("Decrypted payload is not a webhook secret");
  }
  return data.secret;
}

// --- CRUD ---

export async function create(
  workspaceId: string,
  input: CreateOutgoingWebhookInput,
): Promise<{ id: string; secret: string; secretPrefix: string }> {
  if (!isEncryptionConfigured()) throw new EncryptionNotConfiguredError();

  const { secret, secretPrefix } = generateSecret();
  const { encryptedData, iv, authTag } = encrypt({
    type: "WEBHOOK_SECRET",
    secret,
  });

  const created = await db.outgoingWebhook.create({
    data: {
      workspaceId,
      name: input.name,
      url: input.url,
      events: input.events,
      isActive: input.isActive ?? true,
      encryptedData,
      iv,
      authTag,
      secretPrefix,
    },
  });

  return { id: created.id, secret, secretPrefix };
}

export async function list(
  workspaceId: string,
): Promise<OutgoingWebhookSummary[]> {
  const rows = await db.outgoingWebhook.findMany({
    where: { workspaceId },
    orderBy: { createdAt: "desc" },
  });
  return rows.map(toSummary);
}

export async function get(
  id: string,
  workspaceId: string,
): Promise<OutgoingWebhookSummary | null> {
  const row = await db.outgoingWebhook.findFirst({
    where: { id, workspaceId },
  });
  return row ? toSummary(row) : null;
}

export async function update(
  id: string,
  workspaceId: string,
  input: UpdateOutgoingWebhookInput,
): Promise<OutgoingWebhookSummary> {
  const existing = await db.outgoingWebhook.findFirst({
    where: { id, workspaceId },
    select: { id: true },
  });
  if (!existing) throw new OutgoingWebhookNotFoundError();

  const updated = await db.outgoingWebhook.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.url !== undefined ? { url: input.url } : {}),
      ...(input.events !== undefined ? { events: input.events } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    },
  });
  return toSummary(updated);
}

export async function remove(id: string, workspaceId: string): Promise<void> {
  const result = await db.outgoingWebhook.deleteMany({
    where: { id, workspaceId },
  });
  if (result.count === 0) throw new OutgoingWebhookNotFoundError();
}

// --- Fan-out (called by webhook-events.emitWebhookEvent) ---

export async function enqueue(
  workspaceId: string,
  event: OutgoingWebhookEvent,
  data: Record<string, unknown>,
): Promise<void> {
  const subscriptions = await db.outgoingWebhook.findMany({
    where: { workspaceId, isActive: true, events: { has: event } },
    select: { id: true },
  });
  if (subscriptions.length === 0) return;

  const now = new Date();
  await db.webhookDelivery.createMany({
    // `payload` stores only the event-specific `data` node; the full envelope
    // (with the delivery id) is assembled in deliverClaimed just before send.
    data: subscriptions.map((subscription) => ({
      workspaceId,
      webhookId: subscription.id,
      webhookWorkspaceId: workspaceId,
      event,
      payload: data as Prisma.InputJsonValue,
      nextAttemptAt: now,
    })),
  });
}

// --- History & manual retry ---

interface DeliveryCursor {
  w: string;
  t: string;
  id: string;
}

function encodeCursor(
  workspaceId: string,
  entry: Pick<WebhookDelivery, "createdAt" | "id">,
): string {
  return Buffer.from(
    JSON.stringify({
      w: workspaceId,
      t: entry.createdAt.toISOString(),
      id: entry.id,
    }),
  ).toString("base64url");
}

function decodeCursor(cursor: string): DeliveryCursor | null {
  try {
    const p = JSON.parse(
      Buffer.from(cursor, "base64url").toString("utf-8"),
    ) as Partial<DeliveryCursor>;
    return typeof p.w === "string" &&
      typeof p.t === "string" &&
      typeof p.id === "string"
      ? { w: p.w, t: p.t, id: p.id }
      : null;
  } catch {
    return null;
  }
}

export interface ListDeliveriesResult {
  items: WebhookDeliverySummary[];
  nextCursor: string | null;
}

export async function listDeliveries(
  webhookId: string,
  workspaceId: string,
  params: { cursor?: string; pageSize?: number } = {},
): Promise<ListDeliveriesResult> {
  const webhook = await db.outgoingWebhook.findFirst({
    where: { id: webhookId, workspaceId },
    select: { id: true },
  });
  if (!webhook) throw new OutgoingWebhookNotFoundError();

  const pageSize = params.pageSize ?? env.LIST_PAGE_SIZE;
  const where: Prisma.WebhookDeliveryWhereInput = { workspaceId, webhookId };

  const decoded = params.cursor ? decodeCursor(params.cursor) : null;
  const cursor = decoded && decoded.w === workspaceId ? decoded : null;
  if (cursor) {
    const cursorDate = new Date(cursor.t);
    where.OR = [
      { createdAt: { lt: cursorDate } },
      { createdAt: cursorDate, id: { lt: cursor.id } },
    ];
  }

  const rows = await db.webhookDelivery.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: pageSize + 1,
  });

  const hasMore = rows.length > pageSize;
  const items = hasMore ? rows.slice(0, pageSize) : rows;
  const nextCursor = hasMore
    ? encodeCursor(workspaceId, items[items.length - 1])
    : null;

  return { items: items.map(toDeliverySummary), nextCursor };
}

// Reset a delivery to PENDING for immediate re-send. Used by the retry route.
export async function retryDelivery(
  webhookId: string,
  deliveryId: string,
  workspaceId: string,
): Promise<void> {
  const result = await db.webhookDelivery.updateMany({
    where: { id: deliveryId, webhookId, workspaceId },
    data: {
      status: "PENDING",
      attempts: 0,
      nextAttemptAt: new Date(),
      leaseExpiresAt: null,
      lastError: null,
    },
  });
  if (result.count === 0) throw new WebhookDeliveryNotFoundError();
}

// Enqueue a synthetic test delivery so the operator can verify the endpoint.
export async function createTestDelivery(
  webhookId: string,
  workspaceId: string,
): Promise<{ deliveryId: string }> {
  const webhook = await db.outgoingWebhook.findFirst({
    where: { id: webhookId, workspaceId },
    select: { id: true },
  });
  if (!webhook) throw new OutgoingWebhookNotFoundError();

  const created = await db.webhookDelivery.create({
    data: {
      workspaceId,
      webhookId,
      webhookWorkspaceId: workspaceId,
      event: "ALERT_CREATED",
      payload: {
        test: true,
        message: "Inspot outgoing webhook test delivery",
      } as Prisma.InputJsonValue,
      nextAttemptAt: new Date(),
    },
  });
  return { deliveryId: created.id };
}

// --- Delivery drain (called by webhook-scheduler.ts) ---

// Return DELIVERING rows whose lease expired (crashed mid-send) to PENDING.
export async function reclaimStaleLeases(now: Date): Promise<void> {
  await db.webhookDelivery.updateMany({
    where: { status: "DELIVERING", leaseExpiresAt: { lt: now } },
    data: { status: "PENDING", leaseExpiresAt: null },
  });
}

export interface ClaimedDelivery {
  delivery: WebhookDelivery;
  webhook: OutgoingWebhook;
}

// Cross-tenant sweep (backed by the [status, nextAttemptAt] index). Each
// candidate is claimed via updateMany({ status: "PENDING" }); only the writer
// whose count === 1 owns it, so concurrent ticks/instances never double-send.
export async function claimDueDeliveries(
  now: Date,
  batch: number,
  leaseMs: number,
): Promise<ClaimedDelivery[]> {
  const due = await db.webhookDelivery.findMany({
    where: { status: "PENDING", nextAttemptAt: { lte: now } },
    orderBy: { nextAttemptAt: "asc" },
    take: batch,
    include: { webhook: true },
  });

  const claimed: ClaimedDelivery[] = [];
  const leaseExpiresAt = new Date(now.getTime() + leaseMs);
  for (const delivery of due) {
    const result = await db.webhookDelivery.updateMany({
      where: { id: delivery.id, status: "PENDING" },
      data: { status: "DELIVERING", leaseExpiresAt },
    });
    if (result.count === 1) {
      claimed.push({ delivery, webhook: delivery.webhook });
    }
  }
  return claimed;
}

// Send one claimed delivery, then record the outcome. Never throws — a single
// bad endpoint must not stall the queue.
export async function deliverClaimed(claimed: ClaimedDelivery): Promise<void> {
  const { delivery, webhook } = claimed;
  const attempt = delivery.attempts + 1;
  const now = new Date();

  const envelope: WebhookEnvelope = {
    id: delivery.id,
    event: delivery.event,
    workspaceId: delivery.workspaceId,
    timestamp: delivery.createdAt.toISOString(),
    data: (delivery.payload ?? {}) as Record<string, unknown>,
  };
  const rawBody = JSON.stringify(envelope);

  let statusCode: number | null = null;
  let errorMessage: string | null = null;
  let permanent = false;

  try {
    const secret = decryptSecret(webhook);
    const response = await fetch(webhook.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Inspot-Signature": signPayload(secret, rawBody),
        "X-Inspot-Event": delivery.event,
        "X-Inspot-Delivery": delivery.id,
        "User-Agent": "Inspot-Webhooks/1",
      },
      body: rawBody,
      signal: AbortSignal.timeout(env.WEBHOOK_DELIVERY_TIMEOUT_MS),
    });
    statusCode = response.status;
    if (response.ok) {
      await db.webhookDelivery.update({
        where: { id: delivery.id },
        data: {
          status: "DELIVERED",
          attempts: attempt,
          lastAttemptAt: now,
          lastStatusCode: statusCode,
          lastError: null,
          leaseExpiresAt: null,
          deliveredAt: now,
        },
      });
      return;
    }
    errorMessage = `HTTP ${statusCode}`;
    // 4xx (except 429) is the receiver rejecting us — retrying won't help.
    permanent = statusCode >= 400 && statusCode < 500 && statusCode !== 429;
  } catch (error) {
    errorMessage =
      error instanceof Error ? error.message : "Delivery request failed";
  }

  const exhausted = permanent || attempt >= delivery.maxAttempts;
  if (exhausted) {
    await db.webhookDelivery.update({
      where: { id: delivery.id },
      data: {
        status: "FAILED",
        attempts: attempt,
        lastAttemptAt: now,
        lastStatusCode: statusCode,
        lastError: errorMessage,
        leaseExpiresAt: null,
      },
    });
    return;
  }

  const backoff = BACKOFF_MS[Math.min(attempt - 1, BACKOFF_MS.length - 1)];
  await db.webhookDelivery.update({
    where: { id: delivery.id },
    data: {
      status: "PENDING",
      attempts: attempt,
      lastAttemptAt: now,
      lastStatusCode: statusCode,
      lastError: errorMessage,
      leaseExpiresAt: null,
      nextAttemptAt: new Date(now.getTime() + backoff),
    },
  });
}
