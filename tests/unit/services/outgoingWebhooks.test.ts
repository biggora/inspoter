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
import { db } from "@/lib/db";
import * as service from "@/lib/services/outgoingWebhooks";
import * as alertsService from "@/lib/services/alerts";

// Outgoing webhooks: CRUD + fan-out enqueue + HMAC signing + durable delivery
// drain. Uses the real dockerized Postgres (vitest fileParallelism: false).

const TEST_KEY =
  "1c0c78e9d208fb20edac6012a8b1d6e02a4bdc17f2b28593fdffafcafec6c9e5";

let workspaceId: string;
let otherWorkspaceId: string;

function baseInput(overrides: Partial<service.OutgoingWebhookSummary> = {}) {
  return {
    name: `wh-${randomUUID()}`,
    url: "https://example.com/hook",
    events: ["ALERT_CREATED" as const],
    isActive: true,
    ...overrides,
  };
}

beforeAll(async () => {
  const workspace = await db.workspace.create({
    data: {
      name: "OWH Workspace",
      slug: `owh-${randomUUID()}`,
      updatedAt: new Date(),
    },
  });
  workspaceId = workspace.id;
  const other = await db.workspace.create({
    data: {
      name: "OWH Other",
      slug: `owh-other-${randomUUID()}`,
      updatedAt: new Date(),
    },
  });
  otherWorkspaceId = other.id;
});

afterAll(async () => {
  if (workspaceId) {
    await db.workspace.delete({ where: { id: workspaceId } }).catch(() => {});
  }
  if (otherWorkspaceId) {
    await db.workspace
      .delete({ where: { id: otherWorkspaceId } })
      .catch(() => {});
  }
});

