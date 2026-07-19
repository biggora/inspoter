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

// AC-BM-003/004 (design.md §3.3.3): warns of cascade before any request
// fires; copy is dynamic on the category's current bookmark count, and
// (Phase 4) on its subcategory count and their nested bookmark count.
export function DeleteCategoryDialog({
  category,
  onOpenChange,
  onDeleted,
}: DeleteCategoryDialogProps) {
  const t = useTranslations("bookmarks");
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
          t("deleteCategoryToastWithSubcategories", {
            subcategoryCount,
            totalBookmarkCount,
          }),
        );
      } else if (directCount > 0) {
        toast.success(
          t("deleteCategoryToastBookmarksOnly", { directCount }),
        );
      } else {
        toast.success(t("deleteCategoryToastEmpty"));
      }
      onDeleted();
    } catch {
      toast.error(t("deleteCategoryError"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AlertDialog open={category !== null} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t("deleteTitle", { name: category?.name ?? "" })}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {subcategoryCount > 0
              ? t("deleteWithSubcategoriesDescription", {
                  directCount,
                  subcategoryCount,
                  nestedBookmarkCount,
                })
              : directCount > 0
                ? t("deleteBookmarksOnlyDescription", { directCount })
                : t("deleteEmptyCategoryDescription")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("cancelButton")}</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={handleConfirm}
            disabled={submitting}
          >
            {submitting ? t("deletingButton") : t("deleteCategoryAction")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
