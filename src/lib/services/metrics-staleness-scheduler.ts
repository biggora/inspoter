import { env } from "@/lib/config/env";
import { db } from "@/lib/db";
import { logError } from "@/lib/services/logs";
import * as alertsService from "./alerts";

const STALE_THRESHOLD_MS = 180_000;

const globalForScheduler = globalThis as unknown as {
  __inspoterMetricsStalenessSchedulerStarted?: boolean;
};

let tickInFlight = false;

async function tick(): Promise<void> {
  if (tickInFlight) return;
  tickInFlight = true;
  try {
    const now = Date.now();
    const staleThreshold = new Date(now - STALE_THRESHOLD_MS);

    // Detect live → stale transitions
    const goneStale = await db.localServer.findMany({
      where: {
        metricsAlertState: "live",
        metricSnapshot: { receivedAt: { lt: staleThreshold } },
      },
      select: { id: true, workspaceId: true, displayName: true },
    });

    for (const server of goneStale) {
      // TODO(i18n)
      alertsService
        .create(server.workspaceId, {
          category: "Серверы",
          severity: "warning",
          source: server.displayName,
          message: "Метрики агента не поступают",
        })
        .catch((err) => {
          // Alert write failed — record it so the lost "agent went stale"
          // notification isn't silently invisible.
          logError(
            server.workspaceId,
            "alerts",
            "Failed to create stale-metrics alert",
            JSON.stringify({
              serverId: server.id,
              transition: "live_to_stale",
              error: err instanceof Error ? err.message : String(err),
            }),
          );
        });
      await db.localServer.update({
        where: { id: server.id },
        data: { metricsAlertState: "stale" },
      });
    }

    // Detect stale → live transitions (agent resumed sending)
    const recovered = await db.localServer.findMany({
      where: {
        metricsAlertState: "stale",
        metricSnapshot: { receivedAt: { gte: staleThreshold } },
      },
      select: { id: true, workspaceId: true, displayName: true },
    });

    for (const server of recovered) {
      // TODO(i18n)
      alertsService
        .create(server.workspaceId, {
          category: "Серверы",
          severity: "info",
          source: server.displayName,
          message: "Метрики агента восстановлены",
        })
        .catch((err) => {
          // Alert write failed — record it so the lost "agent recovered"
          // notification isn't silently invisible.
          logError(
            server.workspaceId,
            "alerts",
            "Failed to create metrics-recovered alert",
            JSON.stringify({
              serverId: server.id,
              transition: "stale_to_live",
              error: err instanceof Error ? err.message : String(err),
            }),
          );
        });
      await db.localServer.update({
        where: { id: server.id },
        data: { metricsAlertState: "live" },
      });
    }
  } catch (error) {
    console.error("[metrics-staleness-scheduler] tick failed:", error);
  } finally {
    tickInFlight = false;
  }
}

export function startMetricsStalenessScheduler(): void {
  if (globalForScheduler.__inspoterMetricsStalenessSchedulerStarted) return;
  globalForScheduler.__inspoterMetricsStalenessSchedulerStarted = true;

  setInterval(() => {
    void tick();
  }, env.METRICS_STALENESS_TICK_MS);
}