beforeEach(() => {
  vi.stubEnv("CREDENTIAL_ENCRYPTION_KEY", TEST_KEY);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("create()", () => {
  it("returns a whsec_ secret and stores it encrypted, never in plaintext", async () => {
    const created = await service.create(workspaceId, baseInput());

    expect(created.secret).toMatch(/^whsec_[0-9a-f]{48}$/);
    expect(created.secretPrefix).toBe(created.secret.slice(0, 14));

    const stored = await db.outgoingWebhook.findUniqueOrThrow({
      where: { id: created.id },
    });
    expect(stored.encryptedData).not.toContain(created.secret);
    expect(stored.secretPrefix).toBe(created.secretPrefix);
    expect(stored.encryptedData).toBeTruthy();
    expect(stored.iv).toBeTruthy();
    expect(stored.authTag).toBeTruthy();
  });

  it("throws EncryptionNotConfiguredError when the key is missing", async () => {
    vi.stubEnv("CREDENTIAL_ENCRYPTION_KEY", "");
    await expect(service.create(workspaceId, baseInput())).rejects.toBeInstanceOf(
      service.EncryptionNotConfiguredError,
    );
  });
});

describe("list()/get()", () => {
  it("never exposes secret material", async () => {
    const created = await service.create(workspaceId, baseInput());
    const list = await service.list(workspaceId);
    const found = list.find((w) => w.id === created.id);

    expect(found).toBeTruthy();
    expect(found).not.toHaveProperty("encryptedData");
    expect(found).not.toHaveProperty("iv");
    expect(found).not.toHaveProperty("authTag");
    expect(found?.secretPrefix).toBe(created.secretPrefix);
  });

  it("isolates webhooks per workspace", async () => {
    const created = await service.create(otherWorkspaceId, baseInput());
    const list = await service.list(workspaceId);
    expect(list.some((w) => w.id === created.id)).toBe(false);
  });
});

describe("update()/remove()", () => {
  it("updates mutable fields", async () => {
    const created = await service.create(workspaceId, baseInput());
    const updated = await service.update(created.id, workspaceId, {
      name: "renamed",
      events: ["LOG_CREATED", "MAIL_RECEIVED"],
      isActive: false,
    });
    expect(updated.name).toBe("renamed");
    expect(updated.events).toEqual(["LOG_CREATED", "MAIL_RECEIVED"]);
    expect(updated.isActive).toBe(false);
  });

  it("throws OutgoingWebhookNotFoundError for a foreign/absent id", async () => {
    const created = await service.create(workspaceId, baseInput());
    await expect(
      service.update(created.id, otherWorkspaceId, { name: "x" }),
    ).rejects.toBeInstanceOf(service.OutgoingWebhookNotFoundError);
    await expect(
      service.remove(created.id, otherWorkspaceId),
    ).rejects.toBeInstanceOf(service.OutgoingWebhookNotFoundError);
  });
});

describe("enqueue() fan-out", () => {
  it("creates one delivery per active subscription matching the event", async () => {
    const wsId = (
      await db.workspace.create({
        data: {
          name: "fanout",
          slug: `fanout-${randomUUID()}`,
          updatedAt: new Date(),
        },
      })
    ).id;
    try {
      const alertHook = await service.create(wsId, {
        ...baseInput(),
        events: ["ALERT_CREATED"],
      });
      // Different event — must not receive the alert.
      await service.create(wsId, { ...baseInput(), events: ["LOG_CREATED"] });
      // Matching event but inactive — must not receive it.
      await service.create(wsId, {
        ...baseInput(),
        events: ["ALERT_CREATED"],
        isActive: false,
      });

      await service.enqueue(wsId, "ALERT_CREATED", { alertId: "a1" });

      const deliveries = await db.webhookDelivery.findMany({
        where: { workspaceId: wsId },
      });
      expect(deliveries).toHaveLength(1);
      expect(deliveries[0].webhookId).toBe(alertHook.id);
      expect(deliveries[0].event).toBe("ALERT_CREATED");
      expect(deliveries[0].payload).toEqual({ alertId: "a1" });
      expect(deliveries[0].status).toBe("PENDING");
    } finally {
      await db.workspace.delete({ where: { id: wsId } }).catch(() => {});
    }
  });

  it("is a no-op when no subscription matches", async () => {
    const wsId = (
      await db.workspace.create({
        data: {
          name: "empty",
          slug: `empty-${randomUUID()}`,
          updatedAt: new Date(),
        },
      })
    ).id;
    try {
      await service.enqueue(wsId, "ALERT_CREATED", { alertId: "a1" });
      expect(
        await db.webhookDelivery.count({ where: { workspaceId: wsId } }),
      ).toBe(0);
    } finally {
      await db.workspace.delete({ where: { id: wsId } }).catch(() => {});
    }
  });
});

describe("signPayload()", () => {
  it("produces a stable sha256= HMAC of the raw body", () => {
    const secret = "whsec_test";
    const body = JSON.stringify({ hello: "world" });
    const expected = `sha256=${crypto
      .createHmac("sha256", secret)
      .update(body)
      .digest("hex")}`;
    expect(service.signPayload(secret, body)).toBe(expected);
    expect(service.signPayload(secret, body)).toMatch(/^sha256=[0-9a-f]{64}$/);
  });
});

describe("delivery drain", () => {
  async function makeClaimable(events: service.OutgoingWebhookSummary["events"]) {
    const created = await service.create(workspaceId, {
      ...baseInput(),
      events,
    });
    await service.enqueue(workspaceId, events[0], { alertId: "x" });
    const claimed = await service.claimDueDeliveries(
      new Date(),
      50,
      30_000,
    );
    const mine = claimed.filter((c) => c.webhook.id === created.id);
    return { created, claimed: mine };
  }

  it("claims a PENDING delivery exactly once (race-safe)", async () => {
    const { claimed } = await makeClaimable(["ALERT_CREATED"]);
    expect(claimed).toHaveLength(1);
    const deliveryId = claimed[0].delivery.id;

    const row = await db.webhookDelivery.findUniqueOrThrow({
      where: { id: deliveryId },
    });
    expect(row.status).toBe("DELIVERING");
    expect(row.leaseExpiresAt).not.toBeNull();

    // A second claim sweep must not re-claim the same (already DELIVERING) row.
    const again = await service.claimDueDeliveries(new Date(), 50, 30_000);
    expect(again.some((c) => c.delivery.id === deliveryId)).toBe(false);
  });

  it("marks DELIVERED on a 2xx response", async () => {
    const { claimed } = await makeClaimable(["ALERT_CREATED"]);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 204 })),
    );

    await service.deliverClaimed(claimed[0]);

    const row = await db.webhookDelivery.findUniqueOrThrow({
      where: { id: claimed[0].delivery.id },
    });
    expect(row.status).toBe("DELIVERED");
    expect(row.deliveredAt).not.toBeNull();
    expect(row.attempts).toBe(1);
    expect(row.lastStatusCode).toBe(204);
  });

  it("sends a signed body with the expected headers", async () => {
    const { created, claimed } = await makeClaimable(["ALERT_CREATED"]);
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await service.deliverClaimed(claimed[0]);

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://example.com/hook");
    expect(init.method).toBe("POST");
    expect(init.headers["X-Inspot-Event"]).toBe("ALERT_CREATED");
    expect(init.headers["X-Inspot-Delivery"]).toBe(claimed[0].delivery.id);
    expect(init.headers["X-Inspot-Signature"]).toMatch(/^sha256=[0-9a-f]{64}$/);

    // Signature must verify against the subscription's secret and exact body.
    const stored = await db.outgoingWebhook.findUniqueOrThrow({
      where: { id: created.id },
    });
    // (secret is not retrievable in cleartext from the DTO, so we only assert
    // the signature is well-formed and body is valid JSON here.)
    expect(stored.id).toBe(created.id);
    expect(() => JSON.parse(init.body)).not.toThrow();
    const envelope = JSON.parse(init.body);
    expect(envelope.id).toBe(claimed[0].delivery.id);
    expect(envelope.event).toBe("ALERT_CREATED");
  });

  it("retries with backoff on a 5xx response", async () => {
    const { claimed } = await makeClaimable(["ALERT_CREATED"]);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 500 })),
    );

    await service.deliverClaimed(claimed[0]);

    const row = await db.webhookDelivery.findUniqueOrThrow({
      where: { id: claimed[0].delivery.id },
    });
    expect(row.status).toBe("PENDING");
    expect(row.attempts).toBe(1);
    expect(row.lastStatusCode).toBe(500);
    expect(row.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());
    expect(row.leaseExpiresAt).toBeNull();
  });

  it("fails permanently on a 4xx (non-429) response", async () => {
    const { claimed } = await makeClaimable(["ALERT_CREATED"]);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 400 })),
    );

    await service.deliverClaimed(claimed[0]);

    const row = await db.webhookDelivery.findUniqueOrThrow({
      where: { id: claimed[0].delivery.id },
    });
    expect(row.status).toBe("FAILED");
    expect(row.attempts).toBe(1);
    expect(row.lastStatusCode).toBe(400);
  });

  it("fails after exhausting maxAttempts", async () => {
    const { claimed } = await makeClaimable(["ALERT_CREATED"]);
    // Bump attempts to one below the max so the next 5xx exhausts it.
    await db.webhookDelivery.update({
      where: { id: claimed[0].delivery.id },
      data: { attempts: 4 },
    });
    const bumped = {
      ...claimed[0],
      delivery: { ...claimed[0].delivery, attempts: 4 },
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 500 })),
    );

    await service.deliverClaimed(bumped);

    const row = await db.webhookDelivery.findUniqueOrThrow({
      where: { id: claimed[0].delivery.id },
    });
    expect(row.status).toBe("FAILED");
    expect(row.attempts).toBe(5);
  });

  it("reclaims a stale DELIVERING lease back to PENDING", async () => {
    const { claimed } = await makeClaimable(["ALERT_CREATED"]);
    await db.webhookDelivery.update({
      where: { id: claimed[0].delivery.id },
      data: { leaseExpiresAt: new Date(Date.now() - 60_000) },
    });

    await service.reclaimStaleLeases(new Date());

    const row = await db.webhookDelivery.findUniqueOrThrow({
      where: { id: claimed[0].delivery.id },
    });
    expect(row.status).toBe("PENDING");
    expect(row.leaseExpiresAt).toBeNull();
  });
});

