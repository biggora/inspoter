import { db } from "@/lib/db";
import * as alertsService from "./alerts";

// TODO(i18n): category/message are persisted as literal Russian — migrating
// to translation keys needs a data migration for existing rows.

export async function updateProviderHealth(
  workspaceId: string,
  credentialId: string,
  category: string,
  providerLabel: string,
  error: string | null,
): Promise<void> {
  const credential = await db.providerCredential.findFirst({
    where: { id: credentialId, workspaceId },
    select: { lastSyncError: true },
  });
  if (!credential) return;

  const wasErroring = credential.lastSyncError !== null;
  const isErroring = error !== null;

  if (isErroring && !wasErroring) {
    await alertsService.create(workspaceId, {
      category,
      severity: "warning",
      source: providerLabel,
      message: `Ошибка провайдера: ${error.slice(0, 200)}`,
    });
  } else if (!isErroring && wasErroring) {
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
}
