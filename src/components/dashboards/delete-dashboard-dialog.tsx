"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { Dashboard } from "@/generated/prisma/client";
import { dashboardsApi } from "./api";

interface DeleteDashboardDialogProps {
  dashboard: Dashboard | null;
  onOpenChange: (open: boolean) => void;
  onDeleted: () => void;
}

export function DeleteDashboardDialog({
  dashboard,
  onOpenChange,
  onDeleted,
}: DeleteDashboardDialogProps) {
  const t = useTranslations("dashboards");
  const [submitting, setSubmitting] = useState(false);

  async function handleConfirm() {
    if (!dashboard) return;
    setSubmitting(true);
    try {
      await dashboardsApi.remove(dashboard.id);
      onDeleted();
    } catch {
      toast.error(t("deleteError"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AlertDialog open={dashboard !== null} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("deleteDialogTitle")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("deleteDialogDescription", { name: dashboard?.name ?? "" })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("cancelButton")}</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={submitting}
            onClick={handleConfirm}
          >
            {t("deleteConfirmButton")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
