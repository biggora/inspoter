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
          ? `Category and ${count} bookmark${count === 1 ? "" : "s"} deleted.`
          : "Category deleted.",
      );
      onDeleted();
    } catch {
      toast.error("Couldn't delete category. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AlertDialog open={category !== null} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete &ldquo;{category?.name}&rdquo;?</AlertDialogTitle>
          <AlertDialogDescription>
            {count > 0
              ? `This category contains ${count} bookmark${count === 1 ? "" : "s"}. Deleting it will also delete all bookmarks inside it. This cannot be undone.`
              : "This category is empty. Deleting it cannot be undone."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={handleConfirm} disabled={submitting}>
            {submitting ? "Deleting…" : "Delete category"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
