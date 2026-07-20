"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import {
  outgoingWebhooksApi,
  type OutgoingWebhookDto,
  type WebhookDeliveryDto,
  type WebhookDeliveryStatusValue,
} from "./outgoing-webhooks-api";
import {
  DELIVERY_STATUS_LABEL_KEY,
  EVENT_LABEL_KEY,
} from "./outgoing-webhooks-format";

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const STATUS_CLASSES: Record<WebhookDeliveryStatusValue, string> = {
  DELIVERED: "bg-(--success-bg) text-(--success-text)",
  FAILED: "bg-destructive/15 text-destructive",
  PENDING: "bg-muted text-muted-foreground",
  DELIVERING: "bg-muted text-muted-foreground",
};

interface OutgoingWebhookDeliveriesProps {
  webhook: OutgoingWebhookDto | null;
  onOpenChange: (open: boolean) => void;
}

// Delivery history for a single subscription, opened from the webhooks table.
// FAILED rows can be re-queued for immediate re-send.
export function OutgoingWebhookDeliveries({
  webhook,
  onOpenChange,
}: OutgoingWebhookDeliveriesProps) {
  const t = useTranslations("settings");
  const [deliveries, setDeliveries] = useState<WebhookDeliveryDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [retryingId, setRetryingId] = useState<string | null>(null);

  const webhookId = webhook?.id ?? null;

  // Reset to a loading state when the target webhook changes, in render (not an
  // effect) so load() below never calls setState synchronously from an effect
  // (react-hooks/set-state-in-effect) — mirrors webhook-tokens-view.
  const [prevWebhookId, setPrevWebhookId] = useState(webhookId);
  if (webhookId !== prevWebhookId) {
    setPrevWebhookId(webhookId);
    setDeliveries([]);
    setLoading(webhookId !== null);
  }

  const load = useCallback(() => {
    if (!webhookId) return Promise.resolve();
    return outgoingWebhooksApi
      .listDeliveries(webhookId)
      .then((data) => {
        setDeliveries(data.items);
      })
      .catch(() => toast.error(t("loadDeliveriesError")))
      .finally(() => setLoading(false));
  }, [webhookId, t]);

  useEffect(() => {
    if (webhookId) load();
  }, [webhookId, load]);

  async function handleRetry(deliveryId: string) {
    if (!webhookId) return;
    setRetryingId(deliveryId);
    try {
      await outgoingWebhooksApi.retryDelivery(webhookId, deliveryId);
      toast.success(t("deliveryRetriedToast"));
      await load();
    } catch {
      toast.error(t("retryDeliveryError"));
    } finally {
      setRetryingId(null);
    }
  }

  return (
    <Dialog open={webhook !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {t("deliveriesTitle", { name: webhook?.name ?? "" })}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : deliveries.length === 0 ? (
          <EmptyState
            icon="ri-send-plane-line"
            title={t("emptyDeliveriesTitle")}
            description={t("emptyDeliveriesDescription")}
          />
        ) : (
          <div className="max-h-[60vh] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("eventsHeader")}</TableHead>
                  <TableHead>{t("statusHeader")}</TableHead>
                  <TableHead>{t("attemptsHeader")}</TableHead>
                  <TableHead>{t("statusCodeHeader")}</TableHead>
                  <TableHead>{t("lastAttemptHeader")}</TableHead>
                  <TableHead className="text-right">
                    {t("actionsHeader")}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {deliveries.map((delivery) => (
                  <TableRow key={delivery.id}>
                    <TableCell className="text-xs text-muted-foreground">
                      {t(EVENT_LABEL_KEY[delivery.event])}
                    </TableCell>
                    <TableCell>
                      <Badge className={cn(STATUS_CLASSES[delivery.status])}>
                        {t(DELIVERY_STATUS_LABEL_KEY[delivery.status])}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {delivery.attempts}/{delivery.maxAttempts}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {delivery.lastStatusCode ?? "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDateTime(delivery.lastAttemptAt)}
                    </TableCell>
                    <TableCell className="text-right">
                      {delivery.status === "FAILED" && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleRetry(delivery.id)}
                          disabled={retryingId === delivery.id}
                        >
                          {retryingId === delivery.id
                            ? t("retryingLabel")
                            : t("retryButton")}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
