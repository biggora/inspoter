import crypto from "node:crypto";
import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { getServerProvidersForWorkspace } from "@/lib/providers/servers";
import type { ParsedMetricsPayload, ClassifiedAddress } from "@/lib/validation/server-metrics";

// Bug-fix notes (code review, server-metrics slice):
// - updateAddressObservations only ever established a claim on brand-new
//   address rows; an address that reappeared on an existing (previously
//   retired/declaimed) row never got its claim back. Fixed below by running
//   the same eligibility/conflict check for existing rows too.
// - unboundEnrollment's transaction could lose a genuine concurrent-claim
//   race (two enrollments claiming the same reported IPv4 at once) to a raw
//   Prisma P2002, which isn't one of our ServerMetricsError codes and would
//   surface as an unhandled 500. Now mapped to ADDRESS_CONFLICT.

function isPrismaUniqueConstraintError(
  error: unknown,
): error is Prisma.PrismaClientKnownRequestError {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

const TOKEN_BYTES = 32;
const TOKEN_PREFIX_LEN = 12;
const UNBOUND_EXPIRY_MS = 15 * 60 * 1000;
const DISCOVERY_DEADLINE_MS = 45_000;

export interface TokenContext {
  tokenId: string;
  workspaceId: string;
  state: "UNBOUND" | "BOUND";
  localServerId: string | null;
}

export interface IngestionResult {
  status: number;
  code: string;
  tokenState: "BOUND";
  localServerId: string;
}

export class ServerMetricsError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "ServerMetricsError";
    this.code = code;
  }
}

interface ProviderCandidate {
  credentialId: string;
  remoteId: string;
  name: string;
  globalIpv4s: string[];
}

function generateToken(): {
  secret: string;
  tokenHash: string;
  tokenPrefix: string;
} {
  const secret = crypto.randomBytes(TOKEN_BYTES).toString("hex");
  return {
    secret,
    tokenHash: crypto.createHash("sha256").update(secret).digest("hex"),
    tokenPrefix: secret.slice(0, TOKEN_PREFIX_LEN),
  };
}

export async function generateEnrollmentToken(
  workspaceId: string,
  name: string,
  localServerId?: string,
): Promise<{ id: string; token: string; prefix: string }> {
  const { secret, tokenHash, tokenPrefix } = generateToken();

  if (localServerId) {
    const server = await db.localServer.findFirst({
      where: { id: localServerId, workspaceId },
    });
    if (!server) {
      throw new ServerMetricsError(
        "SERVER_NOT_FOUND",
        `Local server not found: ${localServerId}`,
      );
    }
  }

  // Bug fix: a caller-supplied localServerId (pre-bound replacement token,
  // e.g. re-provisioning a lost agent for an already-known server) was
  // validated above but never actually persisted -- every token was
  // created UNBOUND regardless, forcing a full re-enrollment match instead
  // of binding straight to the known server.
  try {
    const created = localServerId
      ? await db.serverAgentToken.create({
          data: {
            workspaceId,
            name,
            tokenHash,
            tokenPrefix,
            state: "BOUND",
            localServerId,
            boundAt: new Date(),
            expiresAt: null,
          },
        })
      : await db.serverAgentToken.create({
          data: {
            workspaceId,
            name,
            tokenHash,
            tokenPrefix,
            state: "UNBOUND",
            expiresAt: new Date(Date.now() + UNBOUND_EXPIRY_MS),
          },
        });

    return { id: created.id, token: secret, prefix: tokenPrefix };
  } catch (error) {
    // Partial unique index server_agent_token_one_active_bound_per_server
    // allows at most one active BOUND token per localServerId.
    if (localServerId && isPrismaUniqueConstraintError(error)) {
      throw new ServerMetricsError(
        "TOKEN_ALREADY_BOUND",
        `Local server already has an active agent token: ${localServerId}`,
      );
    }
    throw error;
  }
}

export async function authenticateAgentToken(
  bearerSecret: string,
): Promise<TokenContext | null> {
  const tokenHash = crypto
    .createHash("sha256")
    .update(bearerSecret)
    .digest("hex");

  const token = await db.serverAgentToken.findUnique({
    where: { tokenHash },
  });
  if (!token) return null;
  if (token.revokedAt) return null;
  if (token.state === "UNBOUND" && token.expiresAt && token.expiresAt < new Date()) {
    return null;
  }

  await db.serverAgentToken.update({
    where: { id: token.id },
    data: { lastUsedAt: new Date() },
  });

  return {
    tokenId: token.id,
    workspaceId: token.workspaceId,
    state: token.state as "UNBOUND" | "BOUND",
    localServerId: token.localServerId,
  };
}

