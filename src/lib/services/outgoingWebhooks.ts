import crypto from "node:crypto";
import { db } from "@/lib/db";
import { env } from "@/lib/config/env";
import {
  Prisma,
  type OutgoingWebhook,
  type WebhookDelivery,
  type OutgoingWebhookEvent,
  type OutgoingWebhookFormat,
} from "@/generated/prisma/client";
import {
  encrypt,
  decrypt,
  isEncryptionConfigured,
} from "@/lib/crypto/credentials";
import {
  buildEventsRequest,
  buildExecuteRequest,
  generateEd25519KeyPair,
  parseRetryAfterMs,
  DISCORD_EVENTS_BACKOFF_MS,
} from "@/lib/discord/delivery";
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
  format: OutgoingWebhookFormat;
  publicKey: string | null;
  consecutiveFailures: number;
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
    format: webhook.format,
    publicKey: webhook.publicKey,
    consecutiveFailures: webhook.consecutiveFailures,
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

interface KeyMaterial {
  secret: string;
  privateKey: string | null;
}

// A webhook stores either a plain HMAC secret (INSPOT/DISCORD_EXECUTE) or that
// secret plus an Ed25519 private key (DISCORD_EVENTS). Both shapes decrypt here
// so switching formats never orphans the other one's credential.
function decryptKeyMaterial(webhook: {
  encryptedData: string;
  iv: string;
  authTag: string;
}): KeyMaterial {
  const data = decrypt({
    encryptedData: webhook.encryptedData,
    iv: webhook.iv,
    authTag: webhook.authTag,
  });
  if (data.type === "WEBHOOK_SECRET") {
    return { secret: data.secret, privateKey: null };
  }
  if (data.type === "WEBHOOK_ED25519_KEY") {
    return { secret: data.secret, privateKey: data.privateKey };
  }
  throw new Error("Decrypted payload is not a webhook secret");
}

// --- CRUD ---

// DISCORD_EVENTS signs with Ed25519, every other format with the HMAC secret.
// The key pair is minted alongside the secret so a later format switch never
// has to re-key a live subscription.
function buildCredential(format: OutgoingWebhookFormat, secret: string) {
  if (format !== "DISCORD_EVENTS") {
    return {
      payload: encrypt({ type: "WEBHOOK_SECRET", secret }),
      publicKey: null,
    };
  }
  const { privateKey, publicKey } = generateEd25519KeyPair();
  return {
    payload: encrypt({ type: "WEBHOOK_ED25519_KEY", privateKey, secret }),
    publicKey,
  };
}

