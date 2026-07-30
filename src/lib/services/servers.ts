import { db } from "@/lib/db";
import type { ServerMetricSnapshot } from "@/generated/prisma/client";
import { getServerProvidersForWorkspace } from "@/lib/providers/servers";
import type { Server, ServerProvider } from "@/lib/providers/servers/types";
import type { ProviderResult } from "@/lib/providers/result";
import { logError } from "@/lib/services/logs";
import * as snapshots from "@/lib/services/provider-snapshots";
import { recordSyncOutcomes, type SyncOutcome } from "./provider-health";

// Servers service — aggregates all hosting providers with per-provider
// error isolation: a failing/unreachable provider never takes down the
// whole listing (mirrors domains.ts). Slice 2 additionally reconciles
// provider inventory into LocalServer rows and composes each row with its
// VPS Metrics Agent state (ADR: provider + agent-only servers share one
// listing surface).
//
// The provider half of that composition is cached in ProviderSnapshot
// (ADR-004 amendment) and refreshed by refreshServerSnapshots(); the local
// half — LocalServer rows and their metric snapshots — is read live on every
// request, since it is already database-only and always current.

const KIND = "SERVERS" as const;

/** One credential's cached inventory, as stored in ProviderSnapshot.payload. */
export interface ServersByProvider {
  providerId: string;
  providerType: string;
  label: string;
  servers: Server[];
  error: string | null;
}

type PrismaTransactionClient = Parameters<
  Parameters<typeof db.$transaction>[0]
>[0];

const STALE_THRESHOLD_MS = 180_000;

type MetricsState = "not_configured" | "live" | "stale";

export interface ServerMetricsDto {
  state: MetricsState;
  receivedAt: string | null;
  cpuUsagePercent: number | null;
  load1: number | null;
  load5: number | null;
  load15: number | null;
  memoryTotalBytes: string | null;
  memoryAvailableBytes: string | null;
  swapTotalBytes: string | null;
  swapFreeBytes: string | null;
  filesystemTotalBytes: string | null;
  filesystemAvailableBytes: string | null;
  uptimeSeconds: string | null;
}

export interface ProviderServerDto {
  localServerId: string;
  origin: "provider";
  providerCredentialId: string;
  providerId: string;
  remoteServerId: string;
  providerAvailability: "present" | "unavailable" | "missing";
  powerActionsAvailable: boolean;
  metrics: ServerMetricsDto;
  name: string;
  type: string;
  status: string;
  ip: string;
  cpu: string;
  ram: string;
  disk: string;
  os: string;
  location: string;
}

export interface AgentOnlyServerDto {
  localServerId: string;
  origin: "agent";
  providerCredentialId: null;
  providerId: null;
  remoteServerId: null;
  providerAvailability: "not_applicable";
  powerActionsAvailable: false;
  metrics: ServerMetricsDto;
  name: string;
  hostname: string | null;
}

export type ComposedServerDto = ProviderServerDto | AgentOnlyServerDto;

export interface ComposedServersResponse {
  servers: ComposedServerDto[];
  providerErrors: { providerId: string; label: string; error: string }[];
}

function computeMetricsState(
  snapshot: { receivedAt: Date } | null,
): MetricsState {
  if (!snapshot) return "not_configured";
  const ageMs = Date.now() - snapshot.receivedAt.getTime();
  return ageMs < STALE_THRESHOLD_MS ? "live" : "stale";
}

function serializeSnapshot(
  snapshot: ServerMetricSnapshot | null,
  state: MetricsState,
): ServerMetricsDto {
  if (!snapshot) {
    return {
      state,
      receivedAt: null,
      cpuUsagePercent: null,
      load1: null,
      load5: null,
      load15: null,
      memoryTotalBytes: null,
      memoryAvailableBytes: null,
      swapTotalBytes: null,
      swapFreeBytes: null,
      filesystemTotalBytes: null,
      filesystemAvailableBytes: null,
      uptimeSeconds: null,
    };
  }
  return {
    state,
    receivedAt: snapshot.receivedAt.toISOString(),
    cpuUsagePercent: snapshot.cpuUsagePercent,
    load1: snapshot.load1,
    load5: snapshot.load5,
    load15: snapshot.load15,
    memoryTotalBytes: snapshot.memoryTotalBytes.toString(),
    memoryAvailableBytes: snapshot.memoryAvailableBytes.toString(),
    swapTotalBytes: snapshot.swapTotalBytes.toString(),
    swapFreeBytes: snapshot.swapFreeBytes.toString(),
    filesystemTotalBytes: snapshot.filesystemTotalBytes.toString(),
    filesystemAvailableBytes: snapshot.filesystemAvailableBytes.toString(),
    uptimeSeconds: snapshot.uptimeSeconds.toString(),
  };
}

