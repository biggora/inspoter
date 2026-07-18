import crypto from "node:crypto";
import { db } from "@/lib/db";

// Webhook token management (FR-WH-002, AC-WH-008/009). Raw secret is shown
// once at creation and never stored — only its sha256 hash is persisted
// (NFR-SEC-002); tokenPrefix is a display-only identification aid.

export interface WebhookTokenSummary {
  id: string;
  name: string;
  tokenPrefix: string;
  createdAt: Date;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
}

export interface ChannelWebhookDto extends WebhookTokenSummary {
  channelId: string;
}

export class ChannelWebhookNotFoundError extends Error {
  code = "CHANNEL_WEBHOOK_NOT_FOUND" as const;

  constructor() {
    super("Channel webhook not found");
  }
}

function generateToken(): {
  secret: string;
  tokenHash: string;
  tokenPrefix: string;
} {
  const secret = crypto.randomBytes(24).toString("hex");
  return {
    secret,
    tokenHash: crypto.createHash("sha256").update(secret).digest("hex"),
    tokenPrefix: secret.slice(0, 12),
  };
}

function toSummary(token: {
  id: string;
  name: string;
  tokenPrefix: string;
  createdAt: Date;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
}): WebhookTokenSummary {
  return {
    id: token.id,
    name: token.name,
    tokenPrefix: token.tokenPrefix,
    createdAt: token.createdAt,
    lastUsedAt: token.lastUsedAt,
    revokedAt: token.revokedAt,
  };
}

export async function create(
  workspaceId: string,
  name: string,
): Promise<{ id: string; token: string; prefix: string }> {
  const { secret, tokenHash, tokenPrefix } = generateToken();

  const created = await db.webhookToken.create({
    data: { workspaceId, name, tokenHash, tokenPrefix },
  });

  return { id: created.id, token: secret, prefix: tokenPrefix };
}

export async function list(
  workspaceId: string,
): Promise<WebhookTokenSummary[]> {
  const tokens = await db.webhookToken.findMany({
    where: { workspaceId, channelId: null },
    orderBy: { createdAt: "desc" },
  });

  return tokens.map(toSummary);
}

export async function revoke(id: string, workspaceId: string): Promise<void> {
  await db.webhookToken.update({
    where: { id, workspaceId, channelId: null },
    data: { revokedAt: new Date() },
  });
}

async function requireChannel(
  channelId: string,
  workspaceId: string,
): Promise<void> {
  const channel = await db.channel.findUnique({
    where: { id: channelId, workspaceId },
    select: { id: true },
  });
  if (!channel) throw new ChannelWebhookNotFoundError();
}

export async function listForChannel(
  channelId: string,
  workspaceId: string,
): Promise<ChannelWebhookDto[]> {
  await requireChannel(channelId, workspaceId);
  const tokens = await db.webhookToken.findMany({
    where: { workspaceId, channelId },
    orderBy: { createdAt: "desc" },
  });

  return tokens.map((token) => ({
    ...toSummary(token),
    channelId,
  }));
}

export async function createForChannel(
  channelId: string,
  workspaceId: string,
  name: string,
): Promise<{ webhook: ChannelWebhookDto; url: string }> {
  await requireChannel(channelId, workspaceId);
  const { secret, tokenHash, tokenPrefix } = generateToken();
  const created = await db.webhookToken.create({
    data: {
      workspaceId,
      channelId,
      channelWorkspaceId: workspaceId,
      name,
      tokenHash,
      tokenPrefix,
    },
  });

  return {
    webhook: { ...toSummary(created), channelId },
    url: `/api/webhooks/channels/${created.id}/${secret}`,
  };
}

export async function revokeForChannel(
  channelId: string,
  webhookId: string,
  workspaceId: string,
): Promise<void> {
  const result = await db.webhookToken.updateMany({
    where: { id: webhookId, workspaceId, channelId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  if (result.count > 0) return;

  const alreadyRevoked = await db.webhookToken.findFirst({
    where: { id: webhookId, workspaceId, channelId },
    select: { id: true },
  });
  if (!alreadyRevoked) throw new ChannelWebhookNotFoundError();
}

export async function authenticateChannelWebhook(
  webhookId: string,
  secret: string,
): Promise<{
  id: string;
  workspaceId: string;
  channelId: string;
  name: string;
} | null> {
  const tokenHash = crypto.createHash("sha256").update(secret).digest("hex");
  const token = await db.webhookToken.findFirst({
    where: {
      id: webhookId,
      tokenHash,
      revokedAt: null,
      channelId: { not: null },
    },
    select: { id: true, workspaceId: true, channelId: true, name: true },
  });
  if (!token?.channelId) return null;
  return { ...token, channelId: token.channelId };
}