export async function create(
  workspaceId: string,
  input: CreateOutgoingWebhookInput,
): Promise<{
  id: string;
  secret: string;
  secretPrefix: string;
  publicKey: string | null;
}> {
  if (!isEncryptionConfigured()) throw new EncryptionNotConfiguredError();

  const { secret, secretPrefix } = generateSecret();
  const format = input.format ?? "INSPOT";
  const { payload, publicKey } = buildCredential(format, secret);

  const created = await db.outgoingWebhook.create({
    data: {
      workspaceId,
      name: input.name,
      url: input.url,
      events: input.events,
      isActive: input.isActive ?? true,
      encryptedData: payload.encryptedData,
      iv: payload.iv,
      authTag: payload.authTag,
      secretPrefix,
      format,
      publicKey,
    },
  });

  // Discord's own receivers are verified with a PING before any real event; do
  // the same so a misconfigured endpoint surfaces immediately in the history.
  if (format === "DISCORD_EVENTS") {
    await db.webhookDelivery.create({
      data: {
        workspaceId,
        webhookId: created.id,
        webhookWorkspaceId: workspaceId,
        event: "ALERT_CREATED",
        payload: { ping: true } as Prisma.InputJsonValue,
        nextAttemptAt: new Date(),
      },
    });
  }

  return { id: created.id, secret, secretPrefix, publicKey };
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
  });
  if (!existing) throw new OutgoingWebhookNotFoundError();

  // Switching to DISCORD_EVENTS on a webhook created in another format mints
  // the missing key pair; the HMAC secret is carried over untouched, so the
  // operator never has to re-issue it.
  let credential: ReturnType<typeof buildCredential> | null = null;
  if (
    input.format === "DISCORD_EVENTS" &&
    (existing.format !== "DISCORD_EVENTS" || !existing.publicKey)
  ) {
    if (!isEncryptionConfigured()) throw new EncryptionNotConfiguredError();
    credential = buildCredential(
      "DISCORD_EVENTS",
      decryptKeyMaterial(existing).secret,
    );
  }

  const updated = await db.outgoingWebhook.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.url !== undefined ? { url: input.url } : {}),
      ...(input.events !== undefined ? { events: input.events } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      ...(input.format !== undefined ? { format: input.format } : {}),
      // Re-enabling by hand clears the auto-disable counter, otherwise the
      // very next failure would trip the threshold again.
      ...(input.isActive === true ? { consecutiveFailures: 0 } : {}),
      ...(credential
        ? {
            encryptedData: credential.payload.encryptedData,
            iv: credential.payload.iv,
            authTag: credential.payload.authTag,
            publicKey: credential.publicKey,
          }
        : {}),
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
    select: { id: true, format: true },
  });
  if (!webhook) throw new OutgoingWebhookNotFoundError();

  // A DISCORD_EVENTS receiver is verified with a PING (type 0), exactly as
  // Discord does — sending it a fake ALERT_CREATED would test the wrong thing.
  const payload =
    webhook.format === "DISCORD_EVENTS"
      ? { ping: true }
      : { test: true, message: "Inspot outgoing webhook test delivery" };

  const created = await db.webhookDelivery.create({
    data: {
      workspaceId,
      webhookId,
      webhookWorkspaceId: workspaceId,
      event: "ALERT_CREATED",
      payload: payload as Prisma.InputJsonValue,
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

// Builds the exact bytes and headers this webhook's format puts on the wire
// (specs/discord-webhook-compatibility.md §6-§7). Exported for tests.
export function buildDeliveryRequest(claimed: ClaimedDelivery): {
  body: string;
  headers: Record<string, string>;
  timeoutMs: number;
} {
  const { delivery, webhook } = claimed;
  const data = (delivery.payload ?? {}) as Record<string, unknown>;

  if (webhook.format === "DISCORD_EXECUTE") {
    const request = buildExecuteRequest({
      webhookName: webhook.name,
      event: delivery.event,
      data,
      timestamp: delivery.createdAt,
    });
    return { ...request, timeoutMs: env.WEBHOOK_DELIVERY_TIMEOUT_MS };
  }

  if (webhook.format === "DISCORD_EVENTS") {
    const { privateKey } = decryptKeyMaterial(webhook);
    if (!privateKey) {
      throw new Error("DISCORD_EVENTS webhook has no Ed25519 private key");
    }
    const request = buildEventsRequest({
      webhookId: webhook.id,
      webhookCreatedAt: webhook.createdAt,
      privateKey,
      // A PING carries no event body; it is enqueued as a synthetic row.
      event: data.ping === true ? null : delivery.event,
      data,
      timestamp: delivery.createdAt,
    });
    return {
      ...request,
      timeoutMs: request.timeoutMs ?? env.WEBHOOK_DELIVERY_TIMEOUT_MS,
    };
  }

  const envelope: WebhookEnvelope = {
    id: delivery.id,
    event: delivery.event,
    workspaceId: delivery.workspaceId,
    timestamp: delivery.createdAt.toISOString(),
    data,
  };
  const body = JSON.stringify(envelope);
  return {
    body,
    headers: {
      "Content-Type": "application/json",
      "X-Inspot-Signature": signPayload(
        decryptKeyMaterial(webhook).secret,
        body,
      ),
      "X-Inspot-Event": delivery.event,
      "X-Inspot-Delivery": delivery.id,
      "User-Agent": "Inspot-Webhooks/1",
    },
    timeoutMs: env.WEBHOOK_DELIVERY_TIMEOUT_MS,
  };
}

function backoffMs(format: OutgoingWebhookFormat, attempt: number): number {
  // Discord gives an events receiver ~10 minutes of retries, far tighter than
  // the generic 30s→6h ladder.
  const ladder =
    format === "DISCORD_EVENTS" ? DISCORD_EVENTS_BACKOFF_MS : BACKOFF_MS;
  return ladder[Math.min(attempt - 1, ladder.length - 1)];
}

// Send one claimed delivery, then record the outcome. Never throws — a single
// bad endpoint must not stall the queue.
export async function deliverClaimed(claimed: ClaimedDelivery): Promise<void> {
  const { delivery, webhook } = claimed;
  const attempt = delivery.attempts + 1;
  const now = new Date();

  let statusCode: number | null = null;
  let errorMessage: string | null = null;
  let permanent = false;
  let retryAfterMs: number | null = null;

  try {
    const request = buildDeliveryRequest(claimed);
    const response = await fetch(webhook.url, {
      method: "POST",
      headers: request.headers,
      body: request.body,
      signal: AbortSignal.timeout(request.timeoutMs),
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
      await db.outgoingWebhook
        .update({ where: { id: webhook.id }, data: { consecutiveFailures: 0 } })
        .catch(() => {});
      return;
    }
    errorMessage = `HTTP ${statusCode}`;
    if (statusCode === 429) {
      // Discord answers 429 with the exact wait; honour it over the ladder.
      retryAfterMs = parseRetryAfterMs(
        await response.text().catch(() => ""),
        response.headers.get("retry-after"),
      );
    }
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
    await registerFailure(webhook.id);
    return;
  }

  await db.webhookDelivery.update({
    where: { id: delivery.id },
    data: {
      status: "PENDING",
      attempts: attempt,
      lastAttemptAt: now,
      lastStatusCode: statusCode,
      lastError: errorMessage,
      leaseExpiresAt: null,
      nextAttemptAt: new Date(
        now.getTime() + (retryAfterMs ?? backoffMs(webhook.format, attempt)),
      ),
    },
  });
}

// Discord stops sending — and emails the owner — once a receiver fails too
// often. Inspoter flips isActive instead; the settings list shows the state and
// the operator re-enables by hand.
async function registerFailure(webhookId: string): Promise<void> {
  const updated = await db.outgoingWebhook
    .update({
      where: { id: webhookId },
      data: { consecutiveFailures: { increment: 1 } },
      select: { consecutiveFailures: true },
    })
    .catch(() => null);
  if (!updated) return;
  if (updated.consecutiveFailures >= env.WEBHOOK_AUTO_DISABLE_AFTER) {
    await db.outgoingWebhook
      .update({ where: { id: webhookId }, data: { isActive: false } })
      .catch(() => {});
  }
}

// --- Retention cleanup (called by webhook-retention-scheduler.ts) ---

// Delete up to `batchSize` terminal (DELIVERED/FAILED) deliveries created
// before `cutoff`. PENDING/DELIVERING rows are never eligible regardless of
// age — a stuck PENDING row past the window is a scheduler bug, not
// something retention should silently remove. Batched (not one unbounded
// deleteMany) so a large backlog drains over multiple ticks instead of
// holding a long-running delete.
export async function pruneOldDeliveries(
  cutoff: Date,
  batchSize: number,
): Promise<number> {
  const candidates = await db.webhookDelivery.findMany({
    where: {
      status: { in: ["DELIVERED", "FAILED"] },
      createdAt: { lt: cutoff },
    },
    orderBy: { createdAt: "asc" },
    select: { id: true },
    take: batchSize,
  });
  if (candidates.length === 0) return 0;

  // Re-check status in the delete itself (not just the id list): guards
  // against a concurrent manual retryDelivery() flipping a candidate row
  // back to PENDING between the select above and this delete, same
  // defensive re-check pattern claimDueDeliveries uses.
  const result = await db.webhookDelivery.deleteMany({
    where: {
      id: { in: candidates.map((c) => c.id) },
      status: { in: ["DELIVERED", "FAILED"] },
    },
  });
  return result.count;
}
