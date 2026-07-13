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
import { messageCategoriesApi, type MessageCategoryDto } from "./api";

interface DeleteCategoryDialogProps {
  category: MessageCategoryDto | null;
  onOpenChange: (open: boolean) => void;
  onDeleted: () => void;
}

// AC-MSG-003: no-orphan-invariant confirm copy — deliberately doesn't
// commit to cascade-vs-reassign wording since that's an architecture
// decision (design.md §6.4).
export function DeleteCategoryDialog({
  category,
  onOpenChange,
  onDeleted,
}: DeleteCategoryDialogProps) {
  const [submitting, setSubmitting] = useState(false);

  async function handleConfirm() {
    if (!category) return;
    setSubmitting(true);
    try {
      await messageCategoriesApi.remove(category.id);
      toast.success("Категория удалена.");
      onDeleted();
    } catch {
      toast.error("Не удалось удалить категорию. Попробуйте снова.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AlertDialog open={category !== null} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Удалить «{category?.name}»?
          </AlertDialogTitle>
          <AlertDialogDescription>
            Каналы этой категории будут удалены. Это действие необратимо.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Отмена</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={handleConfirm}
            disabled={submitting}
          >
            {submitting ? "Удаление…" : "Удалить категорию"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
