import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import {
  Prisma,
  type ProviderResourceBinding,
  type ProviderResourceType,
  type ProviderMode,
} from "@/generated/prisma/client";

// Provider resource binding service (Q-13 / R2.1e) — workspace-scoped CRUD
// and lease lifecycle for ProviderResourceBinding. Later slices (R2.2-R2.4)
// wire domains/servers services through this layer instead of calling
// providers directly.

const LEASE_DURATION_MS = 5 * 60 * 1000;
const MOCK_ACCOUNT_KEY = "mock:v1";
const MOCK_PREFIX = "mock:";

export class BindingNotFoundError extends Error {
  constructor(id: string) {
    super(`Provider resource binding not found: ${id}`);
    this.name = "BindingNotFoundError";
  }
}

export class BindingActiveOperationError extends Error {
  constructor(id: string) {
    super(`Provider resource binding has an active operation: ${id}`);
    this.name = "BindingActiveOperationError";
  }
}

export class BindingLeaseConflictError extends Error {
  constructor(id: string) {
    super(`Lease conflict for provider resource binding: ${id}`);
    this.name = "BindingLeaseConflictError";
  }
}

export class BindingValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BindingValidationError";
  }
}

function isPrismaNotFoundError(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025"
  );
}

function isPrismaUniqueConstraintError(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002"
  );
}

function validateMockClaim(
  workspaceId: string,
  provider: string,
  accountKey: string | undefined,
  remoteId: string,
): string {
  if (accountKey !== undefined && accountKey !== MOCK_ACCOUNT_KEY) {
    throw new BindingValidationError(
      `Mock bindings must use accountKey '${MOCK_ACCOUNT_KEY}'`,
    );
  }
  const prefix = `${MOCK_ACCOUNT_KEY}:${workspaceId}:${provider}:`;
  if (!remoteId.startsWith(prefix) || remoteId.length === prefix.length) {
    throw new BindingValidationError(
      `Mock remoteId must match pattern ${prefix}<key>`,
    );
  }
  return MOCK_ACCOUNT_KEY;
}

function validateRealClaim(
  accountKey: string | undefined,
  remoteId: string,
): string {
  if (!accountKey || accountKey.trim().length === 0) {
    throw new BindingValidationError("accountKey is required for REAL bindings");
  }
  if (accountKey.startsWith(MOCK_PREFIX)) {
    throw new BindingValidationError(
      "REAL bindings cannot use a mock accountKey",
    );
  }
  if (remoteId.startsWith(MOCK_PREFIX)) {
    throw new BindingValidationError("REAL bindings cannot use a mock remoteId");
  }
  return accountKey;
}

export async function listBindings(
  workspaceId: string,
  resourceType?: ProviderResourceType,
): Promise<ProviderResourceBinding[]> {
  return db.providerResourceBinding.findMany({
    where: { workspaceId, ...(resourceType ? { resourceType } : {}) },
    orderBy: [{ provider: "asc" }, { displayName: "asc" }],
  });
}

export async function getBinding(
  id: string,
  workspaceId: string,
): Promise<ProviderResourceBinding> {
  const binding = await db.providerResourceBinding.findUnique({
    where: { id_workspaceId: { id, workspaceId } },
  });
  if (!binding) throw new BindingNotFoundError(id);
  return binding;
}

export async function claimBinding(
  workspaceId: string,
  provider: string,
  resourceType: ProviderResourceType,
  mode: ProviderMode,
  remoteId: string,
  displayName: string,
  accountKey?: string,
): Promise<ProviderResourceBinding> {
  const trimmedDisplayName = displayName.trim();
  if (trimmedDisplayName.length === 0) {
    throw new BindingValidationError("Display name cannot be empty");
  }

  const resolvedAccountKey =
    mode === "MOCK"
      ? validateMockClaim(workspaceId, provider, accountKey, remoteId)
      : validateRealClaim(accountKey, remoteId);

  try {
    return await db.providerResourceBinding.create({
      data: {
        workspaceId,
        provider,
        accountKey: resolvedAccountKey,
        resourceType,
        mode,
        remoteId,
        displayName: trimmedDisplayName,
      },
    });
  } catch (err) {
    if (isPrismaUniqueConstraintError(err)) {
      throw new BindingValidationError(
        `Binding already exists for provider=${provider} accountKey=${resolvedAccountKey} resourceType=${resourceType} mode=${mode} remoteId=${remoteId}`,
      );
    }
    throw err;
  }
}

