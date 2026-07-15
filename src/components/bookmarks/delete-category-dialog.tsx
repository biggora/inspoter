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
import type { Bookmark, Category } from "@/generated/prisma/client";
import { categoriesApi } from "./api";

// Phase 4: this dialog handles deleting either a top-level category (which
// may itself have subcategories — cascade counts both levels) or a
// subcategory (which never has children of its own, so `childCategories`
// is simply absent). One dialog, one shape covers both.
type DeletableCategory = Category & {
  bookmarks: Bookmark[];
  childCategories?: (Category & { bookmarks: Bookmark[] })[];
};

interface DeleteCategoryDialogProps {
  category: DeletableCategory | null;
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

function subcategoryWord(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return "подкатегория";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return "подкатегории";
  }
  return "подкатегорий";
}

// AC-BM-003/004 (design.md §3.3.3): warns of cascade before any request
// fires; copy is dynamic on the category's current bookmark count, and
// (Phase 4) on its subcategory count and their nested bookmark count.
export function DeleteCategoryDialog({
  category,
  onOpenChange,
  onDeleted,
}: DeleteCategoryDialogProps) {
  const [submitting, setSubmitting] = useState(false);
  const directCount = category?.bookmarks.length ?? 0;
  const childCategories = category?.childCategories ?? [];
  const subcategoryCount = childCategories.length;
  const nestedBookmarkCount = childCategories.reduce(
    (sum, child) => sum + child.bookmarks.length,
    0,
  );
  const totalBookmarkCount = directCount + nestedBookmarkCount;

  async function handleConfirm() {
    if (!category) return;
    setSubmitting(true);
    try {
      await categoriesApi.remove(category.id);
      if (subcategoryCount > 0) {
        toast.success(
          `Категория, ${subcategoryCount} ${subcategoryWord(subcategoryCount)} и ${totalBookmarkCount} ${bookmarkWord(totalBookmarkCount)} внутри них удалены.`,
        );
      } else if (directCount > 0) {
        toast.success(
          `Категория и ${directCount} ${bookmarkWord(directCount)} внутри неё удалены.`,
        );
      } else {
        toast.success("Категория удалена.");
      }
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
            {subcategoryCount > 0
              ? `В этой категории ${directCount} ${bookmarkWord(directCount)} и ${subcategoryCount} ${subcategoryWord(subcategoryCount)} (в них ещё ${nestedBookmarkCount} ${bookmarkWord(nestedBookmarkCount)}). При удалении всё это будет удалено. Это действие нельзя отменить.`
              : directCount > 0
                ? `В этой категории ${directCount} ${bookmarkWord(directCount)}. При удалении категории также будут удалены все закладки внутри неё. Это действие нельзя отменить.`
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