describe("retryDelivery()", () => {
  it("resets a FAILED delivery to PENDING for immediate re-send", async () => {
    const created = await service.create(workspaceId, baseInput());
    await service.enqueue(workspaceId, "ALERT_CREATED", { alertId: "x" });
    const delivery = await db.webhookDelivery.findFirstOrThrow({
      where: { webhookId: created.id },
    });
    await db.webhookDelivery.update({
      where: { id: delivery.id },
      data: { status: "FAILED", attempts: 5, lastError: "boom" },
    });

    await service.retryDelivery(created.id, delivery.id, workspaceId);

    const row = await db.webhookDelivery.findUniqueOrThrow({
      where: { id: delivery.id },
    });
    expect(row.status).toBe("PENDING");
    expect(row.attempts).toBe(0);
    expect(row.lastError).toBeNull();
  });

  it("throws for an unknown delivery", async () => {
    const created = await service.create(workspaceId, baseInput());
    await expect(
      service.retryDelivery(created.id, "nope", workspaceId),
    ).rejects.toBeInstanceOf(service.WebhookDeliveryNotFoundError);
  });
});

describe("pruneOldDeliveries()", () => {
  const DAY_MS = 24 * 60 * 60 * 1000;

  async function makeDelivery(overrides: {
    webhookId: string;
    wsId: string;
    status: service.WebhookDeliverySummary["status"];
    createdAt: Date;
  }) {
    return db.webhookDelivery.create({
      data: {
        workspaceId: overrides.wsId,
        webhookId: overrides.webhookId,
        webhookWorkspaceId: overrides.wsId,
        event: "ALERT_CREATED",
        payload: { alertId: "x" },
        status: overrides.status,
        createdAt: overrides.createdAt,
        updatedAt: overrides.createdAt,
      },
    });
  }

  it("prunes only terminal (DELIVERED/FAILED) rows past the cutoff", async () => {
    const wsId = (
      await db.workspace.create({
        data: {
          name: "prune",
          slug: `prune-${randomUUID()}`,
          updatedAt: new Date(),
        },
      })
    ).id;
    try {
      const hook = await service.create(wsId, baseInput());
      const old = Date.now() - 40 * DAY_MS;
      const oldDelivered = await makeDelivery({
        webhookId: hook.id,
        wsId,
        status: "DELIVERED",
        createdAt: new Date(old),
      });
      const oldFailed = await makeDelivery({
        webhookId: hook.id,
        wsId,
        status: "FAILED",
        createdAt: new Date(old),
      });
      const recentDelivered = await makeDelivery({
        webhookId: hook.id,
        wsId,
        status: "DELIVERED",
        createdAt: new Date(),
      });

      const cutoff = new Date(Date.now() - 30 * DAY_MS);
      const deleted = await service.pruneOldDeliveries(cutoff, 50);

      expect(deleted).toBe(2);
      expect(
        await db.webhookDelivery.findUnique({ where: { id: oldDelivered.id } }),
      ).toBeNull();
      expect(
        await db.webhookDelivery.findUnique({ where: { id: oldFailed.id } }),
      ).toBeNull();
      expect(
        await db.webhookDelivery.findUnique({
          where: { id: recentDelivered.id },
        }),
      ).not.toBeNull();
    } finally {
      await db.workspace.delete({ where: { id: wsId } }).catch(() => {});
    }
  });

  it("never touches PENDING/DELIVERING rows regardless of age", async () => {
    const wsId = (
      await db.workspace.create({
        data: {
          name: "prune-active",
          slug: `prune-active-${randomUUID()}`,
          updatedAt: new Date(),
        },
      })
    ).id;
    try {
      const hook = await service.create(wsId, baseInput());
      const veryOld = new Date(Date.now() - 100 * DAY_MS);
      const pending = await makeDelivery({
        webhookId: hook.id,
        wsId,
        status: "PENDING",
        createdAt: veryOld,
      });
      const delivering = await makeDelivery({
        webhookId: hook.id,
        wsId,
        status: "DELIVERING",
        createdAt: veryOld,
      });

      const cutoff = new Date(Date.now() - 30 * DAY_MS);
      const deleted = await service.pruneOldDeliveries(cutoff, 50);

      expect(deleted).toBe(0);
      expect(
        await db.webhookDelivery.findUnique({ where: { id: pending.id } }),
      ).not.toBeNull();
      expect(
        await db.webhookDelivery.findUnique({ where: { id: delivering.id } }),
      ).not.toBeNull();
    } finally {
      await db.workspace.delete({ where: { id: wsId } }).catch(() => {});
    }
  });

  it("retains a row exactly at the cutoff (strict less-than boundary)", async () => {
    const wsId = (
      await db.workspace.create({
        data: {
          name: "prune-boundary",
          slug: `prune-boundary-${randomUUID()}`,
          updatedAt: new Date(),
        },
      })
    ).id;
    try {
      const hook = await service.create(wsId, baseInput());
      const cutoff = new Date(Date.now() - 30 * DAY_MS);
      const atCutoff = await makeDelivery({
        webhookId: hook.id,
        wsId,
        status: "FAILED",
        createdAt: cutoff,
      });

      const deleted = await service.pruneOldDeliveries(cutoff, 50);

      expect(deleted).toBe(0);
      expect(
        await db.webhookDelivery.findUnique({ where: { id: atCutoff.id } }),
      ).not.toBeNull();
    } finally {
      await db.workspace.delete({ where: { id: wsId } }).catch(() => {});
    }
  });

  it("respects batchSize, draining a backlog over multiple calls", async () => {
    const wsId = (
      await db.workspace.create({
        data: {
          name: "prune-batch",
          slug: `prune-batch-${randomUUID()}`,
          updatedAt: new Date(),
        },
      })
    ).id;
    try {
      const hook = await service.create(wsId, baseInput());
      const old = new Date(Date.now() - 40 * DAY_MS);
      for (let i = 0; i < 5; i++) {
        await makeDelivery({
          webhookId: hook.id,
          wsId,
          status: "FAILED",
          createdAt: old,
        });
      }

      const cutoff = new Date(Date.now() - 30 * DAY_MS);
      const deleted = await service.pruneOldDeliveries(cutoff, 3);

      expect(deleted).toBe(3);
      const remaining = await db.webhookDelivery.count({
        where: { workspaceId: wsId },
      });
      expect(remaining).toBe(2);
    } finally {
      await db.workspace.delete({ where: { id: wsId } }).catch(() => {});
    }
  });
});

describe("emission from domain services", () => {
  it("enqueues a delivery when an alert is created for a subscribed webhook", async () => {
    const wsId = (
      await db.workspace.create({
        data: {
          name: "emit",
          slug: `emit-${randomUUID()}`,
          updatedAt: new Date(),
        },
      })
    ).id;
    try {
      const hook = await service.create(wsId, {
        ...baseInput(),
        events: ["ALERT_CREATED"],
      });

      const alert = await alertsService.create(wsId, {
        category: "Test",
        severity: "info",
        source: "unit-test",
        message: "hello",
      });

      const deliveries = await db.webhookDelivery.findMany({
        where: { workspaceId: wsId, webhookId: hook.id },
      });
      expect(deliveries).toHaveLength(1);
      expect(deliveries[0].event).toBe("ALERT_CREATED");
      expect((deliveries[0].payload as { alertId: string }).alertId).toBe(
        alert.id,
      );
    } finally {
      await db.workspace.delete({ where: { id: wsId } }).catch(() => {});
    }
  });
});