export async function updateDisplayName(
  id: string,
  workspaceId: string,
  displayName: string,
): Promise<ProviderResourceBinding> {
  const trimmed = displayName.trim();
  if (trimmed.length === 0) {
    throw new BindingValidationError("Display name cannot be empty");
  }
  try {
    return await db.providerResourceBinding.update({
      where: { id_workspaceId: { id, workspaceId } },
      data: { displayName: trimmed },
    });
  } catch (err) {
    if (isPrismaNotFoundError(err)) throw new BindingNotFoundError(id);
    throw err;
  }
}

export async function removeBinding(
  id: string,
  workspaceId: string,
): Promise<void> {
  try {
    await db.providerResourceBinding.delete({
      where: { id_workspaceId: { id, workspaceId }, operationState: "IDLE" },
    });
  } catch (err) {
    if (isPrismaNotFoundError(err)) {
      const existing = await db.providerResourceBinding.findUnique({
        where: { id_workspaceId: { id, workspaceId } },
      });
      if (!existing) throw new BindingNotFoundError(id);
      throw new BindingActiveOperationError(id);
    }
    throw err;
  }
}

export async function acquireLease(
  id: string,
  workspaceId: string,
  operationKind: string,
  intent: Prisma.InputJsonValue,
): Promise<ProviderResourceBinding> {
  const existing = await getBinding(id, workspaceId);
  if (existing.operationState !== "IDLE") {
    throw new BindingActiveOperationError(id);
  }

  const operationId = randomUUID();
  const now = new Date();
  try {
    return await db.providerResourceBinding.update({
      where: {
        id_workspaceId: { id, workspaceId },
        version: existing.version,
        operationState: "IDLE",
      },
      data: {
        operationState: "RUNNING",
        operationId,
        operationKind,
        operationIntent: intent,
        operationStartedAt: now,
        operationLeaseExpiresAt: new Date(now.getTime() + LEASE_DURATION_MS),
        version: { increment: 1 },
      },
    });
  } catch (err) {
    if (isPrismaNotFoundError(err)) throw new BindingLeaseConflictError(id);
    throw err;
  }
}

export async function completeLease(
  id: string,
  workspaceId: string,
  operationId: string,
): Promise<ProviderResourceBinding> {
  const existing = await getBinding(id, workspaceId);
  if (existing.operationState !== "RUNNING" || existing.operationId !== operationId) {
    throw new BindingLeaseConflictError(id);
  }

  try {
    return await db.providerResourceBinding.update({
      where: {
        id_workspaceId: { id, workspaceId },
        operationId,
        version: existing.version,
      },
      data: {
        operationState: "IDLE",
        operationId: null,
        operationKind: null,
        operationIntent: Prisma.JsonNull,
        operationStartedAt: null,
        operationLeaseExpiresAt: null,
        lastReconciledAt: new Date(),
        version: { increment: 1 },
      },
    });
  } catch (err) {
    if (isPrismaNotFoundError(err)) throw new BindingLeaseConflictError(id);
    throw err;
  }
}

export async function failLease(
  id: string,
  workspaceId: string,
  operationId: string,
): Promise<ProviderResourceBinding> {
  const existing = await getBinding(id, workspaceId);
  if (existing.operationState !== "RUNNING" || existing.operationId !== operationId) {
    throw new BindingLeaseConflictError(id);
  }

  try {
    return await db.providerResourceBinding.update({
      where: {
        id_workspaceId: { id, workspaceId },
        operationId,
        version: existing.version,
      },
      data: {
        operationState: "RECONCILE_REQUIRED",
        version: { increment: 1 },
      },
    });
  } catch (err) {
    if (isPrismaNotFoundError(err)) throw new BindingLeaseConflictError(id);
    throw err;
  }
}