// Reconciles one provider's live inventory into LocalServer rows: creates
// rows for newly-seen remote servers, refreshes providerLastSeenAt (and
// clears any prior providerMissingAt) for ones still present, then marks
// every previously-known row for this credential that wasn't in this
// listing as missing.
async function reconcileProviderServers(
  tx: PrismaTransactionClient,
  workspaceId: string,
  credentialId: string,
  providerServers: Server[],
): Promise<void> {
  const now = new Date();
  const seenRemoteIds: string[] = [];

  for (const server of providerServers) {
    seenRemoteIds.push(server.id);
    await tx.localServer.upsert({
      where: {
        workspaceId_providerCredentialId_providerRemoteId: {
          workspaceId,
          providerCredentialId: credentialId,
          providerRemoteId: server.id,
        },
      },
      create: {
        workspaceId,
        origin: "PROVIDER",
        displayName: server.name,
        providerCredentialId: credentialId,
        providerCredentialWorkspaceId: workspaceId,
        providerRemoteId: server.id,
        providerLastSeenAt: now,
      },
      update: {
        providerLastSeenAt: now,
        providerMissingAt: null,
      },
    });
  }

  await tx.localServer.updateMany({
    where: {
      workspaceId,
      providerCredentialId: credentialId,
      providerRemoteId: { notIn: seenRemoteIds },
      providerMissingAt: null,
    },
    data: { providerMissingAt: now },
  });
}

// One machine can be reachable through more than one credential — two tokens
// may legitimately see the same VM — and LocalServer's unique key is scoped to
// a credential, so each credential owns its own row for that machine. The
// listing must still show one entry per machine: two entries would mean two
// power buttons for one server, and stopping it through one would leave the
// other reporting the stale status until the next refresh.
//
// Identity is the provider-reported primary IPv4. Only when the address is
// unknown — the provider is unreachable, or no longer reports the server — does
// it fall back to provider type plus remote id; in that window neither row
// carries any data to tell the two apart anyway.
function machineIdentity(dto: ProviderServerDto, providerType: string): string {
  return dto.ip
    ? `ip:${dto.ip}`
    : `remote:${providerType}:${dto.remoteServerId}`;
}

// Of several rows describing one machine, the one carrying the agent's snapshot
// wins, so collapsing them never hides live metrics; otherwise the first — and
// therefore oldest, since the query orders by createdAt — stays. Agent-only
// rows are left alone: an agent that matches a provider server is bound to that
// server's row upstream, in the metrics ingest claim logic.
function dedupeByMachine(
  dtos: ComposedServerDto[],
  providerTypeByCredentialId: Map<string, string>,
): ComposedServerDto[] {
  const kept: ComposedServerDto[] = [];
  const indexByIdentity = new Map<string, number>();

  for (const dto of dtos) {
    if (dto.origin !== "provider") {
      kept.push(dto);
      continue;
    }

    const identity = machineIdentity(
      dto,
      providerTypeByCredentialId.get(dto.providerCredentialId) ?? "",
    );
    const index = indexByIdentity.get(identity);

    if (index === undefined) {
      indexByIdentity.set(identity, kept.length);
      kept.push(dto);
      continue;
    }

    if (
      kept[index].metrics.state === "not_configured" &&
      dto.metrics.state !== "not_configured"
    ) {
      kept[index] = dto;
    }
  }

  return kept;
}

/**
 * Fans out to the server providers, reconciles their inventory into
 * LocalServer rows, and persists one snapshot per credential.
 *
 * Reconciliation lives here rather than on the read path on purpose: it
 * records what the provider *just* reported, so replaying it against an
 * unchanged cached listing on every page visit would only add writes.
 */
