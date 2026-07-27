import { db } from "@/lib/db";
import { logError, logInfo } from "@/lib/services/logs";
import * as alertsService from "./alerts";

// TODO(i18n): category/message are persisted as literal Russian — migrating
// to translation keys needs a data migration for existing rows.

/**
 * What this poll changed about the provider's health:
 * - "began"     — it was fine, now it is failing
 * - "recovered" — it was failing, now it is fine
 * - "unchanged" — same as last time
 *
 * Callers use this to log a failure once per outage instead of once per poll.
 * That matters now that the background scheduler polls on a timer: a provider
 * that stays down would otherwise write an identical log entry every tick and
 * bury the Logs section.
 */
export type ProviderHealthTransition = "began" | "recovered" | "unchanged";

export async function updateProviderHealth(
  workspaceId: string,
  credentialId: string,
  category: string,
  providerLabel: string,
  error: string | null,
): Promise<ProviderHealthTransition> {
  const credential = await db.providerCredential.findFirst({
    where: { id: credentialId, workspaceId },
    select: { lastSyncError: true },
  });
  if (!credential) return "unchanged";

  const wasErroring = credential.lastSyncError !== null;
  const isErroring = error !== null;
  const transition: ProviderHealthTransition =
    isErroring && !wasErroring
      ? "began"
      : !isErroring && wasErroring
        ? "recovered"
        : "unchanged";

  if (error !== null && transition === "began") {
    await alertsService.create(workspaceId, {
      category,
      severity: "warning",
      source: providerLabel,
      message: `Ошибка провайдера: ${error.slice(0, 200)}`,
    });
  } else if (transition === "recovered") {
    await alertsService.create(workspaceId, {
      category,
      severity: "info",
      source: providerLabel,
      message: "Провайдер снова доступен",
    });
  }

  await db.providerCredential.update({
    where: { id: credentialId },
    data: isErroring
      ? {
          lastSyncError: error.slice(0, 500),
          ...(!wasErroring ? { lastSyncErrorAt: new Date() } : {}),
        }
      : {
          lastSyncError: null,
          lastSyncErrorAt: null,
          lastSyncOkAt: new Date(),
        },
  });

  return transition;
}

export interface SyncOutcome {
  credentialId: string;
  providerType: string;
  error: string | null;
}

/**
 * Records the health of one refresh pass and writes the matching Logs entry.
 *
 * This is the single place the three `refresh*` functions report to, and the
 * reason logging lives here rather than inline at each provider call: the
 * entry is written only when the health state actually flips. A provider that
 * stays unreachable is polled every tick, and logging each poll would add
 * ~288 identical entries per credential per day at the default 5-minute TTL.
 */
export async function recordSyncOutcomes(
  workspaceId: string,
  category: string,
  operation: string,
  outcomes: SyncOutcome[],
): Promise<void> {
  await Promise.all(
    outcomes.map(async (outcome) => {
      const source = `provider:${outcome.providerType.toLowerCase()}`;
      const transition = await updateProviderHealth(
        workspaceId,
        outcome.credentialId,
        category,
        outcome.providerType,
        outcome.error,
      ).catch((err) => {
        // Runs inside Promise.all alongside sibling providers — must not
        // reject, or one provider's health-write failure would take down the
        // whole refresh pass.
        logError(
          workspaceId,
          "provider-health",
          String(err),
          JSON.stringify({
            operation: "updateProviderHealth",
            credentialId: outcome.credentialId,
          }),
        );
        return "unchanged" as ProviderHealthTransition;
      });

      const details = JSON.stringify({
        operation,
        credentialId: outcome.credentialId,
      });
      if (transition === "began" && outcome.error) {
        logError(workspaceId, source, outcome.error, details);
      } else if (transition === "recovered") {
        logInfo(workspaceId, source, "Провайдер снова доступен", details);
      }
    }),
  );
}
