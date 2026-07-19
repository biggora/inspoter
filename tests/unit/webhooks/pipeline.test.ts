import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { env } from "@/lib/config/env";
import * as webhookTokensService from "@/lib/services/webhookTokens";
import { checkRateLimit } from "@/lib/webhooks/ratelimit";
import { processWebhook } from "@/lib/webhooks/pipeline";

// Webhook ingest pipeline (architecture.md §3.2, AC-WH-001..011). Ordered:
// size -> parse -> auth -> ratelimit -> type -> zod -> idempotency -> dispatch.

const WEBHOOK_URL = "http://localhost/api/webhooks";

function buildRequest(
  type: string,
  {
    body,
    rawBody,
    token,
    idempotencyKey,
    headers = {},
  }: {
    body?: unknown;
    rawBody?: string;
    token?: string | null;
    idempotencyKey?: string;
    headers?: Record<string, string>;
  } = {},
): NextRequest {
  const finalHeaders = new Headers(headers);
  if (token !== null) {
    finalHeaders.set("authorization", `Bearer ${token ?? "invalid-token"}`);
  }
  if (idempotencyKey) {
    finalHeaders.set("idempotency-key", idempotencyKey);
  }

  const payload = rawBody ?? JSON.stringify(body ?? {});
  return new NextRequest(`${WEBHOOK_URL}/${type}`, {
    method: "POST",
    headers: finalHeaders,
    body: payload,
  });
}

let workspaceId: string;
let rawToken: string;

beforeAll(async () => {
  const workspace = await db.workspace.create({
    data: {
      name: "Test Workspace",
      slug: `test-${randomUUID()}`,
      updatedAt: new Date(),
    },
  });
  workspaceId = workspace.id;

  const created = await webhookTokensService.create(
    workspaceId,
    `pipeline-${randomUUID()}`,
  );
  rawToken = created.token;
});

afterAll(async () => {
  if (workspaceId) {
    await db.workspace.delete({ where: { id: workspaceId } }).catch(() => {});
  }
});

describe("AC-WH-001: authentication", () => {
  it("rejects a request with no Authorization header (401), no entry created", async () => {
    const before = await db.logEntry.count({ where: { workspaceId } });
    const request = buildRequest("log", {
      token: null,
      body: { level: "info", source: "test", message: "hi" },
    });

    const response = await processWebhook(request, "log");

    expect(response.status).toBe(401);
    expect(await db.logEntry.count({ where: { workspaceId } })).toBe(before);
  });

  it("rejects a request with an invalid token (401), no entry created", async () => {
    const before = await db.logEntry.count({ where: { workspaceId } });
    const request = buildRequest("log", {
      token: "not-a-real-token",
      body: { level: "info", source: "test", message: "hi" },
    });

    const response = await processWebhook(request, "log");

    expect(response.status).toBe(401);
    expect(await db.logEntry.count({ where: { workspaceId } })).toBe(before);
  });

  it("AC-WH-009: rejects a request with a revoked token (401)", async () => {
    const revoked = await webhookTokensService.create(
      workspaceId,
      `revoked-${randomUUID()}`,
    );
    await webhookTokensService.revoke(revoked.id, workspaceId);

    const request = buildRequest("log", {
      token: revoked.token,
      body: { level: "info", source: "test", message: "hi" },
    });

    const response = await processWebhook(request, "log");

    expect(response.status).toBe(401);
  });

  it("rejects a channel-scoped token on the legacy typed endpoint", async () => {
    const category = await db.messageCategory.create({
      data: { workspaceId, name: `legacy-isolation-${randomUUID()}` },
    });
    const channel = await db.channel.create({
      data: {
        workspaceId,
        messageCategoryId: category.id,
        messageCategoryWorkspaceId: workspaceId,
        name: `legacy-isolation-${randomUUID()}`,
      },
    });
    const scoped = await webhookTokensService.createForChannel(
      channel.id,
      workspaceId,
      `legacy-isolation-${randomUUID()}`,
    );
    const response = await processWebhook(
      buildRequest("log", {
        token: scoped.url.split("/").at(-1)!,
        body: { level: "info", source: "test", message: "blocked" },
      }),
      "log",
    );
    expect(response.status).toBe(401);
  });
});

