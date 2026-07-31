"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef } from "react";

import type { ServerStatus } from "@/lib/providers/servers/types";
import { getServer, powerAction, type ProviderServerDto } from "./api";

// Start/stop/restart plus the status polling that follows it, shared by the
// servers grid and a single server's detail page. Providers report the new
// power state only after the machine has actually transitioned, so a power
// call is: optimistic transitional status → request → poll getServer until the
// status settles → notify.
//
// The hook owns the pending state and its timers; what to do with each update
// is the caller's (a card in a list replaces one row, the detail page replaces
// its only server).

export type PowerActionType = "start" | "stop" | "restart";

export const TRANSITIONAL_STATUSES: ServerStatus[] = [
  "starting",
  "stopping",
  "restarting",
];

const POLL_INTERVAL_MS = 2000;

const TRANSITIONAL_STATUS_BY_ACTION: Record<PowerActionType, ServerStatus> = {
  start: "starting",
  stop: "stopping",
  restart: "restarting",
};

export interface UseServerPowerActionOptions {
  /** Show the transitional status before the provider confirms it. */
  applyStatus: (localServerId: string, status: ServerStatus) => void;
  /** A fresh server payload arrived from the provider. */
  applyServer: (server: ProviderServerDto) => void;
  /** The status settled on a non-transitional value. */
  onSettled: (server: ProviderServerDto) => void;
  onError: (localServerId: string, message: string) => void;
}

export function useServerPowerAction({
  applyStatus,
  applyServer,
  onSettled,
  onError,
}: UseServerPowerActionOptions) {
  const t = useTranslations("servers");
  const pollingRef = useRef<Map<string, ReturnType<typeof setInterval>>>(
    new Map(),
  );

  useEffect(() => {
    const pollers = pollingRef.current;
    return () => {
      pollers.forEach((interval) => clearInterval(interval));
      pollers.clear();
    };
  }, []);

  return useCallback(
    async (server: ProviderServerDto, action: PowerActionType) => {
      const previousStatus = server.status as ServerStatus;
      applyStatus(server.localServerId, TRANSITIONAL_STATUS_BY_ACTION[action]);

      try {
        await powerAction(server.providerId, server.remoteServerId, action);
      } catch (err) {
        applyStatus(server.localServerId, previousStatus);
        onError(
          server.localServerId,
          err instanceof Error ? err.message : t("actionError"),
        );
        return;
      }

      const existing = pollingRef.current.get(server.localServerId);
      if (existing) clearInterval(existing);

      const interval = setInterval(async () => {
        try {
          const updated = await getServer(
            server.providerId,
            server.remoteServerId,
          );
          applyServer(updated);
          if (!TRANSITIONAL_STATUSES.includes(updated.status as ServerStatus)) {
            clearInterval(interval);
            pollingRef.current.delete(server.localServerId);
            onSettled(server);
          }
        } catch (err) {
          clearInterval(interval);
          pollingRef.current.delete(server.localServerId);
          onError(
            server.localServerId,
            err instanceof Error ? err.message : t("statusUpdateError"),
          );
        }
      }, POLL_INTERVAL_MS);
      pollingRef.current.set(server.localServerId, interval);
    },
    [applyServer, applyStatus, onError, onSettled, t],
  );
}
