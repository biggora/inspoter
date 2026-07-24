import { db } from "@/lib/db";
import type { ServerMetricSnapshot } from "@/generated/prisma/client";
import { getServerProvidersForWorkspace } from "@/lib/providers/servers";
import type { Server, ServerProvider } from "@/lib/providers/servers/types";
import type { ProviderResult } from "@/lib/providers/result";

// Servers service — aggregates all hosting providers with per-provider
// error isolation: a failing/unreachable provider never takes down the
// whole listing (mirrors domains.ts). Slice 2 additionally reconciles
// provider inventory into LocalServer rows and composes each row with its
// VPS Metrics Agent state (ADR: provider + agent-only servers share one
// listing surface).

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

export async function listServers(
  workspaceId: string,
): Promise<ComposedServersResponse> {
  const providers = await getServerProvidersForWorkspace(workspaceId);
  const settled = await Promise.allSettled(
    providers.map((provider) => provider.listServers()),
  );

  const successfulProviders = new Map<string, Server[]>();
  const failedProviders: {
    providerId: string;
    label: string;
    error: string;
  }[] = [];
  const providerServerMap = new Map<string, Server>();

  settled.forEach((result, index) => {
    const provider = providers[index];
    if (result.status === "rejected") {
      failedProviders.push({
        providerId: provider.id,
        label: provider.label,
        error: String(result.reason),
      });
      return;
    }
    const providerResult = result.value;
    if (!providerResult.ok) {
      failedProviders.push({
        providerId: provider.id,
        label: provider.label,
        error:
          providerResult.kind === "error"
            ? providerResult.message
            : `Operation not supported: ${providerResult.operation}`,
      });
      return;
    }
    successfulProviders.set(provider.id, providerResult.data);
    for (const server of providerResult.data) {
      providerServerMap.set(`${provider.id}:${server.id}`, server);
    }
  });

  for (const [credentialId, servers] of successfulProviders) {
    await db.$transaction((tx) =>
      reconcileProviderServers(tx, workspaceId, credentialId, servers),
    );
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

  return { servers, providerErrors: failedProviders };
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
  return provider.power(id, action);
}