export async function listAgentTokens(
  workspaceId: string,
): Promise<AgentTokenSummary[]> {
  const tokens = await db.serverAgentToken.findMany({
    where: { workspaceId },
    orderBy: { createdAt: "desc" },
    include: {
      localServer: { select: { id: true, displayName: true, hostname: true } },
    },
  });

  return tokens.map((t) => ({
    id: t.id,
    name: t.name,
    tokenPrefix: t.tokenPrefix,
    state: t.state,
    localServerId: t.localServerId,
    serverName: t.localServer?.displayName ?? t.localServer?.hostname ?? null,
    createdAt: t.createdAt,
    boundAt: t.boundAt,
    lastUsedAt: t.lastUsedAt,
    revokedAt: t.revokedAt,
    expiresAt: t.expiresAt,
  }));
}

export interface AgentTokenSummary {
  id: string;
  name: string;
  tokenPrefix: string;
  state: string;
  localServerId: string | null;
  serverName: string | null;
  createdAt: Date;
  boundAt: Date | null;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
  expiresAt: Date | null;
}

export async function revokeAgentToken(
  id: string,
  workspaceId: string,
): Promise<void> {
  const token = await db.serverAgentToken.findFirst({
    where: { id, workspaceId },
  });
  if (!token) {
    throw new ServerMetricsError("TOKEN_NOT_FOUND", `Token not found: ${id}`);
  }
  if (token.revokedAt) return;

  await db.$transaction(async (tx) => {
    await tx.serverAgentToken.update({
      where: { id },
      data: { state: "REVOKED", revokedAt: new Date() },
    });

    if (token.state === "BOUND" && token.localServerId) {
      const otherBound = await tx.serverAgentToken.findFirst({
        where: {
          localServerId: token.localServerId,
          workspaceId,
          state: "BOUND",
          revokedAt: null,
          id: { not: id },
        },
      });

      if (!otherBound) {
        const server = await tx.localServer.findUnique({
          where: { id: token.localServerId },
        });
        if (server?.origin === "AGENT") {
          await tx.localServerAddress.updateMany({
            where: {
              localServerId: token.localServerId,
              workspaceId,
              isEnrollmentClaim: true,
              isCurrent: true,
            },
            data: {
              isEnrollmentClaim: false,
              matchKey: null,
              retiredAt: new Date(),
              isCurrent: false,
            },
          });
        }
      }
    }
  });
}

export async function rotateAgentToken(
  id: string,
  workspaceId: string,
): Promise<{ id: string; token: string; prefix: string }> {
  const existing = await db.serverAgentToken.findFirst({
    where: { id, workspaceId },
  });
  if (!existing) {
    throw new ServerMetricsError("TOKEN_NOT_FOUND", `Token not found: ${id}`);
  }
  if (existing.revokedAt) {
    throw new ServerMetricsError(
      "TOKEN_REVOKED",
      "Cannot rotate a revoked token",
    );
  }

  const { secret, tokenHash, tokenPrefix } = generateToken();

  const result = await db.$transaction(async (tx) => {
    await tx.serverAgentToken.update({
      where: { id },
      data: { state: "REVOKED", revokedAt: new Date() },
    });

    const newToken = await tx.serverAgentToken.create({
      data: {
        workspaceId,
        name: existing.name,
        tokenHash,
        tokenPrefix,
        state: existing.state === "BOUND" ? "BOUND" : "UNBOUND",
        localServerId: existing.localServerId,
        boundAt: existing.state === "BOUND" ? new Date() : null,
        expiresAt:
          existing.state === "BOUND"
            ? null
            : new Date(Date.now() + UNBOUND_EXPIRY_MS),
      },
    });

    return newToken;
  });

  return { id: result.id, token: secret, prefix: tokenPrefix };
}

