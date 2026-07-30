"use client";

import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import type { DashboardWidget } from "@/generated/prisma/client";
import type { WidgetTargets } from "@/lib/services/dashboard-widget-targets";
import { ApiError, widgetsApi } from "./api";
import { catalogEntry } from "./widget-catalog";
import { WidgetConfigFields } from "./widget-config-fields";

interface WidgetConfigDialogProps {
  dashboardId: string;
  widget: DashboardWidget | null;
  targets: WidgetTargets;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

export function WidgetConfigDialog({
  dashboardId,
  widget,
  targets,
  onOpenChange,
  onSaved,
}: WidgetConfigDialogProps) {
  const t = useTranslations("dashboards");
  const [config, setConfig] = useState<Record<string, unknown>>({});
  const [submitting, setSubmitting] = useState(false);

  // Seed the form from the widget's stored config whenever the target changes —
  // the same render-time reset the other dialogs use instead of an effect.
  const [prevWidget, setPrevWidget] = useState(widget);
  if (widget !== prevWidget) {
    setPrevWidget(widget);
    setConfig(
      widget && widget.config && typeof widget.config === "object"
        ? { ...(widget.config as Record<string, unknown>) }
        : {},
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!widget) return;
    setSubmitting(true);
    try {
      // An empty custom title means "use the kind's name", which the schema
      // expresses as an absent field rather than an empty string.
      const payload = { ...config };
      if (typeof payload.title === "string" && payload.title.trim() === "") {
        delete payload.title;
      }
      await widgetsApi.updateConfig(dashboardId, widget.id, payload);
      onSaved();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("widgetSaveError"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={widget !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t("widgetConfigTitle", {
              widget: widget ? t(catalogEntry(widget.kind).titleKey) : "",
            })}
          </DialogTitle>
        </DialogHeader>
        {widget && (
          <form
            onSubmit={handleSubmit}
            noValidate
            className="flex flex-col gap-4"
          >
            <div className="max-h-[60vh] overflow-auto">
              <WidgetConfigFields
                kind={widget.kind}
                config={config}
                onChange={(patch) =>
                  setConfig((current) => ({ ...current, ...patch }))
                }
                targets={targets}
              />
            </div>
            <DialogFooter>
              <DialogClose render={<Button variant="outline" type="button" />}>
                {t("cancelButton")}
              </DialogClose>
              <Button type="submit" disabled={submitting}>
                {submitting && <Spinner data-icon="inline-start" aria-hidden />}
                {t("saveButton")}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
