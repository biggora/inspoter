"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

import { Icon } from "@/components/ui/icon";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { ServerStatus } from "@/lib/providers/servers/types";
import type { ProviderServerDto } from "./api";
import {
  TRANSITIONAL_STATUSES,
  type PowerActionType,
} from "./use-server-power-action";

// The power controls of one server — the buttons and their confirmations —
// shared by the card in the grid and the detail page header. Which actions
// exist follows from the current status, and every one of them is confirmed in
// a modal before it reaches the provider (design.md §5.3).

interface PowerCardAction {
  action: PowerActionType;
  icon: string;
  labelKey: string;
  confirmTitleKey: string;
  confirmTextKey: string;
  confirmButtonKey: string;
}

const PENDING_ACTION_BY_STATUS: Partial<Record<ServerStatus, PowerActionType>> =
  {
    starting: "start",
    stopping: "stop",
    restarting: "restart",
  };

const POWER_ACTIONS_BY_STATUS = {
  running: ["restart", "stop"],
  stopped: ["start"],
  starting: ["start"],
  stopping: ["stop"],
  restarting: ["restart"],
  unknown: ["start"],
} as const satisfies Record<ServerStatus, readonly PowerActionType[]>;

const PENDING_ACTION_LABEL_KEYS: Record<PowerActionType, string> = {
  start: "pendingStart",
  stop: "pendingStop",
  restart: "pendingRestart",
};

const POWER_ACTION_CONFIG: Record<
  PowerActionType,
  Omit<PowerCardAction, "action">
> = {
  start: {
    icon: "ri-play-circle-line",
    labelKey: "startAction",
    confirmTitleKey: "startConfirmTitle",
    confirmTextKey: "startConfirmText",
    confirmButtonKey: "confirmButton",
  },
  stop: {
    icon: "ri-stop-circle-line",
    labelKey: "stopAction",
    confirmTitleKey: "stopConfirmTitle",
    confirmTextKey: "stopConfirmText",
    confirmButtonKey: "stopConfirmButton",
  },
  restart: {
    icon: "ri-restart-line",
    labelKey: "restartAction",
    confirmTitleKey: "restartConfirmTitle",
    confirmTextKey: "restartConfirmText",
    confirmButtonKey: "confirmButton",
  },
};

export function getAvailableActions(
  server: ProviderServerDto,
): PowerCardAction[] {
  const status = server.status as ServerStatus;
  const actions = POWER_ACTIONS_BY_STATUS[status] ?? [];
  return actions.map((action) => ({
    action,
    ...POWER_ACTION_CONFIG[action],
  }));
}

export function ServerPowerActions({
  server,
  onAction,
  /**
   * Where focus goes after a confirmed action, when the trigger itself is
   * about to become a pending, disabled button (the grid hands back its card).
   * Falls back to the trigger, as a dismissed dialog should.
   */
  confirmedFocus,
}: {
  server: ProviderServerDto;
  onAction: (server: ProviderServerDto, action: PowerActionType) => void;
  confirmedFocus?: () => HTMLElement | null;
}) {
  const t = useTranslations("servers");
  const [pendingAction, setPendingAction] = useState<PowerActionType | null>(
    null,
  );
  const activeTriggerRef = useRef<HTMLButtonElement>(null);
  const confirmingRef = useRef(false);

  const status = server.status as ServerStatus;
  const busy = TRANSITIONAL_STATUSES.includes(status);
  const busyAction = PENDING_ACTION_BY_STATUS[status];
  const availableActions = getAvailableActions(server);

  useEffect(() => {
    if (pendingAction === null && confirmingRef.current) {
      confirmingRef.current = false;
      confirmedFocus?.()?.focus();
    }
  }, [confirmedFocus, pendingAction]);

  const handleConfirm = (action: PowerActionType) => {
    if (confirmingRef.current) return;
    confirmingRef.current = true;
    setPendingAction(null);
    onAction(server, action);
  };

  if (availableActions.length === 0) {
    return busy ? null : (
      <span className="text-xs text-foreground-400">
        {t("noActionsAvailable")}
      </span>
    );
  }

  return (
    <>
      {availableActions.map((act) => {
        const actionBusy = busy && busyAction === act.action;

        return (
          <AlertDialog
            key={act.action}
            open={pendingAction === act.action}
            onOpenChange={(open) => {
              if (open) {
                confirmingRef.current = false;
                setPendingAction(act.action);
              } else if (pendingAction === act.action) {
                setPendingAction(null);
              }
            }}
          >
            <AlertDialogTrigger
              render={
                <Button
                  variant={act.action === "stop" ? "destructive" : "outline"}
                  size="sm"
                  disabled={actionBusy}
                  onFocus={(event) => {
                    activeTriggerRef.current = event.currentTarget;
                  }}
                />
              }
            >
              {actionBusy ? (
                <Spinner aria-hidden data-icon="inline-start" />
              ) : (
                <Icon name={act.icon} aria-hidden data-icon="inline-start" />
              )}
              {actionBusy
                ? t(PENDING_ACTION_LABEL_KEYS[act.action])
                : t(act.labelKey)}
            </AlertDialogTrigger>
            <AlertDialogContent
              finalFocus={() =>
                confirmingRef.current
                  ? (confirmedFocus?.() ?? activeTriggerRef.current)
                  : activeTriggerRef.current
              }
            >
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {t(act.confirmTitleKey, { name: server.name })}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {t(act.confirmTextKey)}
                </AlertDialogDescription>
                {act.action === "stop" && (
                  <p className="text-sm text-muted-foreground">
                    {t("stopConfirmBlastRadius")}
                  </p>
                )}
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t("cancelButton")}</AlertDialogCancel>
                <AlertDialogAction
                  variant={act.action === "stop" ? "destructive" : "default"}
                  onClick={() => handleConfirm(act.action)}
                >
                  {t(act.confirmButtonKey)}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        );
      })}
    </>
  );
}