async function discoverProviderServers(
  workspaceId: string,
): Promise<ProviderCandidate[]> {
  const providers = await getServerProvidersForWorkspace(workspaceId);
  if (providers.length === 0) return [];

  const deadline = AbortSignal.timeout(DISCOVERY_DEADLINE_MS);
  const candidates: ProviderCandidate[] = [];

  for (const provider of providers) {
    const result = provider.listServersWithDeadline
      ? await provider.listServersWithDeadline(deadline)
      : await provider.listServers();

    if (!result.ok) {
      throw new ServerMetricsError(
        "PROVIDER_INVENTORY_UNAVAILABLE",
        "Could not safely inspect configured providers",
      );
    }

    for (const server of result.data) {
      const globalIpv4s: string[] = [];
      if (server.ip) {
        globalIpv4s.push(server.ip);
      }
      candidates.push({
        credentialId: provider.id,
        remoteId: server.id,
        name: server.name,
        globalIpv4s,
      });
    }
  }

  return candidates;
}

function selectCandidate(
  reportedGlobalIpv4s: string[],
  providerCandidates: ProviderCandidate[],
): { kind: "provider"; candidate: ProviderCandidate } | { kind: "agent_only" } | { kind: "ambiguous" } {
  if (reportedGlobalIpv4s.length === 0) {
    return { kind: "agent_only" };
  }

  const reported = new Set(reportedGlobalIpv4s);
  const matched = providerCandidates.filter((c) =>
    c.globalIpv4s.some((ip) => reported.has(ip)),
  );

  if (matched.length === 1) {
    return { kind: "provider", candidate: matched[0] };
  }
  if (matched.length === 0) {
    return { kind: "agent_only" };
  }
  return { kind: "ambiguous" };
}

export async function processMetricsIngestion(
  ctx: TokenContext,
  payload: ParsedMetricsPayload,
): Promise<IngestionResult> {
  if (ctx.state === "BOUND" && ctx.localServerId) {
    return boundIngestion(ctx, payload);
  }

  return unboundEnrollment(ctx, payload);
}

async function boundIngestion(
  ctx: TokenContext,
  payload: ParsedMetricsPayload,
): Promise<IngestionResult> {
  const serverId = ctx.localServerId!;

  const updated = await db.$transaction(async (tx) => {
    const existing = await tx.serverMetricSnapshot.findUnique({
      where: { localServerId: serverId },
    });

    if (existing && payload.capturedAt <= existing.capturedAt) {
      return false;
    }

    const server = await tx.localServer.findUnique({
      where: { id: serverId },
    });
    const isAgentOnly = server?.origin === "AGENT";

    await updateAddressObservations(tx, serverId, ctx.workspaceId, payload.addresses, isAgentOnly);

    await tx.serverMetricSnapshot.upsert({
      where: { localServerId: serverId },
      create: snapshotData(serverId, ctx.workspaceId, payload),
      update: snapshotUpdateData(payload),
    });

    await tx.localServer.update({
      where: { id: serverId },
      data: { hostname: payload.hostname },
    });

    return true;
  });

  return {
    status: 200,
    code: updated ? "SNAPSHOT_UPDATED" : "SNAPSHOT_IGNORED_OUT_OF_ORDER",
    tokenState: "BOUND",
    localServerId: serverId,
  };
}

