"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
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
import { alertsApi, type AlertDto } from "./api";

interface DeleteAlertDialogProps {
  alert: AlertDto | null;
  onOpenChange: (open: boolean) => void;
  onDeleted: () => void;
}

// AC-ALR-008. Same shape as DeleteCategoryDialog — deletion is irreversible
// and there is no acknowledge/resolve alternative (Q-7).
export function DeleteAlertDialog({
  alert,
  onOpenChange,
  onDeleted,
}: DeleteAlertDialogProps) {
  const t = useTranslations("alerts");
  const [submitting, setSubmitting] = useState(false);

  async function handleConfirm() {
    if (!alert) return;
    setSubmitting(true);
    try {
      await alertsApi.remove(alert.id);
      toast.success(t("alertDeletedToast"));
      onDeleted();
    } catch {
      toast.error(t("deleteAlertError"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AlertDialog open={alert !== null} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("deleteAlertTitle")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("deleteAlertDescription")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("cancelButton")}</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={handleConfirm}
            disabled={submitting}
          >
            {submitting ? t("deletingButton") : t("deleteAlertButton")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
