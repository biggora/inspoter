import crypto from "node:crypto";
import type { OutgoingWebhookEvent } from "@/generated/prisma/client";
import { eventToEmbed } from "@/lib/discord/embeds";
import { toSnowflake } from "@/lib/discord/snowflake";

// Wire formats of an outgoing delivery (specs/discord-webhook-compatibility.md
// §6-§7). Pure request-shaping: the caller owns the fetch, the outcome
// bookkeeping and the retry schedule.

// DISCORD_EVENTS must be acknowledged in 3 seconds and give up after ~10
// minutes, both taken straight from Discord's contract — hence a dedicated
// timeout and backoff ladder instead of the generic WEBHOOK_DELIVERY_* knobs.
export const DISCORD_EVENTS_TIMEOUT_MS = 3_000;
export const DISCORD_EVENTS_BACKOFF_MS = [
  1_000, 5_000, 30_000, 120_000, 300_000,
] as const;

export interface DiscordKeyPair {
  privateKey: string; // PKCS#8, base64
  publicKey: string; // raw 32 bytes, hex — the form a receiver configures
}

export function generateEd25519KeyPair(): DiscordKeyPair {
  const { privateKey, publicKey } = crypto.generateKeyPairSync("ed25519");
  const spki = publicKey.export({ type: "spki", format: "der" });
  return {
    privateKey: privateKey
      .export({ type: "pkcs8", format: "der" })
      .toString("base64"),
    // The last 32 bytes of an Ed25519 SPKI DER blob are the raw key.
    publicKey: spki.subarray(spki.length - 32).toString("hex"),
  };
}

// Discord signs `timestamp + rawBody`; a receiver written against Discord's
// docs verifies exactly that concatenation.
export function signEd25519(
  privateKeyBase64: string,
  timestamp: string,
  rawBody: string,
): string {
  const key = crypto.createPrivateKey({
    key: Buffer.from(privateKeyBase64, "base64"),
    format: "der",
    type: "pkcs8",
  });
  return crypto
    .sign(null, Buffer.from(timestamp + rawBody, "utf-8"), key)
    .toString("hex");
}

export interface DiscordRequest {
  body: string;
  headers: Record<string, string>;
  timeoutMs?: number;
}

export function buildExecuteRequest(input: {
  webhookName: string;
  event: OutgoingWebhookEvent;
  data: Record<string, unknown>;
  timestamp: Date;
}): DiscordRequest {
  const body = JSON.stringify({
    username: input.webhookName,
    embeds: [eventToEmbed(input.event, input.data, input.timestamp)],
  });
  return {
    body,
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "Inspot-Webhooks/1",
    },
  };
}

export function buildEventsRequest(input: {
  webhookId: string;
  webhookCreatedAt: Date;
  privateKey: string;
  event: OutgoingWebhookEvent | null; // null => PING (type 0)
  data: Record<string, unknown>;
  timestamp: Date;
}): DiscordRequest {
  const applicationId = toSnowflake(input.webhookId, input.webhookCreatedAt);
  const body = JSON.stringify(
    input.event === null
      ? { version: 1, application_id: applicationId, type: 0 }
      : {
          version: 1,
          application_id: applicationId,
          type: 1,
          event: {
            type: input.event,
            timestamp: input.timestamp.toISOString(),
            data: input.data,
          },
        },
  );
  const signatureTimestamp = Math.floor(
    input.timestamp.getTime() / 1000,
  ).toString();

  return {
    body,
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "Inspot-Webhooks/1",
      "X-Signature-Ed25519": signEd25519(
        input.privateKey,
        signatureTimestamp,
        body,
      ),
      "X-Signature-Timestamp": signatureTimestamp,
    },
    timeoutMs: DISCORD_EVENTS_TIMEOUT_MS,
  };
}

// Discord answers a 429 with the wait in seconds; honouring it beats the
// generic ladder, which would either hammer or over-wait.
export function parseRetryAfterMs(
  rawBody: string,
  header: string | null,
): number | null {
  try {
    const parsed = JSON.parse(rawBody) as { retry_after?: unknown };
    if (typeof parsed.retry_after === "number" && parsed.retry_after >= 0) {
      return Math.ceil(parsed.retry_after * 1000);
    }
  } catch {
    // Fall through to the header.
  }
  // Number(null) and Number("") are both 0, which would read as "retry now".
  if (header === null || header.trim() === "") return null;
  const seconds = Number(header);
  return Number.isFinite(seconds) && seconds >= 0
    ? Math.ceil(seconds * 1000)
    : null;
}
