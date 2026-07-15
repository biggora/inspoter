import { db } from "@/lib/db";
import type { ProviderType } from "@/generated/prisma/client";
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

export class CredentialNotFoundError extends Error {
  constructor(workspaceId: string, provider: ProviderType) {
    super(`Credential not found for provider ${provider} in workspace ${workspaceId}`);
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
// workspace context). Mutating routes call requireWorkspaceOwner() first.
export class WorkspaceOwnerRequiredError extends Error {
  constructor() {
    super("Only the workspace owner can perform this action");
    this.name = "WorkspaceOwnerRequiredError";
  }
}

export interface CredentialSummary {
  id: string;
  provider: ProviderType;
  label: string;
  maskedHint: string;
  isValid: boolean | null;
  lastCheckedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface CredentialRecord {
  id: string;
  provider: ProviderType;
  label: string;
  maskedHint: string;
  isValid: boolean | null;
  lastCheckedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

function toSummary(credential: CredentialRecord): CredentialSummary {
  return {
    id: credential.id,
    provider: credential.provider,
    label: credential.label,
    maskedHint: credential.maskedHint,
    isValid: credential.isValid,
    lastCheckedAt: credential.lastCheckedAt,
    createdAt: credential.createdAt,
    updatedAt: credential.updatedAt,
  };
}

function computeMaskedHint(data: CredentialData): string {
  return data.type === "GODADDY_DNS"
    ? maskSecret(data.apiKey)
    : maskSecret(data.apiToken);
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

export async function getDecryptedCredential(
  workspaceId: string,
  provider: ProviderType,
): Promise<CredentialData | null> {
  const credential = await db.providerCredential.findUnique({
    where: { workspaceId_provider: { workspaceId, provider } },
  });
  if (!credential) return null;

  if (!isEncryptionConfigured()) {
    throw new EncryptionNotConfiguredError();
  }

  return decrypt({
    encryptedData: credential.encryptedData,
    iv: credential.iv,
    authTag: credential.authTag,
  });
}

export async function upsertCredential(
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

  const credential = await db.providerCredential.upsert({
    where: { workspaceId_provider: { workspaceId, provider } },
    create: {
      workspaceId,
      provider,
      label,
      encryptedData: encrypted.encryptedData,
      iv: encrypted.iv,
      authTag: encrypted.authTag,
      maskedHint,
    },
    update: {
      label,
      encryptedData: encrypted.encryptedData,
      iv: encrypted.iv,
      authTag: encrypted.authTag,
      maskedHint,
    },
  });

  return toSummary(credential);
}

export async function deleteCredential(
  workspaceId: string,
  provider: ProviderType,
): Promise<void> {
  const credential = await db.providerCredential.findUnique({
    where: { workspaceId_provider: { workspaceId, provider } },
  });
  if (!credential) {
    throw new CredentialNotFoundError(workspaceId, provider);
  }
  await db.providerCredential.delete({ where: { id: credential.id } });
}

export async function requireWorkspaceOwner(
  workspaceId: string,
  operatorId: string,
): Promise<void> {
  const membership = await db.workspaceMember.findUnique({
    where: { workspaceId_operatorId: { workspaceId, operatorId } },
  });
  if (!membership || membership.role !== "OWNER") {
    throw new WorkspaceOwnerRequiredError();
  }
}
