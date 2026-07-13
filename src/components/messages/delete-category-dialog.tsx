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
            Channels in this category will be removed. This cannot be
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
