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
  const t = useTranslations("bookmarks");
  const [submitting, setSubmitting] = useState(false);

  async function handleConfirm() {
    if (!bookmark) return;
    setSubmitting(true);
    try {
      await bookmarksApi.remove(bookmark.id);
      toast.success(t("bookmarkDeletedToast"));
      onDeleted();
    } catch {
      toast.error(t("deleteBookmarkError"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AlertDialog open={bookmark !== null} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t("deleteTitle", { name: bookmark?.name ?? "" })}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t("deleteBookmarkDescription")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("cancelButton")}</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={handleConfirm}
            disabled={submitting}
          >
            {submitting ? t("deletingButton") : t("deleteAction")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
