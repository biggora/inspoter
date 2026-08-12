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
import { contactsApi, type ContactListItem } from "./api";

// One dialog for both "delete this row" and "delete the selection": the
// wording differs, the confirmation does not.
export function DeleteContactsDialog({
  contacts,
  onOpenChange,
  onDeleted,
}: {
  contacts: ContactListItem[] | null;
  onOpenChange: (open: boolean) => void;
  onDeleted: () => void;
}) {
  const t = useTranslations("contacts");
  const [submitting, setSubmitting] = useState(false);

  async function handleConfirm(): Promise<void> {
    if (contacts === null || contacts.length === 0) return;
    setSubmitting(true);
    try {
      if (contacts.length === 1) {
        await contactsApi.remove(contacts[0].id);
        toast.success(t("deletedToast"));
      } else {
        const { affected } = await contactsApi.bulk(
          contacts.map((contact) => contact.id),
          { type: "delete" },
        );
        toast.success(t("bulkDeletedToast", { count: affected }));
      }
      onDeleted();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("genericError"));
    } finally {
      setSubmitting(false);
    }
  }

  const single = contacts?.length === 1 ? contacts[0] : null;

  return (
    <AlertDialog open={contacts !== null} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("deleteTitle")}</AlertDialogTitle>
          <AlertDialogDescription>
            {single !== null
              ? t("deleteDescription", {
                  name: single.displayName || t("detailNoName"),
                })
              : t("deleteManyDescription", { count: contacts?.length ?? 0 })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("cancelButton")}</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={handleConfirm}
            disabled={submitting}
          >
            {submitting ? t("deletingButton") : t("deleteConfirmButton")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