async function unboundEnrollment(
  ctx: TokenContext,
  payload: ParsedMetricsPayload,
): Promise<IngestionResult> {
  const reportedGlobalIpv4s = payload.addresses
    .filter((a) => a.family === "IPV4" && a.scope === "GLOBAL" && a.matchKey)
    .map((a) => a.matchKey!);

  let candidates: ProviderCandidate[];
  try {
    candidates = await discoverProviderServers(ctx.workspaceId);
  } catch (error) {
    if (error instanceof ServerMetricsError) throw error;
    throw new ServerMetricsError(
      "PROVIDER_INVENTORY_UNAVAILABLE",
      "Could not safely inspect configured providers",
    );
  }

  const selection = selectCandidate(reportedGlobalIpv4s, candidates);
  if (selection.kind === "ambiguous") {
    throw new ServerMetricsError(
      "SERVER_MATCH_AMBIGUOUS",
      "More than one eligible server matched the reported IPs",
    );
  }

  try {
    return await db.$transaction(async (tx) => {
      const token = await tx.serverAgentToken.findUnique({
        where: { id: ctx.tokenId },
      });
      if (!token || token.state !== "UNBOUND" || token.revokedAt) {
        throw new ServerMetricsError(
          "TOKEN_ALREADY_BOUND",
          "Token is no longer available for enrollment",
        );
      }
      if (token.expiresAt && token.expiresAt < new Date()) {
        throw new ServerMetricsError(
          "UNAUTHORIZED",
          "Token has expired",
        );
      }

      let serverId: string;

      if (selection.kind === "provider") {
        const c = selection.candidate;
        const existing = await tx.localServer.findUnique({
          where: {
            workspaceId_providerCredentialId_providerRemoteId: {
              workspaceId: ctx.workspaceId,
              providerCredentialId: c.credentialId,
              providerRemoteId: c.remoteId,
            },
          },
        });

        if (existing) {
          serverId = existing.id;
          await tx.localServer.update({
            where: { id: serverId },
            data: {
              hostname: payload.hostname,
              providerLastSeenAt: new Date(),
            },
          });
        } else {
          const created = await tx.localServer.create({
            data: {
              workspaceId: ctx.workspaceId,
              origin: "PROVIDER",
              displayName: c.name || payload.hostname,
              hostname: payload.hostname,
              providerCredentialId: c.credentialId,
              providerCredentialWorkspaceId: ctx.workspaceId,
              providerRemoteId: c.remoteId,
              providerLastSeenAt: new Date(),
            },
          });
          serverId = created.id;
        }
      } else {
        for (const ipv4 of reportedGlobalIpv4s) {
          const conflict = await tx.localServerAddress.findFirst({
            where: {
              workspaceId: ctx.workspaceId,
              matchKey: ipv4,
              isCurrent: true,
              isEnrollmentClaim: true,
            },
          });
          if (conflict) {
            throw new ServerMetricsError(
              "ADDRESS_CONFLICT",
              `Address ${ipv4} is already claimed by another server`,
            );
          }
        }

        const created = await tx.localServer.create({
          data: {
            workspaceId: ctx.workspaceId,
            origin: "AGENT",
            displayName: payload.hostname,
            hostname: payload.hostname,
          },
        });
        serverId = created.id;
      }

      await createAddressObservations(
        tx,
        serverId,
        ctx.workspaceId,
        payload.addresses,
        selection.kind === "agent_only",
      );

      await tx.serverAgentToken.update({
        where: { id: ctx.tokenId },
        data: {
          state: "BOUND",
          localServerId: serverId,
          boundAt: new Date(),
          expiresAt: null,
        },
      });

      await tx.serverMetricSnapshot.create({
        data: snapshotData(serverId, ctx.workspaceId, payload),
      });

      return {
        status: 201,
        code: "AGENT_ENROLLED",
        tokenState: "BOUND" as const,
        localServerId: serverId,
      };
    });
  } catch (error) {
    if (error instanceof ServerMetricsError) throw error;
    if (isPrismaUniqueConstraintError(error)) {
      // A concurrent enrollment claimed the same reported global IPv4
      // (local_server_address_one_current_ipv4_claim) between our
      // pre-check and this transaction's insert/update.
      throw new ServerMetricsError(
        "ADDRESS_CONFLICT",
        "Reported IPv4 address was claimed by a concurrent enrollment",
      );
    }
    throw error;
  }
}

async function createAddressObservations(
  tx: Parameters<Parameters<typeof db.$transaction>[0]>[0],
  serverId: string,
  workspaceId: string,
  addresses: ClassifiedAddress[],
  isAgentOnly: boolean,
): Promise<void> {
  for (const addr of addresses) {
    const isClaimEligible =
      isAgentOnly &&
      addr.family === "IPV4" &&
      addr.scope === "GLOBAL" &&
      addr.matchKey !== null;

    await tx.localServerAddress.create({
      data: {
        workspaceId,
        localServerId: serverId,
        address: addr.address,
        family: addr.family,
        scope: addr.scope,
        source: "AGENT",
        matchKey: isClaimEligible ? addr.matchKey : null,
        isCurrent: true,
        isEnrollmentClaim: isClaimEligible,
      },
    });
  }
}

