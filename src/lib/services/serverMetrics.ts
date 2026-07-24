import crypto from "node:crypto";
import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { getServerProvidersForWorkspace } from "@/lib/providers/servers";
import type {
  ParsedMetricsPayload,
  ClassifiedAddress,
} from "@/lib/validation/server-metrics";

// Universal API tokens (WebhookToken, tokenId not bound to any one server):
// each ingest resolves server identity from the reported addresses instead
// of from the token. Bug-fix note carried over from the old agent-token
// design: updateAddressObservations must re-run claim eligibility for rows
// that already exist but aren't currently a claim (e.g. a global IPv4 that
// reappeared after being retired) -- not just for brand-new rows -- or a
// server that legitimately re-acquires an address never gets its claim
// back.

function isPrismaUniqueConstraintError(
  error: unknown,
): error is Prisma.PrismaClientKnownRequestError {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

const DISCOVERY_DEADLINE_MS = 45_000;

export interface MetricsTokenContext {
  tokenId: string;
  workspaceId: string;
}

export interface IngestionResult {
  status: number;
  code: string;
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

// Universal metrics tokens are WebhookToken rows with channelId === null
// (channel webhooks are a distinct, non-universal token kind).
export async function authenticateMetricsToken(
  bearerSecret: string,
): Promise<MetricsTokenContext | null> {
  const tokenHash = crypto
    .createHash("sha256")
    .update(bearerSecret)
    .digest("hex");

  const token = await db.webhookToken.findUnique({ where: { tokenHash } });
  if (!token) return null;
  if (token.revokedAt) return null;
  if (token.channelId !== null) return null;

  db.webhookToken
    .update({ where: { id: token.id }, data: { lastUsedAt: new Date() } })
    .catch(() => {});

  return { tokenId: token.id, workspaceId: token.workspaceId };
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
):
  | { kind: "provider"; candidate: ProviderCandidate }
  | { kind: "agent_only" }
  | { kind: "ambiguous" } {
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
  ctx: MetricsTokenContext,
  payload: ParsedMetricsPayload,
): Promise<IngestionResult> {
  const reportedGlobalIpv4s = payload.addresses
    .filter((a) => a.family === "IPV4" && a.scope === "GLOBAL" && a.matchKey)
    .map((a) => a.matchKey!);

  // Cheap path: an already-enrolled server claims one of the reported
  // global IPv4s -- steady-state ingestion, no provider discovery needed.
  const claims = await db.localServerAddress.findMany({
    where: {
      workspaceId: ctx.workspaceId,
      matchKey: { in: reportedGlobalIpv4s },
      isCurrent: true,
      isEnrollmentClaim: true,
    },
    select: { localServerId: true },
  });
  const claimedServerIds = new Set(claims.map((c) => c.localServerId));
  if (claimedServerIds.size > 1) {
    throw new ServerMetricsError(
      "SERVER_MATCH_AMBIGUOUS",
      "More than one eligible server matched the reported IPs",
    );
  }

  try {
    if (claimedServerIds.size === 1) {
      const [serverId] = claimedServerIds;
      return await steadyStateIngestion(serverId, ctx.workspaceId, payload);
    }

    return await matchOrEnroll(ctx, payload, reportedGlobalIpv4s);
  } catch (error) {
    if (error instanceof ServerMetricsError) throw error;
    if (isPrismaUniqueConstraintError(error)) {
      // A concurrent request claimed the same reported global IPv4
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

async function steadyStateIngestion(
  serverId: string,
  workspaceId: string,
  payload: ParsedMetricsPayload,
): Promise<IngestionResult> {
  const updated = await db.$transaction(async (tx) => {
    const existing = await tx.serverMetricSnapshot.findUnique({
      where: { localServerId: serverId },
    });

    if (existing && payload.capturedAt <= existing.capturedAt) {
      return false;
    }

    await updateAddressObservations(
      tx,
      serverId,
      workspaceId,
      payload.addresses,
    );

    await tx.serverMetricSnapshot.upsert({
      where: { localServerId: serverId },
      create: snapshotData(serverId, workspaceId, payload),
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
    localServerId: serverId,
  };
}

async function matchOrEnroll(
  ctx: MetricsTokenContext,
  payload: ParsedMetricsPayload,
  reportedGlobalIpv4s: string[],
): Promise<IngestionResult> {
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

  if (selection.kind === "provider") {
    return enrollProviderServer(ctx.workspaceId, selection.candidate, payload);
  }

  return enrollAgentOnlyServer(ctx.workspaceId, payload, reportedGlobalIpv4s);
}

async function enrollProviderServer(
  workspaceId: string,
  candidate: ProviderCandidate,
  payload: ParsedMetricsPayload,
): Promise<IngestionResult> {
  return db.$transaction(async (tx) => {
    const existing = await tx.localServer.findUnique({
      where: {
        workspaceId_providerCredentialId_providerRemoteId: {
          workspaceId,
          providerCredentialId: candidate.credentialId,
          providerRemoteId: candidate.remoteId,
        },
      },
    });

    let serverId: string;
    const created = !existing;

    if (existing) {
      serverId = existing.id;
      await tx.localServer.update({
        where: { id: serverId },
        data: { hostname: payload.hostname, providerLastSeenAt: new Date() },
      });
    } else {
      const row = await tx.localServer.create({
        data: {
          workspaceId,
          origin: "PROVIDER",
          displayName: candidate.name || payload.hostname,
          hostname: payload.hostname,
          providerCredentialId: candidate.credentialId,
          providerCredentialWorkspaceId: workspaceId,
          providerRemoteId: candidate.remoteId,
          providerLastSeenAt: new Date(),
        },
      });
      serverId = row.id;
    }

    // Address rows for this server may already exist (pre-existing
    // PROVIDER-sourced rows, or AGENT-sourced rows from a prior ingest) --
    // use the update-style upsert so the [workspaceId, localServerId,
    // address, source] unique constraint is never hit.
    await updateAddressObservations(tx, serverId, workspaceId, payload.addresses);

    await tx.serverMetricSnapshot.upsert({
      where: { localServerId: serverId },
      create: snapshotData(serverId, workspaceId, payload),
      update: snapshotUpdateData(payload),
    });

    return {
      status: created ? 201 : 200,
      code: created ? "AGENT_ENROLLED" : "SNAPSHOT_UPDATED",
      localServerId: serverId,
    };
  });
}

async function enrollAgentOnlyServer(
  workspaceId: string,
  payload: ParsedMetricsPayload,
  reportedGlobalIpv4s: string[],
): Promise<IngestionResult> {
  if (reportedGlobalIpv4s.length === 0) {
    // NAT-only host reporting no global IPv4 -- reuse a prior AGENT-origin
    // enrollment for the same hostname instead of creating a duplicate.
    const reusable = await db.localServer.findFirst({
      where: { workspaceId, origin: "AGENT", hostname: payload.hostname },
    });
    if (reusable) {
      return steadyStateIngestion(reusable.id, workspaceId, payload);
    }
  }

  return db.$transaction(async (tx) => {
    for (const ipv4 of reportedGlobalIpv4s) {
      const conflict = await tx.localServerAddress.findFirst({
        where: {
          workspaceId,
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
        workspaceId,
        origin: "AGENT",
        displayName: payload.hostname,
        hostname: payload.hostname,
      },
    });

    await createAddressObservations(
      tx,
      created.id,
      workspaceId,
      payload.addresses,
    );

    await tx.serverMetricSnapshot.create({
      data: snapshotData(created.id, workspaceId, payload),
    });

    return {
      status: 201,
      code: "AGENT_ENROLLED",
      localServerId: created.id,
    };
  });
}

async function createAddressObservations(
  tx: Parameters<Parameters<typeof db.$transaction>[0]>[0],
  serverId: string,
  workspaceId: string,
  addresses: ClassifiedAddress[],
): Promise<void> {
  for (const addr of addresses) {
    const isClaimEligible =
      addr.family === "IPV4" && addr.scope === "GLOBAL" && addr.matchKey !== null;

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
      addr.family === "IPV4" && addr.scope === "GLOBAL" && addr.matchKey !== null;

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
      // gets its claim back instead of staying claim-less forever.
      await tx.localServerAddress.update({
        where: { id: existing.id },
        data: {
          isCurrent: true,
          retiredAt: null,
          lastSeenAt: new Date(),
          isEnrollmentClaim: isClaimEligible && !hasConflict,
          matchKey: isClaimEligible && !hasConflict ? addr.matchKey : null,
          claimConflictAt:
            isClaimEligible && hasConflict
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
