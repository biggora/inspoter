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
import type { Service } from "@/generated/prisma/client";
import { servicesApi } from "./api";

interface DeleteServiceDialogProps {
  service: Service | null;
  onOpenChange: (open: boolean) => void;
  onDeleted: () => void;
}

// Delete confirmation, same AlertDialog pattern as
// alerts/delete-category-dialog.tsx and bookmarks/delete-bookmark-dialog.tsx.
export function DeleteServiceDialog({
  service,
  onOpenChange,
  onDeleted,
}: DeleteServiceDialogProps) {
  const t = useTranslations("services");
  const [submitting, setSubmitting] = useState(false);

  async function handleConfirm() {
    if (!service) return;
    setSubmitting(true);
    try {
      await servicesApi.remove(service.id);
      toast.success(t("deleteSuccessToast"));
      onDeleted();
    } catch {
      toast.error(t("deleteErrorToast"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AlertDialog open={service !== null} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t("deleteConfirmTitle", { name: service?.name ?? "" })}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t("deleteConfirmDescription")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("cancelButton")}</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={handleConfirm}
            disabled={submitting}
          >
            {submitting ? t("deletingLabel") : t("deleteButton")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
