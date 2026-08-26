import { db } from "@/lib/db";
import type { ProviderType } from "@/generated/prisma/client";
import { PROVIDER_REGISTRY } from "@/lib/providers/registry";
import {
  encrypt,
  decrypt,
  maskSecret,
  isEncryptionConfigured,
  type CredentialData,
} from "@/lib/crypto/credentials";

// Workspace-scoped provider credential service (encrypted at rest,
// architecture.md provider credentials slice). The sole sanctioned Prisma
// caller for the ProviderCredential model outside the auth DAL.
// Multiple credentials per provider are allowed per workspace; each
// credential is identified by its own id.

export class CredentialNotFoundError extends Error {
  constructor(id: string) {
    super(`Credential not found: ${id}`);
    this.name = "CredentialNotFoundError";
  }
}

export class EncryptionNotConfiguredError extends Error {
  constructor() {
    super("CREDENTIAL_ENCRYPTION_KEY is not configured");
    this.name = "EncryptionNotConfiguredError";
  }
}

// Authorization is intentionally kept out of the CRUD functions below (they
// take only workspaceId, matching the API route's already-verified
// workspace context). Any workspace member may manage provider credentials —
// membership is enforced upstream by requireAuthWithWorkspaceHeader().
export interface CredentialSummary {
  id: string;
  provider: ProviderType;
  label: string;
  maskedHint: string;
  allowInsecure: boolean;
  isValid: boolean | null;
  lastCheckedAt: Date | null;
  autoRefreshEnabled: boolean;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export async function getEmbeddingProfileSelection(workspaceId: string) {
  return db.workspaceEmbeddingProfile.findUnique({
    where: { workspaceId },
    select: { credentialId: true, model: true },
  });
}

export type DecryptedCredential = CredentialData & {
  id: string;
  label: string;
  // src/lib/llm/registry.ts picks the active model by isDefault and falls
  // back to the oldest credential, so a decrypted credential has to carry
  // both — before this it carried neither and the choice was invisible.
  isDefault: boolean;
  createdAt: Date;
};

interface CredentialRecord {
  id: string;
  provider: ProviderType;
  label: string;
  maskedHint: string;
  allowInsecure: boolean;
  isValid: boolean | null;
  lastCheckedAt: Date | null;
  autoRefreshEnabled: boolean;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}

function toSummary(credential: CredentialRecord): CredentialSummary {
  return {
    id: credential.id,
    provider: credential.provider,
    label: credential.label,
    maskedHint: credential.maskedHint,
    allowInsecure: credential.allowInsecure,
    isValid: credential.isValid,
    lastCheckedAt: credential.lastCheckedAt,
    autoRefreshEnabled: credential.autoRefreshEnabled,
    isDefault: credential.isDefault,
    createdAt: credential.createdAt,
    updatedAt: credential.updatedAt,
  };
}

function computeMaskedHint(data: CredentialData): string {
  if (data.type === "GODADDY_DNS") return maskSecret(data.apiKey);
  if (data.type === "MAIL_PASSWORD") return maskSecret(data.imapPassword);
  // The WEBHOOK_* payloads are stored on OutgoingWebhook, never as a
  // ProviderCredential, so these branches are unreachable here — kept only to
  // satisfy the union.
  if (
    data.type === "WEBHOOK_SECRET" ||
    data.type === "WEBHOOK_ED25519_KEY" ||
    data.type === "WEBHOOK_TELEGRAM_BOT"
  ) {
    return maskSecret(data.secret);
  }
  if (
    data.type === "OPENAI_COMPATIBLE" ||
    data.type === "ANTHROPIC_COMPATIBLE"
  ) {
    return maskSecret(data.apiKey);
  }
  return maskSecret(data.apiToken);
}

function decryptRow(row: {
  id: string;
  label: string;
  encryptedData: string;
  iv: string;
  authTag: string;
  isDefault: boolean;
  createdAt: Date;
}): DecryptedCredential {
  const data = decrypt({
    encryptedData: row.encryptedData,
    iv: row.iv,
    authTag: row.authTag,
  });
  return {
    ...data,
    id: row.id,
    label: row.label,
    isDefault: row.isDefault,
    createdAt: row.createdAt,
  };
}

export async function listCredentials(
  workspaceId: string,
): Promise<CredentialSummary[]> {
  const credentials = await db.providerCredential.findMany({
    where: { workspaceId },
    orderBy: { createdAt: "asc" },
  });
  return credentials.map(toSummary);
}

// `provider` accepts a list so a caller that spans several types — the LLM
// registry covers two transports — does not have to decrypt every other
// credential in the workspace just to find its own.
export async function getDecryptedCredentials(
  workspaceId: string,
  provider?: ProviderType | readonly ProviderType[],
): Promise<DecryptedCredential[]> {
  const credentials = await db.providerCredential.findMany({
    where: {
      workspaceId,
      ...(provider
        ? {
            provider:
              typeof provider === "string" ? provider : { in: [...provider] },
          }
        : {}),
    },
    orderBy: { createdAt: "asc" },
  });
  if (!credentials.length) return [];

  if (!isEncryptionConfigured()) {
    throw new EncryptionNotConfiguredError();
  }

  return credentials.map(decryptRow);
}

export async function getDecryptedCredentialById(
  id: string,
  workspaceId: string,
): Promise<DecryptedCredential | null> {
  const credential = await db.providerCredential.findFirst({
    where: { id, workspaceId },
  });
  if (!credential) return null;

  if (!isEncryptionConfigured()) {
    throw new EncryptionNotConfiguredError();
  }

  return decryptRow(credential);
}

export async function createCredential(
  workspaceId: string,
  provider: ProviderType,
  label: string,
  data: CredentialData,
): Promise<CredentialSummary> {
  if (!isEncryptionConfigured()) {
    throw new EncryptionNotConfiguredError();
  }

  const encrypted = encrypt(data);
  const maskedHint = computeMaskedHint(data);

  const credential = await db.providerCredential.create({
    data: {
      workspaceId,
      provider,
      label,
      encryptedData: encrypted.encryptedData,
      iv: encrypted.iv,
      authTag: encrypted.authTag,
      maskedHint,
      allowInsecure:
        data.type === "CPANEL_WHM" || data.type === "CPANEL_UAPI"
          ? (data.allowInsecure ?? false)
          : false,
    },
  });

  return toSummary(credential);
}

export async function updateCredential(
  id: string,
  workspaceId: string,
  label: string,
  data: CredentialData,
): Promise<CredentialSummary> {
  if (!isEncryptionConfigured()) {
    throw new EncryptionNotConfiguredError();
  }

  const existing = await db.providerCredential.findFirst({
    where: { id, workspaceId },
  });
  if (!existing) {
    throw new CredentialNotFoundError(id);
  }

  const encrypted = encrypt(data);
  const maskedHint = computeMaskedHint(data);

  const credential = await db.providerCredential.update({
    where: { id },
    data: {
      label,
      encryptedData: encrypted.encryptedData,
      iv: encrypted.iv,
      authTag: encrypted.authTag,
      maskedHint,
      allowInsecure:
        data.type === "CPANEL_WHM" || data.type === "CPANEL_UAPI"
          ? (data.allowInsecure ?? false)
          : false,
    },
  });

  return toSummary(credential);
}

// Per-credential kill switch for the background listing refresh
// (provider-snapshot-scheduler.ts). Kept apart from updateCredential above,
// which demands the full secret payload — flipping a toggle must not require
// re-entering an API token.
export async function setAutoRefreshEnabled(
  id: string,
  workspaceId: string,
  enabled: boolean,
): Promise<CredentialSummary> {
  const existing = await db.providerCredential.findFirst({
    where: { id, workspaceId },
  });
  if (!existing) {
    throw new CredentialNotFoundError(id);
  }

  const credential = await db.providerCredential.update({
    where: { id },
    data: { autoRefreshEnabled: enabled },
  });
  return toSummary(credential);
}

// The workspace's active credential for this credential's category. Kept
// apart from updateCredential for the same reason as setAutoRefreshEnabled:
// choosing which model answers must not mean re-entering the API key.
//
// Exclusivity is enforced here rather than by a unique index because the
// category (DNS/HOSTING/LLM) lives in PROVIDER_REGISTRY, not in the
// database. Clearing the flag is a legal state: with no default anywhere the
// LLM registry falls back to the oldest credential, exactly as before the
// flag existed.
export async function setDefaultCredential(
  id: string,
  workspaceId: string,
  isDefault: boolean,
): Promise<CredentialSummary> {
  const existing = await db.providerCredential.findFirst({
    where: { id, workspaceId },
  });
  if (!existing) {
    throw new CredentialNotFoundError(id);
  }

  const category = PROVIDER_REGISTRY[existing.provider].category;
  const siblings = (Object.keys(PROVIDER_REGISTRY) as ProviderType[]).filter(
    (type) => PROVIDER_REGISTRY[type].category === category,
  );

  return db.$transaction(async (tx) => {
    if (isDefault) {
      await tx.providerCredential.updateMany({
        where: {
          workspaceId,
          provider: { in: siblings },
          id: { not: id },
          isDefault: true,
        },
        data: { isDefault: false },
      });
    }

    const credential = await tx.providerCredential.update({
      where: { id },
      data: { isDefault },
    });
    return toSummary(credential);
  });
}

export class CredentialDeleteConflictError extends Error {
  code = "ADDRESS_CONFLICT" as const;
  constructor() {
    super(
      "Cannot delete credential: active agent address claim conflicts with detach",
    );
  }
}

export async function deleteCredential(
  id: string,
  workspaceId: string,
): Promise<void> {
  const credential = await db.providerCredential.findFirst({
    where: { id, workspaceId },
  });
  if (!credential) {
    throw new CredentialNotFoundError(id);
  }

  await db.$transaction(async (tx) => {
    const localServers = await tx.localServer.findMany({
      where: { providerCredentialId: id, workspaceId },
      include: {
        metricSnapshot: true,
        addresses: { where: { isCurrent: true } },
      },
    });

    for (const server of localServers) {
      const hasActiveAgent = server.metricSnapshot !== null;

      if (hasActiveAgent) {
        const agentGlobalIpv4s = server.addresses.filter(
          (a) =>
            a.source === "AGENT" &&
            a.family === "IPV4" &&
            a.scope === "GLOBAL" &&
            a.isCurrent,
        );

        for (const addr of agentGlobalIpv4s) {
          const existingClaim = await tx.localServerAddress.findFirst({
            where: {
              workspaceId,
              matchKey: addr.address,
              isCurrent: true,
              isEnrollmentClaim: true,
              localServerId: { not: server.id },
            },
          });
          if (existingClaim) {
            throw new CredentialDeleteConflictError();
          }

          await tx.localServerAddress.updateMany({
            where: {
              workspaceId,
              localServerId: server.id,
              address: addr.address,
              source: "AGENT",
            },
            data: { isEnrollmentClaim: true, matchKey: addr.address },
          });
        }

        await tx.localServerAddress.updateMany({
          where: {
            workspaceId,
            localServerId: server.id,
            source: "PROVIDER",
            isCurrent: true,
          },
          data: {
            isCurrent: false,
            retiredAt: new Date(),
            isEnrollmentClaim: false,
            matchKey: null,
          },
        });

        await tx.localServer.update({
          where: { id: server.id },
          data: {
            origin: "AGENT",
            providerCredentialId: null,
            providerCredentialWorkspaceId: null,
            providerRemoteId: null,
            providerLastSeenAt: null,
            providerMissingAt: null,
          },
        });
      } else {
        await tx.localServer.delete({ where: { id: server.id } });
      }
    }

    await tx.providerCredential.delete({ where: { id: credential.id } });
  });
}
