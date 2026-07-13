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

export async function create(
  workspaceId: string,
  name: string,
): Promise<{ id: string; token: string; prefix: string }> {
  const secret = crypto.randomBytes(24).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(secret).digest("hex");
  const tokenPrefix = secret.slice(0, 12);

  const created = await db.webhookToken.create({
    data: { workspaceId, name, tokenHash, tokenPrefix },
  });

  return { id: created.id, token: secret, prefix: tokenPrefix };
}

export async function list(
  workspaceId: string,
): Promise<WebhookTokenSummary[]> {
  const tokens = await db.webhookToken.findMany({
    where: { workspaceId },
    orderBy: { createdAt: "desc" },
  });

  return tokens.map((t) => ({
    id: t.id,
    name: t.name,
    tokenPrefix: t.tokenPrefix,
    createdAt: t.createdAt,
    lastUsedAt: t.lastUsedAt,
    revokedAt: t.revokedAt,
  }));
}

export async function revoke(id: string, workspaceId: string): Promise<void> {
  await db.webhookToken.update({
    where: { id, workspaceId },
    data: { revokedAt: new Date() },
  });
}
