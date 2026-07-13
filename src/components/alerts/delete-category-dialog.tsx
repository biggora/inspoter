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
import { alertCategoriesApi, type AlertCategoryDto } from "./api";

interface DeleteCategoryDialogProps {
  category: AlertCategoryDto | null;
  onOpenChange: (open: boolean) => void;
  onDeleted: () => void;
}

// AC-ALR-002: no-orphan-invariant confirm copy, matching the generic
// phrasing used for Messages categories (design.md §6.4/§6.6) since the
// cascade-vs-reassign strategy is an implementation detail.
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
      await alertCategoriesApi.remove(category.id);
      toast.success("Category deleted.");
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
          <AlertDialogTitle>
            Delete &ldquo;{category?.name}&rdquo;?
          </AlertDialogTitle>
          <AlertDialogDescription>
            Alerts in this category will be uncategorized. This cannot be
            undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={handleConfirm}
            disabled={submitting}
          >
            {submitting ? "Deleting…" : "Delete category"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