export async function refreshServerSnapshots(
  workspaceId: string,
  credentialIds?: string[],
): Promise<void> {
  const all = await getServerProvidersForWorkspace(workspaceId);
  const wanted = credentialIds ? new Set(credentialIds) : null;
  const providers = wanted
    ? all.filter((provider) => wanted.has(provider.id))
    : all;
  if (providers.length === 0) return;

  const settled = await Promise.allSettled(
    providers.map((provider) => provider.listServers()),
  );

  const groups: ServersByProvider[] = settled.map((result, index) => {
    const provider = providers[index];
    const base = {
      providerId: provider.id,
      providerType: provider.providerType,
      label: provider.label,
    };
    if (result.status === "rejected") {
      return { ...base, servers: [], error: String(result.reason) };
    }
    const providerResult = result.value;
    if (!providerResult.ok) {
      return {
        ...base,
        servers: [],
        error:
          providerResult.kind === "error"
            ? providerResult.message
            : `Operation not supported: ${providerResult.operation}`,
      };
    }
    return { ...base, servers: providerResult.data, error: null };
  });

  // Only a successful listing is authoritative about which machines exist —
  // reconciling an empty list from a failed call would mark every server of
  // that credential as missing.
  for (const group of groups) {
    if (group.error) continue;
    await db.$transaction((tx) =>
      reconcileProviderServers(
        tx,
        workspaceId,
        group.providerId,
        group.servers,
      ),
    );
  }

  await Promise.all(
    groups.map((group) =>
      snapshots.writeSnapshot(
        workspaceId,
        group.providerId,
        KIND,
        group,
        group.error,
      ),
    ),
  );

  const outcomes: SyncOutcome[] = groups.map((group) => ({
    credentialId: group.providerId,
    providerType: group.providerType,
    error: group.error,
  }));
  await recordSyncOutcomes(workspaceId, "Серверы", "listServers", outcomes);
}

export interface LocalServerMetricsDto {
  localServerId: string;
  name: string;
  hostname: string | null;
  metrics: ServerMetricsDto;
}

/**
 * Metrics of every known server, straight from the agent snapshots — no
 * provider call and no snapshot-cache refresh.
 *
 * The dashboard's server-metrics widget uses this instead of listServers():
 * that function composes provider inventory (and can trigger a provider fetch),
 * which is far too much work for a tile that re-reads its data every minute and
 * only shows CPU/RAM/disk. Provider-side fields (power state, IP, plan) are
 * deliberately absent here.
 */
export async function listLocalServerMetrics(
  workspaceId: string,
): Promise<LocalServerMetricsDto[]> {
  const rows = await db.localServer.findMany({
    where: { workspaceId },
    include: { metricSnapshot: true },
    orderBy: [{ displayName: "asc" }, { id: "asc" }],
  });
  return rows.map((row) => ({
    localServerId: row.id,
    name: row.displayName,
    hostname: row.hostname,
    metrics: serializeSnapshot(
      row.metricSnapshot,
      computeMetricsState(row.metricSnapshot),
    ),
  }));
}

export async function listServers(
  workspaceId: string,
): Promise<ComposedServersResponse> {
  const rows = await snapshots.readCachedListing(
    workspaceId,
    KIND,
    refreshServerSnapshots,
  );
  const groups = rows.map((row) => row.payload as ServersByProvider);

  const failedProviders: {
    providerId: string;
    label: string;
    error: string;
  }[] = [];
  const providerServerMap = new Map<string, Server>();

  for (const group of groups) {
    if (group.error) {
      failedProviders.push({
        providerId: group.providerId,
        label: group.label,
        error: group.error,
      });
      continue;
    }
    for (const server of group.servers) {
      providerServerMap.set(`${group.providerId}:${server.id}`, server);
    }
  }

  const failedProviderIds = new Set(failedProviders.map((f) => f.providerId));

  const localServers = await db.localServer.findMany({
    where: { workspaceId },
    include: { metricSnapshot: true },
    orderBy: { createdAt: "asc" },
  });

  const servers: ComposedServerDto[] = localServers.map((local) => {
    const metricsState = computeMetricsState(local.metricSnapshot);
    const metrics = serializeSnapshot(local.metricSnapshot, metricsState);

    if (local.origin === "AGENT") {
      const dto: AgentOnlyServerDto = {
        localServerId: local.id,
        origin: "agent",
        providerCredentialId: null,
        providerId: null,
        remoteServerId: null,
        providerAvailability: "not_applicable",
        powerActionsAvailable: false,
        metrics,
        name: local.displayName,
        hostname: local.hostname,
      };
      return dto;
    }

    const credentialId = local.providerCredentialId!;
    const remoteId = local.providerRemoteId!;

    let providerAvailability: "present" | "unavailable" | "missing";
    let providerServer: Server | undefined;

    if (failedProviderIds.has(credentialId)) {
      providerAvailability = "unavailable";
    } else {
      providerServer = providerServerMap.get(`${credentialId}:${remoteId}`);
      providerAvailability = providerServer ? "present" : "missing";
    }

    const dto: ProviderServerDto = {
      localServerId: local.id,
      origin: "provider",
      providerCredentialId: credentialId,
      providerId: credentialId,
      remoteServerId: remoteId,
      providerAvailability,
      powerActionsAvailable: providerAvailability === "present",
      metrics,
      name: providerServer?.name ?? local.displayName,
      type: providerServer?.type ?? "",
      status: providerServer?.status ?? "unknown",
      ip: providerServer?.ip ?? "",
      cpu: providerServer?.cpu ?? "",
      ram: providerServer?.ram ?? "",
      disk: providerServer?.disk ?? "",
      os: providerServer?.os ?? "",
      location: providerServer?.location ?? "",
    };
    return dto;
  });

  const providerTypeByCredentialId = new Map(
    groups.map((group) => [group.providerId, group.providerType]),
  );

  return {
    servers: dedupeByMachine(servers, providerTypeByCredentialId),
    providerErrors: failedProviders,
  };
}