async function updateAddressObservations(
  tx: Parameters<Parameters<typeof db.$transaction>[0]>[0],
  serverId: string,
  workspaceId: string,
  addresses: ClassifiedAddress[],
  isAgentOnly: boolean,
): Promise<void> {
  const reportedSet = new Set(addresses.map((a) => a.address));

  await tx.localServerAddress.updateMany({
    where: {
      localServerId: serverId,
      workspaceId,
      source: "AGENT",
      isCurrent: true,
      address: { notIn: [...reportedSet] },
    },
    data: {
      isCurrent: false,
      retiredAt: new Date(),
      isEnrollmentClaim: false,
      matchKey: null,
    },
  });

  for (const addr of addresses) {
    const existing = await tx.localServerAddress.findFirst({
      where: {
        localServerId: serverId,
        workspaceId,
        address: addr.address,
        source: "AGENT",
      },
    });

    // Already holds a live claim on this exact address -- nothing to
    // (re)negotiate, just refresh presence.
    if (existing?.isEnrollmentClaim) {
      await tx.localServerAddress.update({
        where: { id: existing.id },
        data: { isCurrent: true, retiredAt: null, lastSeenAt: new Date() },
      });
      continue;
    }

    const isClaimEligible =
      isAgentOnly &&
      addr.family === "IPV4" &&
      addr.scope === "GLOBAL" &&
      addr.matchKey !== null;

    let hasConflict = false;
    if (isClaimEligible) {
      const conflict = await tx.localServerAddress.findFirst({
        where: {
          workspaceId,
          matchKey: addr.matchKey,
          isCurrent: true,
          isEnrollmentClaim: true,
          localServerId: { not: serverId },
        },
      });
      hasConflict = !!conflict;
    }

    if (existing) {
      // Row exists but isn't currently a claim (never was, or was released
      // on a prior push) -- re-run eligibility so a reappearing global IPv4
      // on an agent-only server gets its claim back instead of staying
      // claim-less forever.
      await tx.localServerAddress.update({
        where: { id: existing.id },
        data: {
          isCurrent: true,
          retiredAt: null,
          lastSeenAt: new Date(),
          isEnrollmentClaim: isClaimEligible && !hasConflict,
          matchKey: isClaimEligible && !hasConflict ? addr.matchKey : null,
          claimConflictAt: isClaimEligible && hasConflict
            ? (existing.claimConflictAt ?? new Date())
            : null,
        },
      });
      continue;
    }

    await tx.localServerAddress.create({
      data: {
        workspaceId,
        localServerId: serverId,
        address: addr.address,
        family: addr.family,
        scope: addr.scope,
        source: "AGENT",
        matchKey: isClaimEligible && !hasConflict ? addr.matchKey : null,
        isCurrent: true,
        isEnrollmentClaim: isClaimEligible && !hasConflict,
        claimConflictAt: isClaimEligible && hasConflict ? new Date() : null,
      },
    });
  }
}

function snapshotData(
  localServerId: string,
  workspaceId: string,
  payload: ParsedMetricsPayload,
) {
  return {
    localServerId,
    workspaceId,
    schemaVersion: payload.schemaVersion,
    agentVersion: payload.agentVersion,
    hostname: payload.hostname,
    capturedAt: payload.capturedAt,
    receivedAt: new Date(),
    cpuUsagePercent: payload.cpu.usagePercent,
    load1: payload.cpu.load1,
    load5: payload.cpu.load5,
    load15: payload.cpu.load15,
    memoryTotalBytes: BigInt(payload.memory.totalBytes),
    memoryAvailableBytes: BigInt(payload.memory.availableBytes),
    swapTotalBytes: BigInt(payload.memory.swapTotalBytes),
    swapFreeBytes: BigInt(payload.memory.swapFreeBytes),
    filesystemTotalBytes: BigInt(payload.filesystem.totalBytes),
    filesystemAvailableBytes: BigInt(payload.filesystem.availableBytes),
    uptimeSeconds: BigInt(payload.uptimeSeconds),
  };
}

function snapshotUpdateData(payload: ParsedMetricsPayload) {
  return {
    schemaVersion: payload.schemaVersion,
    agentVersion: payload.agentVersion,
    hostname: payload.hostname,
    capturedAt: payload.capturedAt,
    receivedAt: new Date(),
    cpuUsagePercent: payload.cpu.usagePercent,
    load1: payload.cpu.load1,
    load5: payload.cpu.load5,
    load15: payload.cpu.load15,
    memoryTotalBytes: BigInt(payload.memory.totalBytes),
    memoryAvailableBytes: BigInt(payload.memory.availableBytes),
    swapTotalBytes: BigInt(payload.memory.swapTotalBytes),
    swapFreeBytes: BigInt(payload.memory.swapFreeBytes),
    filesystemTotalBytes: BigInt(payload.filesystem.totalBytes),
    filesystemAvailableBytes: BigInt(payload.filesystem.availableBytes),
    uptimeSeconds: BigInt(payload.uptimeSeconds),
  };
}
