import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import * as webhookTokensService from "@/lib/services/webhookTokens";
import * as serverMetricsService from "@/lib/services/serverMetrics";

// Webhook token management service (FR-WH-002, AC-WH-008/009, NFR-SEC-002).

const NAME_PREFIX = `wht-${randomUUID()}`;
let workspaceId: string;
let otherWorkspaceId: string;
let channelId: string;

beforeAll(async () => {
  const workspace = await db.workspace.create({
    data: {
      name: "Test Workspace",
      slug: `test-${randomUUID()}`,
      updatedAt: new Date(),
    },
  });
  workspaceId = workspace.id;

  const otherWorkspace = await db.workspace.create({
    data: {
      name: "Other Workspace",
      slug: `test-other-${randomUUID()}`,
      updatedAt: new Date(),
    },
  });
  otherWorkspaceId = otherWorkspace.id;

  const category = await db.messageCategory.create({
    data: { workspaceId, name: `${NAME_PREFIX}-category` },
  });
  const channel = await db.channel.create({
    data: {
      workspaceId,
      messageCategoryId: category.id,
      messageCategoryWorkspaceId: workspaceId,
      name: `${NAME_PREFIX}-channel`,
    },
  });
  channelId = channel.id;
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

describe("AC-WH-008: create()", () => {
  it("returns an id, a raw secret, and a prefix derived from that secret", async () => {
    const created = await webhookTokensService.create(
      workspaceId,
      `${NAME_PREFIX}-create`,
    );

    expect(created.id).toBeTruthy();
    expect(created.token).toBeTruthy();
    expect(created.prefix).toBe(created.token.slice(0, 12));
  });

  it("NFR-SEC-002: never persists the raw secret, only its sha256 hash", async () => {
    const created = await webhookTokensService.create(
      workspaceId,
      `${NAME_PREFIX}-hash`,
    );

    const stored = await db.webhookToken.findUnique({
      where: { id: created.id },
    });
    expect(stored?.tokenPrefix).toBe(created.prefix);
    expect(stored?.tokenHash).not.toBe(created.token);
  });
});

describe("NFR-SEC-002: list()", () => {
  it("returns summaries that never include the raw secret or its hash", async () => {
    const created = await webhookTokensService.create(
      workspaceId,
      `${NAME_PREFIX}-list`,
    );

    const list = await webhookTokensService.list(workspaceId);
    const found = list.find((t) => t.id === created.id);

    expect(found).toBeTruthy();
    expect(found).not.toHaveProperty("token");
    expect(found).not.toHaveProperty("tokenHash");
    expect(found?.name).toBe(`${NAME_PREFIX}-list`);
    expect(found?.tokenPrefix).toBe(created.prefix);
    expect(found?.revokedAt).toBeNull();
    expect(found?.lastUsedAt).toBeNull();
  });

  it("isolates tokens per workspace", async () => {
    const created = await webhookTokensService.create(
      otherWorkspaceId,
      `${NAME_PREFIX}-isolated`,
    );

    const listForWorkspace = await webhookTokensService.list(workspaceId);
    expect(listForWorkspace.some((t) => t.id === created.id)).toBe(false);

    const listForOther = await webhookTokensService.list(otherWorkspaceId);
    expect(listForOther.some((t) => t.id === created.id)).toBe(true);
  });
});

describe("AC-WH-009: revoke()", () => {
  it("sets revokedAt, marking the token revoked in list() and storage", async () => {
    const created = await webhookTokensService.create(
      workspaceId,
      `${NAME_PREFIX}-revoke`,
    );

    await webhookTokensService.revoke(created.id, workspaceId);

    const stored = await db.webhookToken.findUnique({
      where: { id: created.id },
    });
    expect(stored?.revokedAt).not.toBeNull();

    const list = await webhookTokensService.list(workspaceId);
    const found = list.find((t) => t.id === created.id);
    expect(found?.revokedAt).not.toBeNull();
  });
});

describe("rotate()", () => {
  it("returns a new secret and prefix, revokes the old row, and carries the name forward", async () => {
    const created = await webhookTokensService.create(
      workspaceId,
      `${NAME_PREFIX}-rotate`,
    );

    const rotated = await webhookTokensService.rotate(created.id, workspaceId);

    expect(rotated.id).not.toBe(created.id);
    expect(rotated.token).not.toBe(created.token);
    expect(rotated.prefix).toBe(rotated.token.slice(0, 12));

    const oldRow = await db.webhookToken.findUnique({
      where: { id: created.id },
    });
    expect(oldRow?.revokedAt).not.toBeNull();

    const newRow = await db.webhookToken.findUnique({
      where: { id: rotated.id },
    });
    expect(newRow?.name).toBe(`${NAME_PREFIX}-rotate`);
    expect(newRow?.revokedAt).toBeNull();
  });

  it("the rotated-in token authenticates metrics ingestion (hash lookup matches)", async () => {
    const created = await webhookTokensService.create(
      workspaceId,
      `${NAME_PREFIX}-rotate-auth`,
    );
    const rotated = await webhookTokensService.rotate(created.id, workspaceId);

    const context =
      await serverMetricsService.authenticateMetricsToken(rotated.token);
    expect(context).toEqual({ tokenId: rotated.id, workspaceId });

    const oldContext =
      await serverMetricsService.authenticateMetricsToken(created.token);
    expect(oldContext).toBeNull();
  });

  it("throws WebhookTokenRevokedError when rotating an already-revoked token", async () => {
    const created = await webhookTokensService.create(
      workspaceId,
      `${NAME_PREFIX}-rotate-revoked`,
    );
    await webhookTokensService.revoke(created.id, workspaceId);

    await expect(
      webhookTokensService.rotate(created.id, workspaceId),
    ).rejects.toBeInstanceOf(webhookTokensService.WebhookTokenRevokedError);
  });

  it("throws WebhookTokenNotFoundError when rotating with the wrong workspaceId", async () => {
    const created = await webhookTokensService.create(
      workspaceId,
      `${NAME_PREFIX}-rotate-foreign`,
    );

    await expect(
      webhookTokensService.rotate(created.id, otherWorkspaceId),
    ).rejects.toBeInstanceOf(webhookTokensService.WebhookTokenNotFoundError);
  });

  it("throws WebhookTokenNotFoundError for a channel-bound token (cannot be rotated)", async () => {
    const created = await webhookTokensService.createForChannel(
      channelId,
      workspaceId,
      `${NAME_PREFIX}-rotate-channel-bound`,
    );

    await expect(
      webhookTokensService.rotate(created.webhook.id, workspaceId),
    ).rejects.toBeInstanceOf(webhookTokensService.WebhookTokenNotFoundError);
  });
});

describe("channel-scoped webhooks", () => {
  it("creates a channel-bound credential and returns its secret only in a relative one-time URL", async () => {
    const created = await webhookTokensService.createForChannel(
      channelId,
      workspaceId,
      `${NAME_PREFIX}-channel-create`,
    );

    expect(created.webhook.channelId).toBe(channelId);
    expect(created.url).toMatch(
      new RegExp(`^/api/webhooks/channels/${created.webhook.id}/[0-9a-f]{48}$`),
    );
    expect(created.webhook).not.toHaveProperty("token");
    expect(created.webhook).not.toHaveProperty("tokenHash");

    const secret = created.url.split("/").at(-1)!;
    const stored = await db.webhookToken.findUnique({
      where: { id: created.webhook.id },
    });
    expect(stored?.tokenHash).not.toBe(secret);
    expect(stored?.channelId).toBe(channelId);
    expect(stored?.channelWorkspaceId).toBe(workspaceId);
  });

  it("keeps legacy and channel-scoped lists isolated", async () => {
    const legacy = await webhookTokensService.create(
      workspaceId,
      `${NAME_PREFIX}-legacy-only`,
    );
    const channel = await webhookTokensService.createForChannel(
      channelId,
      workspaceId,
      `${NAME_PREFIX}-channel-only`,
    );

    expect(
      (await webhookTokensService.list(workspaceId)).some(
        (item) => item.id === legacy.id,
      ),
    ).toBe(true);
    expect(
      (await webhookTokensService.list(workspaceId)).some(
        (item) => item.id === channel.webhook.id,
      ),
    ).toBe(false);
    expect(
      (await webhookTokensService.listForChannel(channelId, workspaceId)).some(
        (item) => item.id === channel.webhook.id,
      ),
    ).toBe(true);
  });

  it("fails closed for a channel from another workspace", async () => {
    await expect(
      webhookTokensService.createForChannel(
        channelId,
        otherWorkspaceId,
        `${NAME_PREFIX}-foreign`,
      ),
    ).rejects.toBeInstanceOf(webhookTokensService.ChannelWebhookNotFoundError);
  });

  it("enforces the nullable pair and compound workspace constraints in PostgreSQL", async () => {
    await expect(
      db.webhookToken.create({
        data: {
          workspaceId,
          channelId,
          channelWorkspaceId: null,
          name: `${NAME_PREFIX}-broken-pair`,
          tokenHash: `broken-pair-${randomUUID()}`,
          tokenPrefix: "broken-pair",
        },
      }),
    ).rejects.toThrow();

    await expect(
      db.webhookToken.create({
        data: {
          workspaceId: otherWorkspaceId,
          channelId,
          channelWorkspaceId: otherWorkspaceId,
          name: `${NAME_PREFIX}-broken-workspace`,
          tokenHash: `broken-workspace-${randomUUID()}`,
          tokenPrefix: "broken-ws",
        },
      }),
    ).rejects.toThrow();
  });

  it("revokes only when both channel and workspace match", async () => {
    const created = await webhookTokensService.createForChannel(
      channelId,
      workspaceId,
      `${NAME_PREFIX}-channel-revoke`,
    );
    await expect(
      webhookTokensService.revokeForChannel(
        channelId,
        created.webhook.id,
        otherWorkspaceId,
      ),
    ).rejects.toBeInstanceOf(webhookTokensService.ChannelWebhookNotFoundError);

    await webhookTokensService.revokeForChannel(
      channelId,
      created.webhook.id,
      workspaceId,
    );
    const firstRevokedAt = (
      await db.webhookToken.findUniqueOrThrow({
        where: { id: created.webhook.id },
        select: { revokedAt: true },
      })
    ).revokedAt;
    await webhookTokensService.revokeForChannel(
      channelId,
      created.webhook.id,
      workspaceId,
    );
    expect(
      (
        await db.webhookToken.findUniqueOrThrow({
          where: { id: created.webhook.id },
          select: { revokedAt: true },
        })
      ).revokedAt,
    ).toEqual(firstRevokedAt);
    expect(
      await webhookTokensService.authenticateChannelWebhook(
        created.webhook.id,
        created.url.split("/").at(-1)!,
      ),
    ).toBeNull();
  });

  it("cascades a channel delete through its webhook and idempotency records", async () => {
    const category = await db.messageCategory.create({
      data: { workspaceId, name: `${NAME_PREFIX}-cascade-category` },
    });
    const channel = await db.channel.create({
      data: {
        workspaceId,
        messageCategoryId: category.id,
        messageCategoryWorkspaceId: workspaceId,
        name: `${NAME_PREFIX}-cascade-channel`,
      },
    });
    const created = await webhookTokensService.createForChannel(
      channel.id,
      workspaceId,
      `${NAME_PREFIX}-cascade-webhook`,
    );
    await db.idempotencyKey.create({
      data: {
        workspaceId,
        tokenId: created.webhook.id,
        tokenWorkspaceId: workspaceId,
        key: `cascade-${randomUUID()}`,
        targetType: "channel-message",
        targetId: "test-target",
      },
    });

    await db.channel.delete({ where: { id: channel.id } });
    expect(
      await db.webhookToken.findUnique({
        where: { id: created.webhook.id },
      }),
    ).toBeNull();
    expect(
      await db.idempotencyKey.count({
        where: { tokenId: created.webhook.id },
      }),
    ).toBe(0);
  });
});