export async function getComposedServer(
  workspaceId: string,
  providerId: string,
  remoteServerId: string,
): Promise<ComposedServerDto | null> {
  const local = await db.localServer.findUnique({
    where: {
      workspaceId_providerCredentialId_providerRemoteId: {
        workspaceId,
        providerCredentialId: providerId,
        providerRemoteId: remoteServerId,
      },
    },
    include: { metricSnapshot: true },
  });
  if (!local) return null;

  const provider = await findProvider(workspaceId, providerId);
  let providerServer: Server | undefined;
  let providerAvailability: "present" | "unavailable" | "missing";

  if (!provider) {
    providerAvailability = "unavailable";
  } else {
    const result = await provider.getServer(remoteServerId);
    if (result.ok) {
      providerServer = result.data;
      providerAvailability = "present";
    } else {
      logError(
        workspaceId,
        `provider:${provider.providerType.toLowerCase()}`,
        result.kind === "error"
          ? result.message
          : `Unsupported: ${result.operation}`,
        JSON.stringify({ operation: "getServer", remoteServerId }),
      );
      providerAvailability = "unavailable";
    }
  }

  const metricsState = computeMetricsState(local.metricSnapshot);
  const metrics = serializeSnapshot(local.metricSnapshot, metricsState);

  const dto: ProviderServerDto = {
    localServerId: local.id,
    origin: "provider",
    providerCredentialId: providerId,
    providerId,
    remoteServerId,
    providerAvailability,
    powerActionsAvailable: providerAvailability === "present",
    metrics,
    name: providerServer?.name ?? local.displayName,
    type: providerServer?.type ?? "",
    status: providerServer?.status ?? "unknown",
    ip: providerServer?.ip ?? "",
    cpu: providerServer?.cpu ?? "",
    ram: providerServer?.ram ?? "",
    disk: providerServer?.disk ?? "",
    os: providerServer?.os ?? "",
    location: providerServer?.location ?? "",
  };
  return dto;
}

async function findProvider(
  workspaceId: string,
  providerId: string,
): Promise<ServerProvider | null> {
  const providers = await getServerProvidersForWorkspace(workspaceId);
  return providers.find((provider) => provider.id === providerId) ?? null;
}

function unsupportedProviderResult<T>(providerId: string): ProviderResult<T> {
  return {
    ok: false,
    kind: "error",
    message: `Unknown server provider: ${providerId}`,
  };
}

export async function power(
  workspaceId: string,
  providerId: string,
  id: string,
  action: "start" | "stop" | "restart",
): Promise<ProviderResult<void>> {
  const provider = await findProvider(workspaceId, providerId);
  if (!provider) return unsupportedProviderResult(providerId);
  const result = await provider.power(id, action);
  if (!result.ok) {
    logError(
      workspaceId,
      `provider:${provider.providerType.toLowerCase()}`,
      result.kind === "error"
        ? result.message
        : `Unsupported: ${result.operation}`,
      JSON.stringify({ operation: "power", action, serverId: id }),
    );
  } else {
    // The machine's status just changed and the cached listing still carries
    // the old one — let the next read refetch this credential.
    await snapshots.markStale(providerId, KIND);
  }
  return result;
}
