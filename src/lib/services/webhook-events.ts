import type { OutgoingWebhookEvent } from "@/generated/prisma/client";
import { enqueue } from "@/lib/services/outgoingWebhooks";

// Single seam between domain services and the outgoing-webhook queue. Kept in
// its own module (importing only outgoingWebhooks, never a domain service) so
// the emit points below can't create an import cycle. Fire-and-forget: a fan-out
// failure is logged, never propagated — emitting a webhook must never block or
// roll back the domain write that triggered it.
export async function emitWebhookEvent(
  workspaceId: string,
  event: OutgoingWebhookEvent,
  data: Record<string, unknown>,
): Promise<void> {
  try {
    await enqueue(workspaceId, event, data);
  } catch (error) {
    console.error(`[webhook-events] enqueue failed for ${event}:`, error);
  }
}
