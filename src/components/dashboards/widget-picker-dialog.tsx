"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Icon } from "@/components/ui/icon";
import { Spinner } from "@/components/ui/spinner";
import type {
  DashboardWidget,
  DashboardWidgetKind,
} from "@/generated/prisma/client";
import { widgetsApi } from "./api";
import { WIDGET_CATALOG } from "./widget-catalog";

interface WidgetPickerDialogProps {
  dashboardId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The created widget, so the caller can open its settings straight away. */
  onAdded: (widget: DashboardWidget) => void;
}

// The catalogue of widget kinds. Picking one creates it immediately with the
// kind's defaults, at the first free grid slot; the caller then opens its
// settings dialog. Adding first and configuring second means a widget the
// operator abandons mid-configuration is still on the board in a working default
// state, rather than lost.
export function WidgetPickerDialog({
  dashboardId,
  open,
  onOpenChange,
  onAdded,
}: WidgetPickerDialogProps) {
  const t = useTranslations("dashboards");
  const [pending, setPending] = useState<DashboardWidgetKind | null>(null);

  async function handlePick(kind: DashboardWidgetKind) {
    setPending(kind);
    try {
      onAdded(await widgetsApi.add(dashboardId, kind));
    } catch {
      toast.error(t("widgetAddError"));
    } finally {
      setPending(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("widgetPickerTitle")}</DialogTitle>
          <DialogDescription>{t("widgetPickerDescription")}</DialogDescription>
        </DialogHeader>
        <div className="grid max-h-[60vh] grid-cols-1 gap-2 overflow-auto sm:grid-cols-2">
          {WIDGET_CATALOG.map((entry) => (
            <Button
              key={entry.kind}
              type="button"
              variant="outline"
              disabled={pending !== null}
              onClick={() => handlePick(entry.kind)}
              className="h-auto items-start gap-3 px-3 py-3 text-left"
            >
              <span className="shell-icon-tile shrink-0">
                {pending === entry.kind ? (
                  <Spinner aria-hidden />
                ) : (
                  <Icon name={entry.icon} aria-hidden />
                )}
              </span>
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="font-medium">{t(entry.titleKey)}</span>
                <span className="text-xs font-normal whitespace-normal text-muted-foreground">
                  {t(entry.descriptionKey)}
                </span>
              </span>
            </Button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
