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
import type { CategoryWithBookmarks } from "@/lib/services/bookmarks";
import { categoriesApi } from "./api";

interface DeleteCategoryDialogProps {
  category: CategoryWithBookmarks | null;
  onOpenChange: (open: boolean) => void;
  onDeleted: () => void;
}

function bookmarkWord(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return "закладка";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return "закладки";
  }
  return "закладок";
}

// AC-BM-003/004 (design.md §3.3.3): warns of cascade before any request
// fires; copy is dynamic on the category's current bookmark count.
export function DeleteCategoryDialog({
  category,
  onOpenChange,
  onDeleted,
}: DeleteCategoryDialogProps) {
  const [submitting, setSubmitting] = useState(false);
  const count = category?.bookmarks.length ?? 0;

  async function handleConfirm() {
    if (!category) return;
    setSubmitting(true);
    try {
      await categoriesApi.remove(category.id);
      toast.success(
        count > 0
          ? `Категория и ${count} ${bookmarkWord(count)} внутри неё удалены.`
          : "Категория удалена.",
      );
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
            {count > 0
              ? `В этой категории ${count} ${bookmarkWord(count)}. При удалении категории также будут удалены все закладки внутри неё. Это действие нельзя отменить.`
              : "Эта категория пуста. Это действие нельзя отменить."}
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
