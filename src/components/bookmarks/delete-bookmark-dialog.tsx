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
import type { Bookmark } from "@/generated/prisma/client";
import { bookmarksApi } from "./api";

interface DeleteBookmarkDialogProps {
  bookmark: Bookmark | null;
  onOpenChange: (open: boolean) => void;
  onDeleted: () => void;
}

// AC-BM-010 (design.md §3.3.5): lighter-weight confirm, no cascade wording.
export function DeleteBookmarkDialog({
  bookmark,
  onOpenChange,
  onDeleted,
}: DeleteBookmarkDialogProps) {
  const [submitting, setSubmitting] = useState(false);

  async function handleConfirm() {
    if (!bookmark) return;
    setSubmitting(true);
    try {
      await bookmarksApi.remove(bookmark.id);
      toast.success("Bookmark deleted.");
      onDeleted();
    } catch {
      toast.error("Couldn't delete bookmark. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AlertDialog open={bookmark !== null} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Delete &ldquo;{bookmark?.name}&rdquo;?
          </AlertDialogTitle>
          <AlertDialogDescription>
            This bookmark will be permanently removed.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={handleConfirm}
            disabled={submitting}
          >
            {submitting ? "Deleting…" : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
