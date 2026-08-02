import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  buildEventsRequest,
  buildExecuteRequest,
  generateEd25519KeyPair,
  parseRetryAfterMs,
  signEd25519,
  DISCORD_EVENTS_TIMEOUT_MS,
} from "@/lib/discord/delivery";

// specs/discord-webhook-compatibility.md §6-§7.

const AT = new Date("2026-08-02T10:15:00.000Z");
const UNIX_SECONDS = String(Math.floor(AT.getTime() / 1000));

// Verifies exactly the way a receiver written against Discord's docs does:
// ed25519(publicKey, timestamp + rawBody).
function verify(
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

describe("DISCORD_EXECUTE request", () => {
  it("sends a username plus one embed and no signature header", () => {
    const request = buildExecuteRequest({
      webhookName: "Inspoter",
      event: "ALERT_CREATED",
      data: { category: "Disk", severity: "critical", message: "full" },
      timestamp: AT,
    });

    const body = JSON.parse(request.body);
    expect(body.username).toBe("Inspoter");
    expect(body.embeds).toHaveLength(1);
    expect(body.embeds[0].title).toBe("Disk");
    expect(request.headers["Content-Type"]).toBe("application/json");
    expect(request.headers["X-Signature-Ed25519"]).toBeUndefined();
    expect(request.headers["X-Inspot-Signature"]).toBeUndefined();
  });
});

describe("DISCORD_EVENTS request", () => {
  const { privateKey, publicKey } = generateEd25519KeyPair();

  it("exports a 32-byte public key as hex", () => {
    expect(publicKey).toMatch(/^[0-9a-f]{64}$/);
  });

  it("wraps the event in Discord's envelope", () => {
    const request = buildEventsRequest({
      webhookId: "abc",
      webhookCreatedAt: AT,
      privateKey,
      event: "ALERT_CREATED",
      data: { severity: "critical" },
      timestamp: AT,
    });

    expect(JSON.parse(request.body)).toEqual({
      version: 1,
      application_id: expect.stringMatching(/^\d+$/),
      type: 1,
      event: {
        type: "ALERT_CREATED",
        timestamp: AT.toISOString(),
        data: { severity: "critical" },
      },
    });
    expect(request.timeoutMs).toBe(DISCORD_EVENTS_TIMEOUT_MS);
  });

  it("sends a PING with type 0 and no event body", () => {
    const request = buildEventsRequest({
      webhookId: "abc",
      webhookCreatedAt: AT,
      privateKey,
      event: null,
      data: {},
      timestamp: AT,
    });
    const body = JSON.parse(request.body);
    expect(body.type).toBe(0);
    expect(body.event).toBeUndefined();
  });

  it("signs timestamp + body so a Discord-style receiver verifies it", () => {
    const request = buildEventsRequest({
      webhookId: "abc",
      webhookCreatedAt: AT,
      privateKey,
      event: "LOG_CREATED",
      data: {},
      timestamp: AT,
    });

    expect(request.headers["X-Signature-Timestamp"]).toBe(UNIX_SECONDS);
    expect(
      verify(
        publicKey,
        request.headers["X-Signature-Timestamp"],
        request.body,
        request.headers["X-Signature-Ed25519"],
      ),
    ).toBe(true);
  });

  it("fails verification when the body or timestamp is tampered with", () => {
    const signature = signEd25519(privateKey, UNIX_SECONDS, '{"a":1}');
    expect(verify(publicKey, UNIX_SECONDS, '{"a":1}', signature)).toBe(true);
    expect(verify(publicKey, UNIX_SECONDS, '{"a":2}', signature)).toBe(false);
    expect(verify(publicKey, "0", '{"a":1}', signature)).toBe(false);
  });
});

describe("429 retry_after", () => {
  it("prefers the body value over the header", () => {
    expect(parseRetryAfterMs('{"retry_after":1.5}', "60")).toBe(1500);
  });

  it("falls back to the Retry-After header when the body has none", () => {
    expect(parseRetryAfterMs("{}", "3")).toBe(3000);
    expect(parseRetryAfterMs("not json", "3")).toBe(3000);
  });

  it("returns null when neither source is usable", () => {
    expect(parseRetryAfterMs("", null)).toBeNull();
    expect(parseRetryAfterMs('{"retry_after":"soon"}', "later")).toBeNull();
    expect(parseRetryAfterMs('{"retry_after":-1}', null)).toBeNull();
  });
});
