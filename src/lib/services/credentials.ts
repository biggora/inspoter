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

export type DecryptedCredential = CredentialData & {
  id: string;
  label: string;
};

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

function decryptRow(row: {
  id: string;
  label: string;
  encryptedData: string;
  iv: string;
  authTag: string;
}): DecryptedCredential {
  const data = decrypt({
    encryptedData: row.encryptedData,
    iv: row.iv,
    authTag: row.authTag,
  });
  return { ...data, id: row.id, label: row.label };
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

export async function getDecryptedCredentials(
  workspaceId: string,
  provider?: ProviderType,
): Promise<DecryptedCredential[]> {
  const credentials = await db.providerCredential.findMany({
    where: { workspaceId, ...(provider ? { provider } : {}) },
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
    },
  });

  return toSummary(credential);
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
