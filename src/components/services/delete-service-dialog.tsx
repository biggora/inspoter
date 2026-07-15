"use client";

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
  const [submitting, setSubmitting] = useState(false);

  async function handleConfirm() {
    if (!service) return;
    setSubmitting(true);
    try {
      await servicesApi.remove(service.id);
      toast.success("Сервис удалён.");
      onDeleted();
    } catch {
      toast.error("Не удалось удалить сервис. Попробуйте снова.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AlertDialog open={service !== null} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Удалить «{service?.name}»?</AlertDialogTitle>
          <AlertDialogDescription>
            Сервис и вся история его проверок будут удалены без возможности
            восстановления.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Отмена</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={handleConfirm}
            disabled={submitting}
          >
            {submitting ? "Удаление…" : "Удалить"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