describe("AC-WH-011: body limits", () => {
  it("rejects an oversized body with 413, no entry created", async () => {
    const before = await db.logEntry.count({ where: { workspaceId } });
    const oversized = "a".repeat(env.WEBHOOK_MAX_BODY_BYTES + 1000);
    const request = buildRequest("log", {
      token: rawToken,
      rawBody: oversized,
    });

    const response = await processWebhook(request, "log");

    expect(response.status).toBe(413);
    expect(await db.logEntry.count({ where: { workspaceId } })).toBe(before);
  });

  it("rejects an unparseable body with 400, no entry created", async () => {
    const before = await db.logEntry.count({ where: { workspaceId } });
    const request = buildRequest("log", {
      token: rawToken,
      rawBody: "{not-valid-json",
    });

    const response = await processWebhook(request, "log");

    expect(response.status).toBe(400);
    expect(await db.logEntry.count({ where: { workspaceId } })).toBe(before);
  });
});

describe("AC-WH-006: unsupported type", () => {
  it("rejects an unsupported webhook type with 400, no entry created", async () => {
    const request = buildRequest("carrier-pigeon", {
      token: rawToken,
      body: { anything: "goes" },
    });

    const response = await processWebhook(request, "carrier-pigeon");

    expect(response.status).toBe(400);
  });
});

describe("AC-WH-002: schema validation", () => {
  it("rejects a payload that fails schema validation with 400 and machine-readable details", async () => {
    const before = await db.logEntry.count({ where: { workspaceId } });
    const request = buildRequest("log", {
      token: rawToken,
      body: { level: "info" }, // missing source/message
    });

    const response = await processWebhook(request, "log");
    const responseBody = await response.json();

    expect(response.status).toBe(400);
    expect(responseBody.error.code).toBe("VALIDATION_FAILED");
    expect(Array.isArray(responseBody.error.details)).toBe(true);
    expect(responseBody.error.details.length).toBeGreaterThan(0);
    expect(await db.logEntry.count({ where: { workspaceId } })).toBe(before);
  });
});

describe("AC-WH-003: valid ingest", () => {
  it("creates a log entry synchronously and returns 201 with its id", async () => {
    const request = buildRequest("log", {
      token: rawToken,
      body: { level: "info", source: "pipeline-test", message: "it works" },
    });

    const response = await processWebhook(request, "log");
    const responseBody = await response.json();

    expect(response.status).toBe(201);
    expect(responseBody.id).toBeTruthy();

    const stored = await db.logEntry.findUnique({
      where: { id: responseBody.id },
    });
    expect(stored?.message).toBe("it works");
    expect(stored?.workspaceId).toBe(workspaceId);
  });
});

describe("AC-WH-004/AC-WH-010: idempotency", () => {
  it("AC-WH-004: a repeated idempotency key returns the existing entry (200) instead of duplicating", async () => {
    const idempotencyKey = `idem-${randomUUID()}`;
    const first = await processWebhook(
      buildRequest("log", {
        token: rawToken,
        idempotencyKey,
        body: { level: "info", source: "idem-test", message: "first" },
      }),
      "log",
    );
    const firstBody = await first.json();
    expect(first.status).toBe(201);

    const second = await processWebhook(
      buildRequest("log", {
        token: rawToken,
        idempotencyKey,
        body: { level: "info", source: "idem-test", message: "second" },
      }),
      "log",
    );
    const secondBody = await second.json();

    expect(second.status).toBe(200);
    expect(secondBody.id).toBe(firstBody.id);

    const count = await db.logEntry.count({
      where: { workspaceId, source: "idem-test" },
    });
    expect(count).toBe(1);
  });

  it("AC-WH-010: repeated delivery WITHOUT an idempotency key is processed as a new create each time", async () => {
    const source = `no-idem-${randomUUID()}`;
    const request = () =>
      buildRequest("log", {
        token: rawToken,
        body: { level: "info", source, message: "retry" },
      });

    const first = await processWebhook(request(), "log");
    const second = await processWebhook(request(), "log");

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);

    const count = await db.logEntry.count({ where: { workspaceId, source } });
    expect(count).toBe(2);
  });
});

describe("AC-WH-005: rate limiting", () => {
  it("rejects requests over the configured rate with 429 and a Retry-After header, no entry created", async () => {
    const rateLimited = await webhookTokensService.create(
      workspaceId,
      `ratelimit-${randomUUID()}`,
    );

    // Pre-fill the fixed window in-memory so the next real request through
    // the pipeline is the one that trips the limit (avoids sending
    // WEBHOOK_RATE_LIMIT real requests through the full DB-backed pipeline).
    for (let i = 0; i < env.WEBHOOK_RATE_LIMIT; i++) {
      checkRateLimit(rateLimited.id);
    }

    const before = await db.logEntry.count({ where: { workspaceId } });
    const request = buildRequest("log", {
      token: rateLimited.token,
      body: { level: "info", source: "rate-test", message: "throttled" },
    });

    const response = await processWebhook(request, "log");

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBeTruthy();
    expect(await db.logEntry.count({ where: { workspaceId } })).toBe(before);
  });
});
